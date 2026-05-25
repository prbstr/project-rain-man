/**
 * RiskGuardian — Risk enforcement module
 * 
 * Manages:
 * - Daily drawdown limits (halt trading if exceeded)
 * - Kill switch (emergency flatten all positions)
 * - Pre-trade validation (canTrade checks)
 * - Immutable audit log (RiskEvent)
 */

import { prisma } from '../db/client.js';
import { executeWithCircuitBreaker, createBybitClient } from '../bybit/client.js';
import { decrypt } from '../auth/crypto.js';

/**
 * Pre-trade validation
 * Returns { allowed: boolean, reason?: string }
 * Blocks if: halted, bot disabled, max positions exceeded
 */
export async function canTrade(userId) {
  try {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    if (!settings) {
      return { allowed: false, reason: 'User settings not found' };
    }

    // Check 1: Is user halted?
    if (settings.haltedUntil && new Date() < settings.haltedUntil) {
      const minutesRemaining = Math.ceil(
        (settings.haltedUntil.getTime() - Date.now()) / 60000
      );
      return {
        allowed: false,
        reason: `Trading halted: ${settings.haltReason}. Resumes in ${minutesRemaining}m.`,
      };
    }

    // Check 2: Is bot enabled?
    if (!settings.botEnabled) {
      return { allowed: false, reason: 'Bot is disabled in settings' };
    }

    // Check 3: Open position count
    const openPositions = await prisma.trade.count({
      where: {
        userId,
        status: 'OPEN',
      },
    });

    if (openPositions >= settings.maxOpenPositions) {
      return {
        allowed: false,
        reason: `Max open positions (${settings.maxOpenPositions}) reached. Current: ${openPositions}`,
      };
    }

    return { allowed: true };
  } catch (err) {
    console.error('[RiskGuardian.canTrade] Error:', err.message);
    return {
      allowed: false,
      reason: `Internal error: ${err.message}`,
    };
  }
}

/**
 * Calculate current day's equity drawdown
 * Returns { currentDrawdown%, openingEquity, currentEquity, trades }
 */
export async function calculateDailyDrawdown(userId) {
  try {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    if (!settings) {
      throw new Error('User settings not found');
    }

    // Get today's trades (by UTC midnight)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const todaysTrades = await prisma.trade.findMany({
      where: {
        userId,
        openedAt: { gte: today },
      },
      orderBy: { openedAt: 'asc' },
    });

    if (todaysTrades.length === 0) {
      return {
        currentDrawdown: 0,
        openingEquity: null,
        currentEquity: null,
        trades: [],
      };
    }

    // Calculate equity curve
    // Opening equity = first trade's entry cost
    // After each close, update equity
    let openingEquity = null;
    let currentEquity = null;
    let pnlAccum = 0;

    for (const trade of todaysTrades) {
      if (openingEquity === null) {
        // First trade sets the baseline
        openingEquity = trade.entryPrice * trade.qty;
        currentEquity = openingEquity;
      }

      // If trade is closed, accumulate P&L
      if (trade.status === 'CLOSED' && trade.pnl !== null) {
        pnlAccum += trade.pnl;
        currentEquity = openingEquity + pnlAccum;
      }
    }

    const currentDrawdown =
      openingEquity && currentEquity
        ? ((currentEquity - openingEquity) / openingEquity) * 100
        : 0;

    return {
      currentDrawdown,
      openingEquity,
      currentEquity,
      trades: todaysTrades,
    };
  } catch (err) {
    console.error('[RiskGuardian.calculateDailyDrawdown] Error:', err.message);
    throw err;
  }
}

/**
 * Check if user has exceeded daily drawdown limit
 * If exceeded, halt user and log HALT_DRAWDOWN event
 */
export async function enforceDailyDrawdown(userId) {
  try {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    if (!settings) {
      throw new Error('User settings not found');
    }

    const drawdown = await calculateDailyDrawdown(userId);

    // Drawdown is negative (loss); check if it exceeds the limit (as negative)
    const exceedsLimit =
      drawdown.currentDrawdown < 0 &&
      Math.abs(drawdown.currentDrawdown) > settings.maxDailyDrawdown;

    if (exceedsLimit && !settings.haltedUntil) {
      // Halt for 24 hours
      const haltedUntil = new Date();
      haltedUntil.setHours(haltedUntil.getHours() + 24);

      const reason = `Daily drawdown exceeded ${settings.maxDailyDrawdown}% ` +
        `(current: ${drawdown.currentDrawdown.toFixed(2)}%)`;

      await prisma.userSettings.update({
        where: { userId },
        data: {
          haltedUntil,
          haltReason: reason,
        },
      });

      await logRiskEvent(userId, 'HALT_DRAWDOWN', {
        drawdown: drawdown.currentDrawdown,
        limit: settings.maxDailyDrawdown,
        reason,
      });

      console.log(`[RiskGuardian] User ${userId} HALTED: ${reason}`);
      return { halted: true, reason };
    }

    return { halted: false };
  } catch (err) {
    console.error('[RiskGuardian.enforceDailyDrawdown] Error:', err.message);
    throw err;
  }
}

/**
 * Emergency flatten all positions
 * 1. Cancel all open orders
 * 2. Close all open positions at market
 * 3. Log KILL_SWITCH event with details
 * Returns { success, closed, errors }
 */
export async function emergencyFlattenAll(userId) {
  const details = {
    timestamp: new Date().toISOString(),
    ordersApplied: [],
    closedPositions: [],
    errors: [],
  };

  try {
    // Get user's active API key
    const apiKey = await prisma.userApiKey.findFirst({
      where: {
        userId,
        exchange: 'bybit',
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!apiKey) {
      const err = 'No active Bybit API key found';
      details.errors.push(err);
      await logRiskEvent(userId, 'KILL_SWITCH', details);
      console.error(`[RiskGuardian.emergencyFlattenAll] ${err}`);
      return { success: false, closed: [], errors: [err] };
    }

    // Create client
    const client = createBybitClient(
      apiKey.apiKeyEnc,
      apiKey.apiSecretEnc,
      apiKey.isTestnet
    );

    // Step 1: Cancel all open orders
    let allSymbols = new Set();
    const openTrades = await prisma.trade.findMany({
      where: { userId, status: 'OPEN' },
    });

    for (const trade of openTrades) {
      allSymbols.add(trade.symbol);
    }

    for (const symbol of allSymbols) {
      try {
        const orders = await executeWithCircuitBreaker(client, () =>
          client.fetchOpenOrders(symbol)
        );

        for (const order of orders) {
          try {
            await executeWithCircuitBreaker(client, () =>
              client.cancelOrder(order.id, symbol)
            );
            details.ordersApplied.push({
              symbol,
              orderId: order.id,
              status: 'cancelled',
            });
            console.log(
              `[RiskGuardian.kill] Cancelled order ${order.id} on ${symbol}`
            );
          } catch (err) {
            const errMsg = `Failed to cancel order ${order.id}: ${err.message}`;
            details.errors.push(errMsg);
            console.warn(`[RiskGuardian.kill] ${errMsg}`);
          }
        }
      } catch (err) {
        const errMsg = `Failed to fetch orders for ${symbol}: ${err.message}`;
        details.errors.push(errMsg);
        console.warn(`[RiskGuardian.kill] ${errMsg}`);
      }
    }

    // Step 2: Close all open positions at market
    for (const trade of openTrades) {
      try {
        const closeQty = Math.abs(trade.qty);
        const closeSide = trade.side === 'LONG' ? 'sell' : 'buy';

        const order = await executeWithCircuitBreaker(client, () =>
          client.createMarketOrder(trade.symbol, closeSide, closeQty)
        );

        // Update trade record
        const exitPrice = order.average || order.price;
        const pnl =
          trade.side === 'LONG'
            ? (exitPrice - trade.entryPrice) * trade.qty
            : (trade.entryPrice - exitPrice) * trade.qty;

        await prisma.trade.update({
          where: { id: trade.id },
          data: {
            exitPrice,
            pnl,
            status: 'CLOSED',
            closedAt: new Date(),
          },
        });

        details.closedPositions.push({
          symbol: trade.symbol,
          side: trade.side,
          qty: closeQty,
          exitPrice,
          pnl,
          orderId: order.id,
        });

        console.log(
          `[RiskGuardian.kill] Closed position ${trade.symbol} ${trade.side} ` +
          `${closeQty} @ ${exitPrice.toFixed(4)} (P&L: ${pnl.toFixed(2)})`
        );
      } catch (err) {
        const errMsg = `Failed to close position ${trade.symbol}: ${err.message}`;
        details.errors.push(errMsg);
        console.error(`[RiskGuardian.kill] ${errMsg}`);
      }
    }

    await logRiskEvent(userId, 'KILL_SWITCH', details);

    const success =
      details.closedPositions.length > 0 ||
      (details.errors.length === 0 && openTrades.length === 0);

    return {
      success,
      closed: details.closedPositions,
      errors: details.errors,
    };
  } catch (err) {
    const errMsg = `Unexpected error in emergencyFlattenAll: ${err.message}`;
    details.errors.push(errMsg);
    await logRiskEvent(userId, 'KILL_SWITCH', details);
    console.error(`[RiskGuardian.kill] ${errMsg}`);
    return {
      success: false,
      closed: [],
      errors: [errMsg],
    };
  }
}

/**
 * Reset halt (only after 24h window)
 */
export async function resetHalt(userId) {
  try {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    if (!settings || !settings.haltedUntil) {
      return { reset: false, reason: 'User is not halted' };
    }

    if (new Date() < settings.haltedUntil) {
      const minutesRemaining = Math.ceil(
        (settings.haltedUntil.getTime() - Date.now()) / 60000
      );
      return {
        reset: false,
        reason: `Halt still active. ${minutesRemaining}m remaining.`,
      };
    }

    await prisma.userSettings.update({
      where: { userId },
      data: {
        haltedUntil: null,
        haltReason: null,
      },
    });

    await logRiskEvent(userId, 'RESET', {
      previousReason: settings.haltReason,
    });

    console.log(`[RiskGuardian] User ${userId} halt reset`);
    return { reset: true, reason: 'Halt cleared' };
  } catch (err) {
    console.error('[RiskGuardian.resetHalt] Error:', err.message);
    return {
      reset: false,
      reason: `Error resetting halt: ${err.message}`,
    };
  }
}

/**
 * Get user's risk status
 * Returns halt status, today's drawdown %, open position count
 */
export async function getRiskStatus(userId) {
  try {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    const drawdown = await calculateDailyDrawdown(userId);

    const openPositions = await prisma.trade.count({
      where: { userId, status: 'OPEN' },
    });

    const isHalted =
      settings?.haltedUntil && new Date() < settings.haltedUntil;

    return {
      halted: isHalted,
      haltedUntil: settings?.haltedUntil,
      haltReason: settings?.haltReason,
      drawdown: {
        current: drawdown.currentDrawdown,
        limit: settings?.maxDailyDrawdown,
        exceeded: drawdown.currentDrawdown < 0 &&
          Math.abs(drawdown.currentDrawdown) > (settings?.maxDailyDrawdown || 5),
      },
      positions: {
        open: openPositions,
        max: settings?.maxOpenPositions,
      },
      botEnabled: settings?.botEnabled,
    };
  } catch (err) {
    console.error('[RiskGuardian.getRiskStatus] Error:', err.message);
    throw err;
  }
}

/**
 * Audit log entry (immutable)
 */
async function logRiskEvent(userId, type, details = null) {
  try {
    await prisma.riskEvent.create({
      data: {
        userId,
        type,
        details: details || {},
      },
    });
  } catch (err) {
    console.error('[RiskGuardian.logRiskEvent] Error:', err.message);
    // Don't throw — logging failure shouldn't crash the system
  }
}

export { logRiskEvent };

/**
 * Enforce position size and leverage limits — R07
 * Called before any order placement
 * 
 * Returns: { allowed: boolean, reason?: string, effectiveLeverage?: number }
 */
export async function enforcePositionLimits(userId, proposedQty, proposedPrice, symbol) {
  try {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    if (!settings) {
      return { allowed: false, reason: 'User settings not found' };
    }

    // Calculate proposed notional value
    const notionalValue = proposedQty * proposedPrice;

    // Fetch user's current equity from Bybit
    const apiKey = await prisma.userApiKey.findFirst({
      where: {
        userId,
        exchange: 'bybit',
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!apiKey) {
      return { allowed: false, reason: 'No active Bybit API key found' };
    }

    let currentEquity = null;

    try {
      const client = createBybitClient(
        apiKey.apiKeyEnc,
        apiKey.apiSecretEnc,
        apiKey.isTestnet
      );

      const balance = await executeWithCircuitBreaker(client, () =>
        client.fetchBalance()
      );

      currentEquity = balance.total || balance.free + balance.used;
    } catch (err) {
      console.error('[enforcePositionLimits] Failed to fetch equity:', err.message);
      return {
        allowed: false,
        reason: `Could not fetch account balance: ${err.message}`,
      };
    }

    if (!currentEquity || currentEquity <= 0) {
      return {
        allowed: false,
        reason: `Invalid or zero equity: ${currentEquity}`,
      };
    }

    // Calculate effective leverage
    const effectiveLeverage = notionalValue / currentEquity;

    // Check 1: Leverage cap
    if (effectiveLeverage > settings.leverageCap) {
      return {
        allowed: false,
        reason: `Leverage cap exceeded: ${effectiveLeverage.toFixed(2)}× > ${settings.leverageCap}× limit. ` +
          `Notional: $${notionalValue.toFixed(2)}, Equity: $${currentEquity.toFixed(2)}`,
        effectiveLeverage,
      };
    }

    // Check 2: Position size (% of equity)
    const positionSizePercent = (notionalValue / currentEquity) * 100;

    if (positionSizePercent > settings.maxPositionSize) {
      return {
        allowed: false,
        reason: `Position size exceeded: ${positionSizePercent.toFixed(2)}% > ${settings.maxPositionSize}% limit. ` +
          `Notional: $${notionalValue.toFixed(2)}, Equity: $${currentEquity.toFixed(2)}`,
        effectiveLeverage,
      };
    }

    // Both checks passed
    return {
      allowed: true,
      effectiveLeverage,
    };
  } catch (err) {
    console.error('[enforcePositionLimits] Error:', err.message);
    return {
      allowed: false,
      reason: `Internal error: ${err.message}`,
    };
  }
}

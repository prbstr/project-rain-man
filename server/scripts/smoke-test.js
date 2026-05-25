/**
 * Smoke Test — Strategy Engine Integration
 * Validates end-to-end signal generation with realistic candle data
 */

import StrategyEngine from '../src/strategy/engine.js';

/**
 * Generate realistic TSLA-like OHLCV candles
 * ~$200 base price, slight uptrend, realistic noise
 */
function generateTslaCandles(count = 300) {
  const candles = [];
  let close = 200; // TSLA ~$200

  for (let i = 0; i < count; i++) {
    // Realistic trend: +0.1% per candle (hourly), noise ±1%
    const trend = 0.001;
    const noise = (Math.random() - 0.5) * 0.02;
    close = close * (1 + trend + noise);

    // OHLC structure (typical 1h candle)
    const open = close * (0.98 + Math.random() * 0.04);
    const high = Math.max(open, close) * (1 + Math.random() * 0.005);
    const low = Math.min(open, close) * (1 - Math.random() * 0.005);
    const volume = 100000 + Math.random() * 50000;

    candles.push({
      time: i,
      open,
      high,
      low,
      close,
      volume,
    });
  }

  return candles;
}

/**
 * Validate candles before strategy processing
 */
function validateCandles(candles) {
  if (!Array.isArray(candles) || candles.length === 0) {
    throw new Error('Candles must be a non-empty array');
  }

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const required = ['open', 'high', 'low', 'close', 'volume'];
    for (const field of required) {
      if (typeof c[field] !== 'number' || c[field] <= 0) {
        throw new Error(
          `Candle[${i}].${field} must be a positive number, got ${c[field]}`
        );
      }
    }
    // Sanity check: high >= low
    if (c.high < c.low) {
      throw new Error(
        `Candle[${i}]: high (${c.high}) < low (${c.low})`
      );
    }
  }
}

// --- Main ---
async function runSmokeTest() {
  console.log('🚀 Smoke Test: Strategy Engine Integration\n');

  try {
    // 1. Initialize engine with custom params
    console.log('1️⃣  Initializing StrategyEngine...');
    const engine = new StrategyEngine({
      capital: 5000,
      leverage: 5,
      cciLength: 20,
      emaLength: 200,
      adxLength: 14,
      adxThreshold: 25,
      sizeMultiplier: 1.5,
    });
    console.log('   ✓ Engine ready with params:', {
      capital: 5000,
      leverage: 5,
      cciLength: 20,
      emaLength: 200,
    });

    // 2. Generate realistic TSLA candles
    console.log('\n2️⃣  Generating 300 TSLA-like candles (~$200)...');
    const candles = generateTslaCandles(300);
    console.log(
      `   ✓ Generated ${candles.length} candles`,
      `(open: $${candles[0].open.toFixed(2)}, close: $${candles[candles.length - 1].close.toFixed(2)})`
    );

    // 3. Validate candles
    console.log('\n3️⃣  Validating candles...');
    validateCandles(candles);
    console.log('   ✓ All candles valid (OHLCV structure, high >= low)');

    // 4. Run strategy signal
    console.log('\n4️⃣  Running StrategyEngine.getSignal()...');
    const signal = engine.getSignal(candles);
    console.log('   ✓ Signal computed');

    // 5. Log results
    console.log('\n📊 Signal Results:\n');
    console.log(`   Signal:           ${signal.signal}`);
    console.log(`   CCI:              ${signal.cci?.toFixed(2)}`);
    console.log(`   EMA:              $${signal.ema?.toFixed(2)}`);
    console.log(`   ADX:              ${signal.adx?.toFixed(2)}`);
    console.log(`   ATR:              $${signal.atr?.toFixed(2)}`);
    console.log(`   Keltner Mid:      $${signal.keltner?.mid?.toFixed(2)}`);
    console.log(`   Keltner Upper:    $${signal.keltner?.upper?.toFixed(2)}`);
    console.log(`   Keltner Lower:    $${signal.keltner?.lower?.toFixed(2)}`);
    console.log(`   Position Size:    ${signal.positionSize?.toFixed(4)}`);
    console.log(`   Stop Loss:        $${signal.stopLoss?.toFixed(2)}`);
    console.log(`   Take Profit:      $${signal.takeProfit?.toFixed(2)}`);
    console.log(`   Trail Points:     ${signal.trailPoints?.toFixed(2)}`);

    // Validation
    if (!['LONG', 'SHORT', 'NONE'].includes(signal.signal)) {
      throw new Error(`Invalid signal type: ${signal.signal}`);
    }
    if (signal.signal !== 'NONE' && !Number.isFinite(signal.positionSize)) {
      throw new Error('Position size must be finite when signal is not NONE');
    }

    console.log('\n✅ Smoke test passed. Engine is working correctly.\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Smoke test failed:\n', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

runSmokeTest();

import { getLatestPrices, startPriceFeed, stopPriceFeed } from '../bybit/priceFeed.js';

export function getLatest() {
  return getLatestPrices();
}

export { startPriceFeed, stopPriceFeed };

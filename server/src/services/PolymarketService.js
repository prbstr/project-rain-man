import { polymarketFeed } from '../polymarket/feed.js';

export async function getWatchlist() {
  return polymarketFeed.getWatchlist();
}

export async function search(query) {
  return polymarketFeed.searchMarkets(query);
}

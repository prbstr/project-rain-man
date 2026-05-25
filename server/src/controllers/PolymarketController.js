import { getWatchlist, search } from '../services/PolymarketService.js';

export async function watchlist(req, res, next) {
  try {
    const data = await getWatchlist();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function searchMarkets(req, res, next) {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Query parameter "q" required' });
    const markets = await search(q);
    res.json({ query: q, count: markets.length, markets });
  } catch (err) {
    next(err);
  }
}

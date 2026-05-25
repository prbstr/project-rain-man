import { getLatest } from '../services/PricesService.js';

export function getLatestPrices(req, res) {
  res.json(getLatest());
}

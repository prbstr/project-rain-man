import { useState, useEffect } from 'react';
import client from '../api/client.js';

export function usePrices(prices) {
  const [allPrices, setAllPrices] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  // Fetch initial prices on mount
  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const res = await client.get('/api/prices/latest');
        setAllPrices(res.data || {});
      } catch (err) {
        console.error('[usePrices] Fetch error:', err.message);
        // Fallback to empty object
        setAllPrices({});
      } finally {
        setIsLoading(false);
      }
    };

    fetchPrices();
  }, []);

  // Update from WebSocket prices
  useEffect(() => {
    if (prices && Object.keys(prices).length > 0) {
      setAllPrices((prev) => ({ ...prev, ...prices }));
    }
  }, [prices]);

  return { prices: allPrices, isLoading };
}

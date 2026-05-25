import { useMemo } from 'react';

export function useSignal(latestSignal) {
  return useMemo(
    () => ({
      signal: latestSignal?.signal || 'NONE',
      cci: latestSignal?.cci || null,
      adx: latestSignal?.adx || null,
      ema: latestSignal?.ema || null,
      timestamp: latestSignal?.timestamp || null,
    }),
    [latestSignal]
  );
}

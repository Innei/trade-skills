import { useMemo } from 'react';
import { marketOfSymbol } from '../../lib/market';
import { useCapabilities } from '../edition/capabilitiesStore';

export function isDelayedSymbol(
  delayedMarkets: Set<string>,
  symbol: string | null | undefined,
): boolean {
  return delayedMarkets.has(marketOfSymbol(symbol));
}

export function useDelayedMarkets(): Set<string> {
  const { datasources } = useCapabilities();
  return useMemo(() => {
    const delayed = new Set<string>();
    for (const source of datasources ?? []) {
      if (!source.realtime) delayed.add(source.market);
    }
    return delayed;
  }, [datasources]);
}

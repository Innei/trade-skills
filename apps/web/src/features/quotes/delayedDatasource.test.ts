// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let capabilities: { datasources?: { market: string; name: string; realtime: boolean }[] } = {};

vi.mock('../edition/capabilitiesStore', () => ({
  useCapabilities: () => capabilities,
}));

const { isDelayedSymbol, useDelayedMarkets } = await import('./delayedDatasource');

afterEach(() => {
  capabilities = {};
});

describe('isDelayedSymbol', () => {
  it('is true when the symbol market is in the delayed set', () => {
    expect(isDelayedSymbol(new Set(['HK']), '700.HK')).toBe(true);
  });

  it('is false when the symbol market is not in the delayed set', () => {
    expect(isDelayedSymbol(new Set(['HK']), 'MU.US')).toBe(false);
  });

  it('is false for an unknown market, which defaults to US', () => {
    expect(isDelayedSymbol(new Set(['HK']), '700.SG')).toBe(false);
  });
});

describe('useDelayedMarkets', () => {
  it('derives the set of markets whose datasource is not realtime', () => {
    capabilities = {
      datasources: [
        { market: 'US', name: 'Longbridge', realtime: true },
        { market: 'HK', name: '轮询', realtime: false },
      ],
    };
    const { result } = renderHook(() => useDelayedMarkets());
    expect(result.current).toEqual(new Set(['HK']));
  });

  it('returns an empty set when datasources is missing', () => {
    capabilities = {};
    const { result } = renderHook(() => useDelayedMarkets());
    expect(result.current).toEqual(new Set());
  });

  it('returns an empty set when every datasource is realtime', () => {
    capabilities = { datasources: [{ market: 'US', name: 'Longbridge', realtime: true }] };
    const { result } = renderHook(() => useDelayedMarkets());
    expect(result.current).toEqual(new Set());
  });
});

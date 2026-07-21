import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketDataProvider } from '../src/marketdata/types.js';
import {
  buildHomeExtras,
  flowEligible,
  netInflow,
  resetHomeExtrasForTests,
} from '../src/overview/homeExtras.js';

const provider: Partial<MarketDataProvider> = {};

vi.mock('../src/marketdata/registry.js', () => ({
  getProvider: () => provider,
}));

beforeEach(() => {
  resetHomeExtrasForTests();
  provider.getFlow = vi.fn(async () => [
    { time: 't1', inflow: '100.5' },
    { time: 't2', inflow: -40 },
    { time: 't3', inflow: 'not-a-number' },
  ]);
  provider.getQuotes = vi.fn(async (symbols: string[]) =>
    symbols.map((symbol) => ({
      symbol,
      last: '100',
      prev_close: '98',
      change_percentage: '2.04',
    })),
  );
  provider.getWatchlistSymbols = vi.fn(async () => ['NVDA.US', 'MU.US']);
  provider.getPositions = vi.fn(async () => [
    {
      symbol: 'MU.US',
      available: '1',
      cost_price: '1',
      currency: 'USD',
      market: 'US',
      name: 'MU',
      quantity: '1',
    },
  ]);
  provider.getMarketTemp = vi.fn(async () => ({
    temperature: 57,
    valuation: 82,
    sentiment: 32,
    description: 'Comfortable',
  }));
});

describe('flowEligible', () => {
  it('skips indices and option contracts', () => {
    expect(flowEligible('NVDA.US')).toBe(true);
    expect(flowEligible('.IXIC')).toBe(false);
    expect(flowEligible('DRAM260724C69000.US')).toBe(false);
  });
});

describe('netInflow', () => {
  it('sums numeric inflows and skips unparsable rows', () => {
    expect(netInflow([{ time: 'a', inflow: '1.5' }, { time: 'b', inflow: 2 }])).toBeCloseTo(3.5);
    expect(netInflow([{ time: 'a', inflow: 'x' }])).toBe(0);
  });
});

describe('buildHomeExtras', () => {
  it('aggregates flows for watch symbols plus extras and market temp', async () => {
    const extras = await buildHomeExtras(['TSM.US']);
    expect(Object.keys(extras.flows)).toEqual(
      expect.arrayContaining(['NVDA.US', 'MU.US', 'TSM.US']),
    );
    expect(extras.flows['NVDA.US']).toBeCloseTo(60.5);
    expect(extras.flows_at).not.toBeNull();
    expect(extras.market).toMatchObject({ temperature: 57, valuation: 82 });
  });

  it('caches flow results within the TTL', async () => {
    await buildHomeExtras([]);
    const calls = (provider.getFlow as ReturnType<typeof vi.fn>).mock.calls.length;
    await buildHomeExtras([]);
    expect((provider.getFlow as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls);
  });

  it('degrades to nulls when every source fails', async () => {
    provider.getFlow = vi.fn(async () => {
      throw new Error('boom');
    });
    provider.getMarketTemp = vi.fn(async () => {
      throw new Error('boom');
    });
    const extras = await buildHomeExtras([]);
    expect(extras.flows['NVDA.US']).toBeNull();
    expect(extras.flows_at).toBeNull();
    expect(extras.market).toBeNull();
  });
});

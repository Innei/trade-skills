import { describe, expect, it } from 'vitest';
import type {
  HomeEvents,
  OverviewBoard,
  OverviewRow,
  PortfolioSummary,
  QuoteCell,
} from '@kansoku/shared/types';
import { buildGridEntries, isCardWorthySymbol, isMover } from './SymbolGrid';

const quote = (symbol: string, pct = 1): QuoteCell => ({
  symbol,
  session: '盘前',
  last: 100,
  pct,
  regularLast: 99,
  regularPct: 0.5,
});

const row: OverviewRow = {
  symbol: 'NVDA.US',
  chart_id: 'c1',
  url: '/symbol/NVDA.US',
  title: 'NVDA',
  direction: 'long',
  last: 101,
  pct: 1.2,
  session: '盘前',
  entry: null,
  stop: null,
  target1: null,
  stop_distance_pct: null,
  target1_distance_pct: null,
  prediction_stale: false,
  ai_following: false,
  latest_comment: null,
  alert_count: 0,
};

const board: OverviewBoard = {
  date: '2026-07-21',
  session: 'pre',
  rows: [row],
  flows: { 'NVDA.US': 3.2e8, 'TSM.US': -1e7 },
};

const portfolio: PortfolioSummary = {
  currency: 'USD',
  total_asset: 1,
  market_cap: 1,
  cash: 1,
  total_pl: 0,
  today_pl: 0,
  positions: [
    {
      symbol: 'MU.US',
      name: 'MU',
      quantity: 1,
      cost_price: 1,
      last: 1,
      market_value: 1,
      pnl: 0,
      pnl_pct: 0,
    },
  ],
};

const events: HomeEvents = {
  date: '2026-07-21',
  items: [
    {
      date: '2026-07-23',
      ts: null,
      kind: 'earnings',
      symbol: 'NVDA.US',
      title: 'Q2',
      estimate: null,
      previous: null,
      actual: null,
      owned: false,
    },
    {
      date: '2026-12-01',
      ts: null,
      kind: 'earnings',
      symbol: 'TSM.US',
      title: '远期',
      estimate: null,
      previous: null,
      actual: null,
      owned: false,
    },
  ],
};

describe('isCardWorthySymbol', () => {
  it('rejects indices and option contracts', () => {
    expect(isCardWorthySymbol('NVDA.US')).toBe(true);
    expect(isCardWorthySymbol('.IXIC')).toBe(false);
    expect(isCardWorthySymbol('DRAM260724C69000.US')).toBe(false);
  });
});

describe('isMover', () => {
  const entry = (pct: number | null, earningsDate: string | null) => ({
    symbol: 'X.US',
    quote: pct == null ? null : quote('X.US', pct),
    row: null,
    flow: null,
    owned: false,
    earningsDate,
  });

  it('surfaces big movers and imminent earnings only', () => {
    expect(isMover(entry(3.2, null), '2026-07-21')).toBe(true);
    expect(isMover(entry(-4, null), '2026-07-21')).toBe(true);
    expect(isMover(entry(1.2, null), '2026-07-21')).toBe(false);
    expect(isMover(entry(0.5, '2026-07-23'), '2026-07-21')).toBe(true);
    expect(isMover(entry(0.5, '2026-07-28'), '2026-07-21')).toBe(false);
    expect(isMover(entry(null, null), '2026-07-21')).toBe(false);
  });
});

describe('buildGridEntries', () => {
  it('merges quotes, board rows, positions and flows, excluding index and option symbols', () => {
    const entries = buildGridEntries({
      quotes: [quote('NVDA.US'), quote('TSM.US'), quote('SPY.US'), quote('.IXIC'), quote('DRAM260724C69000.US')],
      board,
      portfolio,
      events,
    });
    const symbols = entries.map((e) => e.symbol);
    expect(symbols).toEqual(['MU.US', 'NVDA.US', 'TSM.US']);
    const nvda = entries.find((e) => e.symbol === 'NVDA.US')!;
    expect(nvda.row).toBe(row);
    expect(nvda.flow).toBe(3.2e8);
    expect(nvda.owned).toBe(false);
  });

  it('sorts owned symbols first', () => {
    const entries = buildGridEntries({
      quotes: [quote('NVDA.US')],
      board,
      portfolio,
      events: null,
    });
    expect(entries[0].symbol).toBe('MU.US');
    expect(entries[0].owned).toBe(true);
  });

  it('only badges earnings within the cutoff window', () => {
    const entries = buildGridEntries({
      quotes: [quote('NVDA.US'), quote('TSM.US')],
      board,
      portfolio: null,
      events,
    });
    expect(entries.find((e) => e.symbol === 'NVDA.US')!.earningsDate).toBe('2026-07-23');
    expect(entries.find((e) => e.symbol === 'TSM.US')!.earningsDate).toBeNull();
  });
});

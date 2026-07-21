import { describe, expect, it } from 'vitest';
import type { PortfolioSummary, QuoteCell } from '@kansoku/shared/types';
import {
  buildPanoramaGroups,
  heatClass,
  panoramaReadLine,
  splitPanorama,
} from './MarketPanorama';

const quote = (symbol: string, pct: number, turnover: number): QuoteCell => ({
  symbol,
  session: '日盘',
  last: 100,
  pct,
  regularLast: 100,
  regularPct: pct,
  turnover,
});

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

describe('heatClass', () => {
  it('buckets pct into seven levels', () => {
    expect(heatClass(5)).toBe('heat-g3');
    expect(heatClass(2)).toBe('heat-g2');
    expect(heatClass(0.5)).toBe('heat-g1');
    expect(heatClass(0)).toBe('heat-0');
    expect(heatClass(-0.5)).toBe('heat-r1');
    expect(heatClass(-2)).toBe('heat-r2');
    expect(heatClass(-5)).toBe('heat-r3');
    expect(heatClass(null)).toBe('heat-0');
  });
});

describe('buildPanoramaGroups', () => {
  const quotes = [
    quote('NVDA.US', 1, 1000),
    quote('MU.US', 6, 500),
    quote('ORCL.US', 3, 200),
    quote('SPY.US', 0.5, 9999),
    quote('.IXIC', 0.5, 9999),
    quote('ZZZZ.US', 2, 50),
  ];

  it('groups by industry, sorts by turnover, excludes indices, marks owned', () => {
    const groups = buildPanoramaGroups(quotes, portfolio);
    const names = groups.map((g) => g.industry);
    expect(names[0]).toBe('半导体');
    expect(names).toContain('存储');
    expect(names).toContain('软件云');
    expect(names.at(-1)).toBe('未分类');
    expect(names).not.toContain('大盘 ETF');
    const storage = groups.find((g) => g.industry === '存储')!;
    expect(storage.tiles[0].owned).toBe(true);
    expect(groups.find((g) => g.industry === '半导体')!.weightedPct).toBeCloseTo(1);
  });

  it('reads the strongest and weakest group', () => {
    const line = panoramaReadLine(buildPanoramaGroups(quotes, portfolio));
    expect(line).toBe('存储最强(+6.00%)、半导体最弱(+1.00%)');
  });
});

describe('splitPanorama', () => {
  it('sends tool industries to chips and merges small groups', () => {
    const groups = buildPanoramaGroups(
      [
        quote('NVDA.US', 1, 1000),
        quote('AMD.US', 2, 500),
        quote('TSM.US', 3, 400),
        quote('MU.US', 6, 500),
        quote('KO.US', -0.1, 100),
        quote('VST.US', 1.8, 90),
        quote('VXX.US', -3, 80),
        quote('ZZZZ.US', 2, 50),
      ],
      null,
    );
    const { main, tools } = splitPanorama(groups);
    expect(tools.map((g) => g.industry)).toEqual(expect.arrayContaining(['波动率', '未分类']));
    const merged = main.find((g) => g.industry.includes(' · '));
    expect(merged).toBeTruthy();
    expect(merged!.tiles.map((t) => t.symbol)).toEqual(
      expect.arrayContaining(['KO.US', 'VST.US', 'MU.US']),
    );
    expect(main.map((g) => g.industry)).toContain('半导体');
  });
});

describe('cap ordering', () => {
  it('sorts tiles and groups by market cap when caps are provided', () => {
    const groups = buildPanoramaGroups(
      [quote('NVDA.US', 1, 10), quote('AMD.US', 2, 999), quote('MU.US', 6, 1)],
      null,
      { 'NVDA.US': 5e12, 'AMD.US': 3e11, 'MU.US': 2e11 },
    );
    expect(groups[0].industry).toBe('半导体');
    expect(groups[0].tiles.map((t) => t.symbol)).toEqual(['NVDA.US', 'AMD.US']);
    expect(groups[0].cap).toBeCloseTo(5.3e12);
  });
});

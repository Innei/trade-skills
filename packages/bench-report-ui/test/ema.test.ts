import { describe, expect, it } from 'vitest';
import { EMA_PERIOD, computeEma20 } from '../src/episode/chart/ema';

describe('computeEma20', () => {
  it('returns nothing when fewer than 20 closes', () => {
    expect(computeEma20([1, 2, 3])).toEqual([]);
    expect(computeEma20(Array.from({ length: 19 }, (_, i) => i))).toEqual([]);
  });

  it('seeds the first point with the SMA of the first 20 closes at index 19', () => {
    const closes = Array.from({ length: 20 }, (_, i) => i + 1);
    const points = computeEma20(closes);
    expect(points).toHaveLength(1);
    expect(points[0].index).toBe(EMA_PERIOD - 1);
    const expectedSma = closes.reduce((sum, value) => sum + value, 0) / EMA_PERIOD;
    expect(points[0].value).toBeCloseTo(expectedSma, 10);
  });

  it('recurses with the standard multiplier after the seed', () => {
    const closes = Array.from({ length: 22 }, (_, i) => i + 1);
    const points = computeEma20(closes);
    expect(points).toHaveLength(3);
    const seed = closes.slice(0, 20).reduce((sum, value) => sum + value, 0) / 20;
    const k = 2 / (EMA_PERIOD + 1);
    const p21 = closes[20] * k + seed * (1 - k);
    const p22 = closes[21] * k + p21 * (1 - k);
    expect(points[1].index).toBe(20);
    expect(points[1].value).toBeCloseTo(p21, 10);
    expect(points[2].index).toBe(21);
    expect(points[2].value).toBeCloseTo(p22, 10);
  });
});
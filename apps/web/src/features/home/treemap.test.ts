import { describe, expect, it } from 'vitest';
import { squarify } from './treemap';

describe('squarify', () => {
  it('returns empty on zero size', () => {
    expect(squarify([{ key: 'a', value: 1 }], 0, 100)).toEqual([]);
    expect(squarify([{ key: 'a', value: 1 }], 100, 0)).toEqual([]);
  });

  it('drops non-positive values', () => {
    const rects = squarify(
      [
        { key: 'a', value: 10 },
        { key: 'b', value: 0 },
        { key: 'c', value: -5 },
      ],
      100,
      100,
    );
    expect(rects.map((r) => r.key)).toEqual(['a']);
  });

  it('gives a single item the whole rect', () => {
    const [r] = squarify([{ key: 'solo', value: 42 }], 200, 100);
    expect(r).toEqual({ key: 'solo', x: 0, y: 0, w: 200, h: 100 });
  });

  it('total area equals width × height', () => {
    const rects = squarify(
      [
        { key: 'a', value: 400 },
        { key: 'b', value: 300 },
        { key: 'c', value: 200 },
        { key: 'd', value: 100 },
      ],
      400,
      300,
    );
    const area = rects.reduce((s, r) => s + r.w * r.h, 0);
    expect(area).toBeCloseTo(400 * 300, 1);
  });

  it('tile area is proportional to value', () => {
    const rects = squarify(
      [
        { key: 'big', value: 900 },
        { key: 'small', value: 100 },
      ],
      100,
      100,
    );
    const byKey = Object.fromEntries(rects.map((r) => [r.key, r.w * r.h]));
    expect(byKey.big / byKey.small).toBeCloseTo(9, 1);
  });

  it('rects stay inside the container', () => {
    const rects = squarify(
      Array.from({ length: 12 }, (_, i) => ({
        key: `k${i}`,
        value: 12 - i,
      })),
      300,
      200,
    );
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(300 + 0.01);
      expect(r.y + r.h).toBeLessThanOrEqual(200 + 0.01);
    }
  });

  it('sorts descending regardless of input order', () => {
    const a = squarify(
      [
        { key: 'a', value: 1 },
        { key: 'b', value: 5 },
        { key: 'c', value: 2 },
      ],
      100,
      100,
    );
    const areaOf = (k: string) => {
      const r = a.find((x) => x.key === k);
      return r ? r.w * r.h : 0;
    };
    expect(areaOf('b')).toBeGreaterThan(areaOf('c'));
    expect(areaOf('c')).toBeGreaterThan(areaOf('a'));
  });
});

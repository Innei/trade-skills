import { describe, expect, it } from "vitest";
import { mergeCandleBar } from "../src/realtime/candleMerge.js";

describe("mergeCandleBar", () => {
  it("appends to an empty series", () => {
    const bars = mergeCandleBar([], { ts: 1000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 });
    expect(bars).toHaveLength(1);
    expect(bars[0]).toEqual({ time: new Date(1000).toISOString(), open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 });
  });

  it("updates the last bar when the push shares the same bucket timestamp", () => {
    const seed = [{ time: new Date(1000).toISOString(), open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 }];
    const bars = mergeCandleBar(seed, { ts: 1000, open: 1, high: 3, low: 0.5, close: 2, volume: 150 });
    expect(bars).toHaveLength(1);
    expect(bars[0].close).toBe(2);
    expect(bars[0].high).toBe(3);
    expect(bars[0].volume).toBe(150);
  });

  it("appends a new bar when the push opens a later bucket", () => {
    const seed = [{ time: new Date(1000).toISOString(), open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 }];
    const bars = mergeCandleBar(seed, { ts: 2000, open: 2, high: 2.5, low: 1.8, close: 2.2, volume: 50 });
    expect(bars).toHaveLength(2);
    expect(bars[1].time).toBe(new Date(2000).toISOString());
  });

  it("ignores a stale out-of-order push", () => {
    const seed = [
      { time: new Date(1000).toISOString(), open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 },
      { time: new Date(2000).toISOString(), open: 2, high: 2.5, low: 1.8, close: 2.2, volume: 50 },
    ];
    const bars = mergeCandleBar(seed, { ts: 1000, open: 9, high: 9, low: 9, close: 9, volume: 9 });
    expect(bars).toBe(seed);
  });
});

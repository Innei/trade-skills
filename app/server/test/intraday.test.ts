import { describe, expect, it } from "vitest";
import type { RawBar, TimeframeKey } from "../../shared/types.js";
import { buildIntraday, coerceIntradayTimeframe, type IntradayInput } from "../src/services/intraday.js";
import { approxDiff, loadFixture } from "./helpers.js";

type TfExpected = Record<
  TimeframeKey,
  {
    candles: unknown;
    volumes: unknown;
    macdDif: unknown;
    macdDea: unknown;
    macdHist: unknown;
    macdCrosses: unknown;
    autoDivergence: unknown;
    autoBeichi: unknown;
    last_close: number;
    summary: unknown;
  }
>;

describe("intraday parity vs python golden fixture", () => {
  const input = loadFixture<IntradayInput>("intraday-input.json");
  const expected = loadFixture<TfExpected>("intraday-expected.json");

  for (const key of ["m5", "m15", "h1"] as TimeframeKey[]) {
    it(`timeframe ${key} matches`, () => {
      const tf = coerceIntradayTimeframe(input.timeframes[key] as RawBar[], key);
      const exp = expected[key];
      expect(approxDiff(tf.candles, exp.candles)).toBeNull();
      expect(approxDiff(tf.volumes, exp.volumes)).toBeNull();
      expect(approxDiff(tf.macdDif, exp.macdDif)).toBeNull();
      expect(approxDiff(tf.macdDea, exp.macdDea)).toBeNull();
      expect(approxDiff(tf.macdHist, exp.macdHist)).toBeNull();
      expect(approxDiff(tf.macdCrosses, exp.macdCrosses)).toBeNull();
      expect(approxDiff(tf.autoDivergence, exp.autoDivergence)).toBeNull();
      expect(approxDiff(tf.autoBeichi, exp.autoBeichi)).toBeNull();
      expect(approxDiff(tf.lastClose, exp.last_close)).toBeNull();
      expect(approxDiff(tf.summary, exp.summary)).toBeNull();
    });
  }

  it("full build works in preview mode", () => {
    const { built, meta } = buildIntraday(input);
    expect(meta.mode).toBe("preview");
    expect(built.defaultTf).toBe("m15");
    expect(Object.keys(built.timeframes).sort()).toEqual(["h1", "m15", "m5"]);
    expect(built.sidebar.position?.shares).toBe(1);
  });
});

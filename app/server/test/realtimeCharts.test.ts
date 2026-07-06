import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChartDoc } from "../../shared/types.js";

const store = vi.hoisted(() => ({ loadChart: vi.fn() }));
const build = vi.hoisted(() => ({
  buildChart: vi.fn(),
  refreshBody: vi.fn(),
  rebuild: vi.fn(),
}));
const longbridgeStream = vi.hoisted(() => ({
  subscribeCandlesticks: vi.fn(),
}));

vi.mock("../src/services/store.js", () => store);
vi.mock("../src/services/build.js", () => build);
vi.mock("../src/services/marketdata/longbridgeStream.js", () => ({
  getLongbridgeStream: () => longbridgeStream,
}));

const { subscribeChart } = await import("../src/realtime/charts.js");

type CandleCb = (bar: { ts: number; open: number; high: number; low: number; close: number; volume: number; symbol: string; period: string }) => void;

function makeDoc(overrides: Partial<ChartDoc> = {}): ChartDoc {
  return {
    id: "2026-07-06-nvda-intraday",
    schema_version: 1,
    type: "intraday",
    title: "NVDA 短线多周期",
    symbol: "NVDA.US",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    input: {
      symbol: "NVDA.US",
      timeframes: {
        m5: [{ time: new Date(1_000).toISOString(), open: 1, high: 1, low: 1, close: 1, volume: 1 }],
        m15: [{ time: new Date(1_000).toISOString(), open: 1, high: 1, low: 1, close: 1, volume: 1 }],
        h1: [{ time: new Date(1_000).toISOString(), open: 1, high: 1, low: 1, close: 1, volume: 1 }],
      },
    },
    built: { kind: "intraday" } as unknown as ChartDoc["built"],
    ...overrides,
  };
}

describe("subscribeChart candlestick-push wiring", () => {
  const callbacksByPeriod = new Map<string, CandleCb>();
  const unsubSpies = new Map<string, ReturnType<typeof vi.fn>>();

  beforeEach(() => {
    vi.useFakeTimers();
    callbacksByPeriod.clear();
    unsubSpies.clear();
    store.loadChart.mockReset().mockResolvedValue(makeDoc());
    build.refreshBody.mockReset().mockReturnValue({ type: "intraday", symbol: "NVDA.US" });
    build.rebuild.mockReset().mockReturnValue({
      type: "intraday",
      title: "NVDA 短线多周期",
      symbol: "NVDA.US",
      input: {},
      built: { kind: "intraday", pushed: true },
      meta: {},
    });
    longbridgeStream.subscribeCandlesticks.mockReset();
    longbridgeStream.subscribeCandlesticks.mockImplementation((_symbol: string, period: string, cb: CandleCb) => {
      callbacksByPeriod.set(period, cb);
      const unsub = vi.fn();
      unsubSpies.set(period, unsub);
      return unsub;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("merges a same-bucket push into the last bar and schedules exactly one debounced rebuild for a burst", async () => {
    const events: string[] = [];
    const unsub = await subscribeChart("2026-07-06-nvda-intraday", (e) => events.push(e));

    const m5cb = callbacksByPeriod.get("5m");
    expect(m5cb).toBeTruthy();

    m5cb!({ symbol: "NVDA.US", period: "5m", ts: 1_000, open: 1, high: 2, low: 1, close: 1.5, volume: 10 });
    m5cb!({ symbol: "NVDA.US", period: "5m", ts: 1_000, open: 1, high: 2.5, low: 1, close: 1.8, volume: 20 });
    m5cb!({ symbol: "NVDA.US", period: "5m", ts: 1_000, open: 1, high: 3, low: 1, close: 2, volume: 30 });

    expect(build.rebuild).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_500);

    expect(build.rebuild).toHaveBeenCalledTimes(1);
    const [, input] = build.rebuild.mock.calls[0];
    expect(input.timeframes.m5).toHaveLength(1);
    expect(input.timeframes.m5[0].close).toBe(2);

    const dataEvents = events.map((e) => JSON.parse(e)).filter((e) => e.type === "data");
    expect(dataEvents.some((e) => e.data.built.pushed)).toBe(true);
    unsub();
  });

  it("appends a new bar when a push opens a later bucket", async () => {
    store.loadChart.mockResolvedValue(makeDoc({ id: "2026-07-06-nvda-intraday-2" }));
    const unsub = await subscribeChart("2026-07-06-nvda-intraday-2", () => {});
    const m5cb = callbacksByPeriod.get("5m")!;

    m5cb({ symbol: "NVDA.US", period: "5m", ts: 2_000, open: 2, high: 2, low: 2, close: 2, volume: 5 });
    await vi.advanceTimersByTimeAsync(1_500);

    const [, input] = build.rebuild.mock.calls[0];
    expect(input.timeframes.m5).toHaveLength(2);
    expect(input.timeframes.m5[1].time).toBe(new Date(2_000).toISOString());
    unsub();
  });

  it("releases all per-timeframe ledger subscriptions when the last subscriber leaves", async () => {
    store.loadChart.mockResolvedValue(makeDoc({ id: "2026-07-06-nvda-intraday-3" }));
    const unsub = await subscribeChart("2026-07-06-nvda-intraday-3", () => {});
    expect(longbridgeStream.subscribeCandlesticks).toHaveBeenCalledTimes(3);

    unsub();

    for (const period of ["5m", "15m", "60m"]) {
      expect(unsubSpies.get(period)).toHaveBeenCalledTimes(1);
    }
  });

  it("does not wire candlestick subscriptions for non-intraday live types", async () => {
    store.loadChart.mockResolvedValue(makeDoc({ id: "2026-07-06-flow", type: "flow" }));
    build.refreshBody.mockReturnValue({ type: "flow", symbol: "NVDA.US" });

    await subscribeChart("2026-07-06-flow", () => {});
    expect(longbridgeStream.subscribeCandlesticks).not.toHaveBeenCalled();
  });
});

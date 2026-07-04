import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAiScheduler, type SchedulerDeps } from "../src/ai/scheduler.js";
import type { CommentPack } from "../src/ai/datapack.js";
import type { AiModel } from "../src/ai/models.js";
import type { Trigger } from "../src/ai/triggers.js";

const fakeModel = { provider: "anthropic", id: "haiku" } as unknown as AiModel;

function makePack(symbol: string): CommentPack {
  return {
    symbol,
    as_of: "2026-07-05T15:00:00.000Z",
    quote: {} as CommentPack["quote"],
    m5: { bars: [], macd: { dif: [], dea: [], hist: [] } },
    flow: [],
    prediction: null,
    recent_comments: [],
  };
}

interface Recorded {
  commentatorCalls: { symbol: string; trigger: Trigger }[];
  analystCalls: { symbol: string; origin: string }[];
}

function harness(overrides: Partial<SchedulerDeps> = {}): { deps: SchedulerDeps; rec: Recorded } {
  const rec: Recorded = { commentatorCalls: [], analystCalls: [] };
  const deps: SchedulerDeps = {
    now: () => 1_000_000,
    aiConfig: () => ({ commentModel: fakeModel, analystModel: fakeModel }),
    isRegularSession: () => true,
    discoverTargets: async () => ["MU.US"],
    buildCommentPack: async (symbol) => makePack(symbol),
    detectTriggers: () => [],
    shouldHeartbeat: () => false,
    runCommentator: async ({ symbol, trigger }) => {
      rec.commentatorCalls.push({ symbol, trigger });
      return { escalate: false };
    },
    runAnalyst: ({ symbol, origin }) => {
      rec.analystCalls.push({ symbol, origin });
      return { started: true };
    },
    escalationOnCooldown: () => false,
    ...overrides,
  };
  return { deps, rec };
}

describe("aiScheduler tick", () => {
  it("does nothing outside the regular session", async () => {
    const discoverTargets = vi.fn(async () => ["MU.US"]);
    const { deps, rec } = harness({ isRegularSession: () => false, discoverTargets });
    await createAiScheduler(deps).tick();
    expect(discoverTargets).not.toHaveBeenCalled();
    expect(rec.commentatorCalls).toHaveLength(0);
  });

  it("does nothing when the comment model is unresolved", async () => {
    const discoverTargets = vi.fn(async () => ["MU.US"]);
    const { deps, rec } = harness({
      aiConfig: () => ({ commentModel: null, analystModel: null }),
      discoverTargets,
    });
    await createAiScheduler(deps).tick();
    expect(discoverTargets).not.toHaveBeenCalled();
    expect(rec.commentatorCalls).toHaveLength(0);
  });

  it("does nothing when there are no targets", async () => {
    const { deps, rec } = harness({ discoverTargets: async () => [] });
    await createAiScheduler(deps).tick();
    expect(rec.commentatorCalls).toHaveLength(0);
  });

  it("runs the commentator with a combined trigger string when a trigger fires", async () => {
    const { deps, rec } = harness({
      detectTriggers: () => [
        { kind: "macd_cross", detail: "hist 0.1 -> -0.1" },
        { kind: "flow_flip", detail: "net inflow -> outflow" },
      ],
    });
    await createAiScheduler(deps).tick();
    expect(rec.commentatorCalls).toHaveLength(1);
    expect(rec.commentatorCalls[0].symbol).toBe("MU.US");
    expect(rec.commentatorCalls[0].trigger.detail).toContain("macd_cross: hist 0.1 -> -0.1");
    expect(rec.commentatorCalls[0].trigger.detail).toContain("flow_flip: net inflow -> outflow");
  });

  it("runs a heartbeat commentator when no trigger fires but heartbeat is due", async () => {
    const { deps, rec } = harness({ detectTriggers: () => [], shouldHeartbeat: () => true });
    await createAiScheduler(deps).tick();
    expect(rec.commentatorCalls).toHaveLength(1);
    expect(rec.commentatorCalls[0].trigger.kind).toBe("heartbeat");
  });

  it("skips when there is no trigger and heartbeat is not due", async () => {
    const { deps, rec } = harness({ detectTriggers: () => [], shouldHeartbeat: () => false });
    await createAiScheduler(deps).tick();
    expect(rec.commentatorCalls).toHaveLength(0);
  });

  it("escalates to the analyst when the commentator escalates and no cooldown blocks", async () => {
    const { deps, rec } = harness({
      detectTriggers: () => [{ kind: "level_break", detail: "broke stop" }],
      runCommentator: async () => ({ escalate: true }),
      escalationOnCooldown: () => false,
    });
    await createAiScheduler(deps).tick();
    expect(rec.analystCalls).toEqual([{ symbol: "MU.US", origin: "escalation" }]);
  });

  it("does not escalate when the escalation is on cooldown", async () => {
    const { deps, rec } = harness({
      detectTriggers: () => [{ kind: "level_break", detail: "broke stop" }],
      runCommentator: async () => ({ escalate: true }),
      escalationOnCooldown: () => true,
    });
    await createAiScheduler(deps).tick();
    expect(rec.analystCalls).toHaveLength(0);
  });

  it("does not escalate when the analyst model is unresolved", async () => {
    const { deps, rec } = harness({
      aiConfig: () => ({ commentModel: fakeModel, analystModel: null }),
      detectTriggers: () => [{ kind: "level_break", detail: "broke stop" }],
      runCommentator: async () => ({ escalate: true }),
    });
    await createAiScheduler(deps).tick();
    expect(rec.analystCalls).toHaveLength(0);
  });

  it("feeds real entry/stop/target1/target2 into trigger levels", async () => {
    let seen: import("../src/ai/triggers.js").TriggerInput | null = null;
    const { deps } = harness({
      buildCommentPack: async (symbol) => ({
        ...makePack(symbol),
        prediction: {
          chartId: "c1",
          direction: "long",
          anchor: { timeframe: "m5", time: "2026-07-05T15:00:00Z", price: 99 },
          entry: 100,
          stop: 96,
          target1: 106,
          target2: 112,
        },
      }),
      detectTriggers: (input) => {
        seen = input;
        return [];
      },
      shouldHeartbeat: () => true,
    });
    await createAiScheduler(deps).tick();
    expect(seen!.levels).toEqual({ entry: 100, stop: 96, target1: 106, target2: 112 });
  });

  it("swallows and logs a discoverTargets throw, later ticks still run", async () => {
    let calls = 0;
    const { deps, rec } = harness({
      discoverTargets: async () => {
        calls++;
        if (calls === 1) throw new Error("discover boom");
        return ["MU.US"];
      },
      detectTriggers: () => [{ kind: "macd_cross", detail: "x" }],
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const scheduler = createAiScheduler(deps);
    await expect(scheduler.tick()).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
    expect(rec.commentatorCalls).toHaveLength(0);
    await scheduler.tick();
    expect(rec.commentatorCalls.map((c) => c.symbol)).toEqual(["MU.US"]);
    errSpy.mockRestore();
  });

  it("keeps processing later symbols when one symbol throws", async () => {
    const { deps, rec } = harness({
      discoverTargets: async () => ["BAD.US", "MU.US"],
      buildCommentPack: async (symbol) => {
        if (symbol === "BAD.US") throw new Error("boom");
        return makePack(symbol);
      },
      detectTriggers: () => [{ kind: "macd_cross", detail: "x" }],
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await createAiScheduler(deps).tick();
    expect(rec.commentatorCalls.map((c) => c.symbol)).toEqual(["MU.US"]);
    errSpy.mockRestore();
  });
});

describe("aiScheduler loop", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("skips a timer fire that lands while the previous tick is still running", async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let discoverCalls = 0;
    const { deps } = harness({
      discoverTargets: async () => {
        discoverCalls++;
        await gate;
        return [];
      },
    });
    const scheduler = createAiScheduler(deps);
    scheduler.start();

    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(discoverCalls).toBe(1);

    release!();
    await vi.advanceTimersByTimeAsync(0);
    scheduler.stop();
  });

  it("does not start when the comment model is unresolved", () => {
    const { deps } = harness({ aiConfig: () => ({ commentModel: null, analystModel: null }) });
    const scheduler = createAiScheduler(deps);
    expect(scheduler.start()).toBe(false);
  });

  it("stops firing after stop", async () => {
    const discoverTargets = vi.fn(async () => []);
    const { deps } = harness({ discoverTargets });
    const scheduler = createAiScheduler(deps);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(discoverTargets).toHaveBeenCalledTimes(1);
    scheduler.stop();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(discoverTargets).toHaveBeenCalledTimes(1);
  });
});

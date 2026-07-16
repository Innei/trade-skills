import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelSpec } from "./wsHub";

const subscribeChannel = vi.fn();

vi.mock("./wsHub", () => ({
  subscribeChannel: (...args: unknown[]) => subscribeChannel(...args),
}));

interface Sub {
  spec: ChannelSpec;
  onPayload: (payload: unknown) => void;
  onConnected: (connected: boolean) => void;
  unsub: ReturnType<typeof vi.fn>;
}

const running = (activity: string) =>
  ({
    running: true as const,
    origin: "manual" as const,
    phase: "researching" as const,
    activity,
    startedAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
  });

describe("analystRunsStore", () => {
  let subs: Sub[];
  let store: typeof import("./analystRunsStore");

  beforeEach(async () => {
    subs = [];
    subscribeChannel.mockReset();
    subscribeChannel.mockImplementation(
      (spec: ChannelSpec, onPayload: (payload: unknown) => void, onConnected: (connected: boolean) => void) => {
        const unsub = vi.fn();
        subs.push({ spec, onPayload, onConnected, unsub });
        return unsub;
      },
    );
    vi.resetModules();
    store = await import("./analystRunsStore");
  });

  afterEach(() => {
    store.resetAnalystRunsStoreForTests();
  });

  it("populates runs from the init payload", () => {
    const off = store.subscribeAnalystRuns(vi.fn());
    subs[0].onPayload({
      type: "init",
      runs: [
        { symbol: "NVDA", status: running("preparing") },
        { symbol: "MU", status: running("writing") },
      ],
    });

    expect(store.isRunning("NVDA")).toBe(true);
    expect(store.isRunning("MU")).toBe(true);
    expect(store.getRunStatus("NVDA")).toEqual(running("preparing"));
    off();
  });

  it("adds a symbol on running:true update and removes it on running:false", () => {
    const off = store.subscribeAnalystRuns(vi.fn());
    subs[0].onPayload({ type: "update", symbol: "NVDA", status: running("preparing") });
    expect(store.isRunning("NVDA")).toBe(true);

    subs[0].onPayload({ type: "update", symbol: "NVDA", status: { running: false } });
    expect(store.isRunning("NVDA")).toBe(false);
    off();
  });

  it("marks unseen when a run ends while its symbol is not the active tab", () => {
    store.setActiveSymbolProvider(() => "MU");
    const off = store.subscribeAnalystRuns(vi.fn());
    subs[0].onPayload({ type: "update", symbol: "NVDA", status: running("preparing") });
    subs[0].onPayload({ type: "update", symbol: "NVDA", status: { running: false } });

    expect(store.hasUnseen("NVDA")).toBe(true);
    off();
  });

  it("does not mark unseen when the active symbol matches the finished run", () => {
    store.setActiveSymbolProvider(() => "NVDA");
    const off = store.subscribeAnalystRuns(vi.fn());
    subs[0].onPayload({ type: "update", symbol: "NVDA", status: running("preparing") });
    subs[0].onPayload({ type: "update", symbol: "NVDA", status: { running: false } });

    expect(store.hasUnseen("NVDA")).toBe(false);
    off();
  });

  it("does not mark unseen when no active-symbol provider is set", () => {
    const off = store.subscribeAnalystRuns(vi.fn());
    subs[0].onPayload({ type: "update", symbol: "NVDA", status: running("preparing") });
    subs[0].onPayload({ type: "update", symbol: "NVDA", status: { running: false } });

    expect(store.hasUnseen("NVDA")).toBe(false);
    off();
  });

  it("clears the unseen mark via markSeen", () => {
    store.setActiveSymbolProvider(() => "MU");
    const off = store.subscribeAnalystRuns(vi.fn());
    subs[0].onPayload({ type: "update", symbol: "NVDA", status: running("preparing") });
    subs[0].onPayload({ type: "update", symbol: "NVDA", status: { running: false } });
    expect(store.hasUnseen("NVDA")).toBe(true);

    store.markSeen("NVDA");
    expect(store.hasUnseen("NVDA")).toBe(false);
    off();
  });

  it("ignores malformed payloads", () => {
    const off = store.subscribeAnalystRuns(vi.fn());
    subs[0].onPayload(null);
    subs[0].onPayload({ type: "update", symbol: 42, status: running("preparing") });
    subs[0].onPayload({ type: "update", symbol: "NVDA", status: { bogus: true } });
    subs[0].onPayload({ type: "bogus" });

    expect(store.isRunning("NVDA")).toBe(false);
    off();
  });

  it("subscribes the channel lazily on first listener and unsubscribes on last detach", () => {
    expect(subscribeChannel).not.toHaveBeenCalled();

    const offA = store.subscribeAnalystRuns(vi.fn());
    expect(subscribeChannel).toHaveBeenCalledTimes(1);
    expect(subs[0].spec).toEqual({ kind: "analyst-runs" });

    const offB = store.subscribeAnalystRuns(vi.fn());
    expect(subscribeChannel).toHaveBeenCalledTimes(1);

    offA();
    expect(subs[0].unsub).not.toHaveBeenCalled();

    offB();
    expect(subs[0].unsub).toHaveBeenCalledTimes(1);
  });

  it("clears runs (but keeps unseen) when the last listener detaches", () => {
    store.setActiveSymbolProvider(() => "MU");
    const off = store.subscribeAnalystRuns(vi.fn());
    subs[0].onPayload({ type: "update", symbol: "NVDA", status: running("preparing") });
    subs[0].onPayload({ type: "update", symbol: "AMD", status: running("writing") });
    subs[0].onPayload({ type: "update", symbol: "AMD", status: { running: false } });
    expect(store.hasUnseen("AMD")).toBe(true);

    off();

    expect(store.isRunning("NVDA")).toBe(false);
    expect(store.hasUnseen("AMD")).toBe(true);
  });
});

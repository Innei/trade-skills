import { beforeEach, describe, expect, it, vi } from "vitest";

const follows = vi.hoisted(() => ({
  symbolFollowState: vi.fn(),
  setSymbolFollowing: vi.fn(),
}));

const scheduler = vi.hoisted(() => ({
  requestImmediateFollow: vi.fn(),
}));

vi.mock("../../packages/core/src/ai/follows.js", () => follows);
vi.mock("../../packages/core/src/ai/scheduler.js", () => scheduler);

const { tsukiRequest } = await import("./helpers.js");

beforeEach(() => {
  follows.symbolFollowState.mockReset();
  follows.setSymbolFollowing.mockReset();
  scheduler.requestImmediateFollow.mockReset();
  follows.symbolFollowState.mockReturnValue({ symbol: "MU.US", following: false, startedAt: null });
  follows.setSymbolFollowing.mockImplementation((symbol: string, following: boolean) => ({
    symbol: symbol.toUpperCase().includes(".") ? symbol.toUpperCase() : `${symbol.toUpperCase()}.US`,
    following,
    startedAt: following ? "2026-07-14T10:00:00.000Z" : null,
  }));
});

describe("symbol follow routes", () => {
  it("returns the persisted status", async () => {
    const res = await tsukiRequest("/api/symbols/mu/follow");
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ symbol: "MU.US", following: false, startedAt: null });
  });

  it("starts persistent following", async () => {
    const res = await tsukiRequest("/api/symbols/mu/follow", { method: "POST" });
    expect(res.status).toBe(200);
    expect(follows.setSymbolFollowing).toHaveBeenCalledWith("mu", true);
    expect(scheduler.requestImmediateFollow).toHaveBeenCalledWith("MU.US");
    expect((await res.json()).data.following).toBe(true);
  });

  it("does not request another immediate run when following was already active", async () => {
    follows.symbolFollowState.mockReturnValue({
      symbol: "MU.US",
      following: true,
      startedAt: "2026-07-14T10:00:00.000Z",
    });
    const res = await tsukiRequest("/api/symbols/mu/follow", { method: "POST" });
    expect(res.status).toBe(200);
    expect(scheduler.requestImmediateFollow).not.toHaveBeenCalled();
  });

  it("stops persistent following", async () => {
    const res = await tsukiRequest("/api/symbols/MU.US/follow", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(follows.setSymbolFollowing).toHaveBeenCalledWith("MU.US", false);
    expect((await res.json()).data.following).toBe(false);
  });
});

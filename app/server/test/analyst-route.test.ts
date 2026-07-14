import { beforeEach, describe, expect, it, vi } from "vitest";

const models = vi.hoisted(() => ({ aiConfig: vi.fn() }));
const analyst = vi.hoisted(() => ({ runAnalyst: vi.fn(), analystRunStatus: vi.fn(), escalationOnCooldown: vi.fn() }));

vi.mock("../../packages/core/src/ai/models.js", () => models);
vi.mock("../../packages/core/src/ai/analyst.js", () => analyst);

const { tsukiRequest } = await import("./helpers.js");

describe("analyst routes", () => {
  beforeEach(() => {
    models.aiConfig.mockReset();
    analyst.runAnalyst.mockReset();
    analyst.analystRunStatus.mockReset();
  });

  it("returns started:false when the analyst layer is disabled", async () => {
    models.aiConfig.mockReturnValue({ commentModel: null, analystModel: null });
    const res = await tsukiRequest("/api/symbols/MU/reassess", { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { started: false, reason: "analyst layer disabled" } });
    expect(analyst.runAnalyst).not.toHaveBeenCalled();
  });

  it("starts a manual run and returns started:true", async () => {
    models.aiConfig.mockReturnValue({ commentModel: null, analystModel: { id: "m" } });
    analyst.runAnalyst.mockReturnValue({ started: true, done: Promise.resolve() });
    const res = await tsukiRequest("/api/symbols/MU/reassess", { method: "POST" });
    expect(await res.json()).toEqual({ ok: true, data: { started: true } });
    expect(analyst.runAnalyst).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: "MU.US", origin: "manual" }),
    );
  });

  it("surfaces started:false with the reason when a run is already in flight", async () => {
    models.aiConfig.mockReturnValue({ commentModel: null, analystModel: { id: "m" } });
    analyst.runAnalyst.mockReturnValue({ started: false, reason: "already running" });
    const res = await tsukiRequest("/api/symbols/MU/reassess", { method: "POST" });
    expect(await res.json()).toEqual({ ok: true, data: { started: false, reason: "already running" } });
  });

  it("returns the live run state for a normalized symbol", async () => {
    const status = {
      running: true,
      origin: "manual",
      phase: "researching",
      activity: "正在整理多周期行情、资金流与持仓",
      startedAt: "2026-07-14T02:03:04.000Z",
      updatedAt: "2026-07-14T02:03:09.000Z",
    };
    analyst.analystRunStatus.mockReturnValue(status);

    const res = await tsukiRequest("/api/symbols/mu/reassess/status");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      data: status,
    });
    expect(analyst.analystRunStatus).toHaveBeenCalledWith("MU.US");
  });
});

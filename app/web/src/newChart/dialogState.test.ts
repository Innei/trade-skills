import { describe, expect, it } from "vitest";
import { canSubmitNewChart, initialNewChartState, newChartReducer } from "./dialogState";

describe("initialNewChartState", () => {
  it("starts idle with an empty symbol and no error", () => {
    const state = initialNewChartState("daily");
    expect(state).toEqual({ symbolInput: "", presetId: "daily", status: "idle", error: null });
  });
});

describe("canSubmitNewChart", () => {
  it("disables submit while symbol is empty or invalid", () => {
    expect(canSubmitNewChart(initialNewChartState("daily"))).toBe(false);
    const invalid = newChartReducer(initialNewChartState("daily"), { type: "setSymbol", value: "700.HK" });
    expect(canSubmitNewChart(invalid)).toBe(false);
  });

  it("enables submit once a valid symbol is entered", () => {
    const state = newChartReducer(initialNewChartState("daily"), { type: "setSymbol", value: "mrvl" });
    expect(canSubmitNewChart(state)).toBe(true);
  });

  it("disables submit while a request is in flight", () => {
    const valid = newChartReducer(initialNewChartState("daily"), { type: "setSymbol", value: "mrvl" });
    const submitting = newChartReducer(valid, { type: "submitStart" });
    expect(canSubmitNewChart(submitting)).toBe(false);
  });
});

describe("newChartReducer", () => {
  it("clears a stale error when the symbol or preset changes", () => {
    const errored = newChartReducer(initialNewChartState("daily"), {
      type: "submitFailure",
      error: { kind: "generic", message: "boom" },
    });
    expect(errored.error).not.toBeNull();
    expect(newChartReducer(errored, { type: "setSymbol", value: "mu" }).error).toBeNull();
    expect(newChartReducer(errored, { type: "setPreset", value: "intraday" }).error).toBeNull();
  });

  it("submitFailure returns to idle and records the error", () => {
    const submitting = newChartReducer(initialNewChartState("daily"), { type: "submitStart" });
    const failed = newChartReducer(submitting, {
      type: "submitFailure",
      error: { kind: "credentials", message: "去设置页" },
    });
    expect(failed.status).toBe("idle");
    expect(failed.error).toEqual({ kind: "credentials", message: "去设置页" });
  });
});

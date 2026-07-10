import { describe, expect, it } from "vitest";
import { buildChartPayload, CHART_PRESETS } from "./presets";

describe("CHART_PRESETS", () => {
  it("exposes 2-3 presets with unique ids", () => {
    expect(CHART_PRESETS.length).toBeGreaterThanOrEqual(2);
    expect(CHART_PRESETS.length).toBeLessThanOrEqual(3);
    expect(new Set(CHART_PRESETS.map((p) => p.id)).size).toBe(CHART_PRESETS.length);
  });
});

describe("buildChartPayload", () => {
  it("builds a sepa payload for the daily preset", () => {
    expect(buildChartPayload("daily", "MRVL.US")).toEqual({ type: "sepa", symbol: "MRVL.US" });
  });

  it("builds a preview-mode intraday payload (no prediction field)", () => {
    const payload = buildChartPayload("intraday", "MU.US");
    expect(payload).toEqual({ type: "intraday", symbol: "MU.US" });
    expect(payload).not.toHaveProperty("prediction");
  });

  it("builds a flow payload", () => {
    expect(buildChartPayload("flow", "NVDA.US")).toEqual({ type: "flow", symbol: "NVDA.US" });
  });
});

import { describe, expect, it } from "vitest";
import { activeSymbolFromRoute } from "./GlobalNotifications";

describe("activeSymbolFromRoute", () => {
  it("normalizes the visible symbol route", () => {
    expect(activeSymbolFromRoute("/symbol/mu?analysis=old-chart")).toBe("MU.US");
    expect(activeSymbolFromRoute("/symbol/NVDA.US")).toBe("NVDA.US");
  });

  it("returns null after the chart is closed", () => {
    expect(activeSymbolFromRoute("/")).toBeNull();
    expect(activeSymbolFromRoute("/research")).toBeNull();
  });
});

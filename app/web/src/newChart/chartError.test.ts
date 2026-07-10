import { describe, expect, it } from "vitest";
import { ApiError } from "../api";
import { classifyChartError } from "./chartError";

describe("classifyChartError", () => {
  it("flags NO_CREDENTIALS 503 as a credentials error with a settings-pointing message", () => {
    const err = new ApiError("longbridge not configured", 503, "NO_CREDENTIALS");
    const result = classifyChartError(err);
    expect(result.kind).toBe("credentials");
    expect(result.message).toMatch(/设置/);
  });

  it("flags CREDENTIALS_REJECTED 503 as a credentials error", () => {
    const err = new ApiError("token expired", 503, "CREDENTIALS_REJECTED");
    expect(classifyChartError(err).kind).toBe("credentials");
  });

  it("does not flag a 503 without a credentials code", () => {
    const err = new ApiError("provider down", 503);
    expect(classifyChartError(err).kind).toBe("generic");
  });

  it("does not flag a non-503 error carrying a credentials code", () => {
    const err = new ApiError("bad request", 400, "NO_CREDENTIALS");
    expect(classifyChartError(err).kind).toBe("generic");
  });

  it("passes through the raw message for generic errors", () => {
    const err = new ApiError("symbol not found", 404);
    expect(classifyChartError(err)).toEqual({ kind: "generic", message: "symbol not found" });
  });

  it("handles plain Error and non-Error values", () => {
    expect(classifyChartError(new Error("boom")).message).toBe("boom");
    expect(classifyChartError("boom").message).toBe("boom");
  });
});

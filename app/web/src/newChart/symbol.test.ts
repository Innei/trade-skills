import { describe, expect, it } from "vitest";
import { isValidSymbolInput, normalizeSymbolInput, toChartSymbol } from "./symbol";

describe("normalizeSymbolInput", () => {
  it("trims and uppercases", () => {
    expect(normalizeSymbolInput("  mrvl  ")).toBe("MRVL");
  });
});

describe("isValidSymbolInput", () => {
  it("accepts 1-5 letter tickers", () => {
    expect(isValidSymbolInput("A")).toBe(true);
    expect(isValidSymbolInput("MRVL")).toBe(true);
    expect(isValidSymbolInput("ABCDE")).toBe(true);
  });

  it("accepts an explicit .US suffix", () => {
    expect(isValidSymbolInput("MU.US")).toBe(true);
  });

  it("rejects other suffixes, numbers, or overlong tickers", () => {
    expect(isValidSymbolInput("700.HK")).toBe(false);
    expect(isValidSymbolInput("ABCDEF")).toBe(false);
    expect(isValidSymbolInput("MU1")).toBe(false);
    expect(isValidSymbolInput("")).toBe(false);
  });
});

describe("toChartSymbol", () => {
  it("appends .US when missing", () => {
    expect(toChartSymbol("mrvl")).toBe("MRVL.US");
  });

  it("keeps an already-qualified symbol unchanged", () => {
    expect(toChartSymbol("mu.us")).toBe("MU.US");
  });

  it("returns null for invalid input", () => {
    expect(toChartSymbol("700.HK")).toBeNull();
    expect(toChartSymbol("")).toBeNull();
  });
});

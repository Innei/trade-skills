import { describe, expect, it } from "vitest";
import { loadPro } from "../src/pro/loader.js";
import { freeHooks, getPro, isProPresent } from "../src/pro/registry.js";

describe("pro loader", () => {
  it("falls back to free mode when @kansoku/pro is missing", async () => {
    const loaded = await loadPro();
    expect(loaded).toBe(false);
    expect(isProPresent()).toBe(false);
    expect(getPro()).toBeNull();
  });

  it("free-mode default hooks are inert", async () => {
    const items = [{ ts: "2026-07-10T12:30:00.000Z", title: "CPI", estimate: null, previous: null }];
    await expect(freeHooks.filterMacroForSymbol("NVDA", items)).resolves.toEqual(items);
    expect(freeHooks.listFollowedSymbols()).toEqual([]);
    expect(freeHooks.setSymbolFollowing("NVDA", true)).toEqual({
      symbol: "NVDA",
      following: false,
      startedAt: null,
    });
    await expect(freeHooks.listComments("NVDA", "2026-07-10")).resolves.toEqual([]);
    await expect(freeHooks.listAllCommentDates()).resolves.toEqual([]);
    expect(freeHooks.activeSettingsRevision()).toBe(0);
  });
});

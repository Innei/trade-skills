import { describe, expect, it } from "vitest";
import { FEATURES } from "../../pro-api/src/features.js";

describe("FEATURES catalog", () => {
  it("matches snapshot", () => {
    expect(FEATURES).toMatchInlineSnapshot(`
      {
        "deep-dive": {
          "tier": "pro",
        },
        "research-ai": {
          "tier": "pro",
        },
        "symbol-follow": {
          "tier": "pro",
        },
      }
    `);
  });
});

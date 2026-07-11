import { describe, expect, it } from "vitest";
import { allRoutes } from "../../packages/core/src/contract/index.js";

const WHITELISTED_PREFIXES = ["/api/legacy", "/api/ws"];

describe("route parity", () => {
  it("every contract route is registered on the Tsuki app with the same method + path", async () => {
    const { createKernel } = await import("../src/bootstrap.js");
    const { app } = await createKernel();
    const instance = app.getInstance();
    const registered = instance.routes
      .filter((r) => r.method !== "ALL")
      .map((r) => ({ method: r.method.toUpperCase(), path: r.path.replace(/\/\*$/, "") }));

    const expected: { method: string; path: string }[] = [];
    for (const group of Object.values(allRoutes)) {
      for (const meta of Object.values(group.routes)) {
        const suffix = meta.path === "/" ? "" : meta.path;
        expected.push({ method: meta.method, path: `/api/${group.group}${suffix}` });
      }
    }

    for (const exp of expected) {
      const found = registered.some((r) => r.method === exp.method && r.path === exp.path);
      expect(found, `missing registered route for ${exp.method} ${exp.path}`).toBe(true);
    }

    const uncovered = registered.filter((r) => {
      if (WHITELISTED_PREFIXES.some((p) => r.path === p || r.path.startsWith(`${p}/`))) return false;
      return !expected.some((e) => e.method === r.method && e.path === r.path);
    });
    expect(uncovered, `routes not covered by any contract table: ${JSON.stringify(uncovered)}`).toEqual([]);
  });
});

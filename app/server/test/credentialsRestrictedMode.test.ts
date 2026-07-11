import { afterEach, describe, expect, it } from "vitest";
import { setCredentialProviderForTests } from "../src/services/credentials/registry.js";
import { resetCredentialStatusForTests } from "../src/services/credentials/credentialStatus.js";
import type { CredentialProvider } from "../src/services/credentials/types.js";

const { tsukiRequest } = await import("./helpers.js");

const nullProvider: CredentialProvider = {
  getLongbridgeAuth: async () => null,
  onChange: () => () => {},
};

describe("restricted mode (no Longbridge credentials configured)", () => {
  afterEach(() => {
    setCredentialProviderForTests(null);
    resetCredentialStatusForTests();
  });

  it("boots cleanly and health stays 200", async () => {
    setCredentialProviderForTests(nullProvider);
    const res = await tsukiRequest("/api/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("charts CRUD (no market data needed) keeps working fully", async () => {
    setCredentialProviderForTests(nullProvider);
    const res = await tsukiRequest("/api/charts");
    expect(res.status).toBe(200);
  });

  it("a market-data endpoint returns the NO_CREDENTIALS envelope with status 503", async () => {
    setCredentialProviderForTests(nullProvider);
    const res = await tsukiRequest("/api/positions");
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: false,
      error: "longbridge credentials not configured",
      code: "NO_CREDENTIALS",
    });
  });

  it("GET /api/credentials/status reports configured:false with no lastError", async () => {
    setCredentialProviderForTests(nullProvider);
    const res = await tsukiRequest("/api/credentials/status");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, data: { configured: false, method: null, lastError: null } });
  });
});

describe("GET /api/credentials/status with credentials configured", () => {
  afterEach(() => {
    setCredentialProviderForTests(null);
    resetCredentialStatusForTests();
  });

  it("reports configured:true", async () => {
    setCredentialProviderForTests({
      getLongbridgeAuth: async () => ({ kind: "apikey", appKey: "k", appSecret: "s", accessToken: "t" }),
      onChange: () => () => {},
    });
    const res = await tsukiRequest("/api/credentials/status");
    const body = await res.json();
    expect(body).toEqual({ ok: true, data: { configured: true, method: "apikey", lastError: null } });
  });
});

describe("GET /api/credentials/status with an OAuth provider", () => {
  afterEach(() => {
    setCredentialProviderForTests(null);
    resetCredentialStatusForTests();
  });

  it("reports configured:true with method oauth", async () => {
    setCredentialProviderForTests({
      getLongbridgeAuth: async () => ({ kind: "oauth", clientId: "client-id" }),
      onChange: () => () => {},
    });
    const res = await tsukiRequest("/api/credentials/status");
    const body = await res.json();
    expect(body).toEqual({ ok: true, data: { configured: true, method: "oauth", lastError: null } });
  });
});

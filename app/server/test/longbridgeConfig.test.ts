import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  fromApikey: vi.fn((appKey: string, appSecret: string, accessToken: string) => ({ kind: "apikey", appKey, appSecret, accessToken })),
  fromOAuth: vi.fn((oauth: unknown) => ({ kind: "oauth", oauth })),
  oauthBuild: vi.fn(async (clientId: string) => ({ clientId })),
}));

vi.mock("longbridge", () => ({
  Config: { fromApikey: sdk.fromApikey, fromOAuth: sdk.fromOAuth },
  OAuth: { build: sdk.oauthBuild },
}));

describe("resolveLongbridgeConfig", () => {
  beforeEach(() => {
    vi.resetModules();
    sdk.fromApikey.mockClear();
    sdk.fromOAuth.mockClear();
    sdk.oauthBuild.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not call the SDK or the credential provider at import time", async () => {
    const registry = await import("../src/services/credentials/registry.js");
    const spy = vi.spyOn(registry, "getCredentialProvider");
    await import("../src/services/marketdata/longbridgeConfig.js");
    expect(spy).not.toHaveBeenCalled();
    expect(sdk.fromApikey).not.toHaveBeenCalled();
  });

  it("builds an apikey Config when the provider returns apikey auth", async () => {
    const { setCredentialProviderForTests } = await import("../src/services/credentials/registry.js");
    setCredentialProviderForTests({
      getLongbridgeAuth: async () => ({ kind: "apikey", appKey: "k", appSecret: "s", accessToken: "t" }),
      onChange: () => () => {},
    });
    const { resolveLongbridgeConfig } = await import("../src/services/marketdata/longbridgeConfig.js");

    const config = await resolveLongbridgeConfig();

    expect(sdk.fromApikey).toHaveBeenCalledWith("k", "s", "t");
    expect(config).toEqual({ kind: "apikey", appKey: "k", appSecret: "s", accessToken: "t" });
    setCredentialProviderForTests(null);
  });

  it("throws NoCredentialsError when the provider returns null", async () => {
    vi.stubEnv("LONGBRIDGE_OAUTH_CLIENT_ID", "");
    const { setCredentialProviderForTests } = await import("../src/services/credentials/registry.js");
    setCredentialProviderForTests({
      getLongbridgeAuth: async () => null,
      onChange: () => () => {},
    });
    const { resolveLongbridgeConfig } = await import("../src/services/marketdata/longbridgeConfig.js");
    const { NoCredentialsError } = await import("../src/services/credentials/errors.js");

    await expect(resolveLongbridgeConfig()).rejects.toBeInstanceOf(NoCredentialsError);
    setCredentialProviderForTests(null);
  });

  it("builds an OAuth Config when the provider returns oauth auth", async () => {
    const { setCredentialProviderForTests } = await import("../src/services/credentials/registry.js");
    setCredentialProviderForTests({
      getLongbridgeAuth: async () => ({ kind: "oauth", clientId: "client-123" }),
      onChange: () => () => {},
    });
    const { resolveLongbridgeConfig } = await import("../src/services/marketdata/longbridgeConfig.js");

    const config = await resolveLongbridgeConfig();

    expect(sdk.oauthBuild).toHaveBeenCalledWith("client-123", expect.any(Function));
    expect(sdk.fromOAuth).toHaveBeenCalled();
    expect(config).toMatchObject({ kind: "oauth" });
    expect(sdk.fromApikey).not.toHaveBeenCalled();
    setCredentialProviderForTests(null);
  });

  it("routes the OAuth authorization URL through the configured opener", async () => {
    sdk.oauthBuild.mockImplementationOnce(async (clientId: string, onOpenUrl?: unknown) => {
      (onOpenUrl as (err: Error | null, url: string) => void)(null, "https://auth.example/authorize");
      return { clientId };
    });
    const { setCredentialProviderForTests } = await import("../src/services/credentials/registry.js");
    setCredentialProviderForTests({
      getLongbridgeAuth: async () => ({ kind: "oauth", clientId: "client-123" }),
      onChange: () => () => {},
    });
    const { initAuthUrlOpener } = await import("../src/services/credentials/authUrlOpener.js");
    const opened: string[] = [];
    initAuthUrlOpener((url) => opened.push(url));
    const { resolveLongbridgeConfig } = await import("../src/services/marketdata/longbridgeConfig.js");

    await resolveLongbridgeConfig();

    expect(opened).toEqual(["https://auth.example/authorize"]);
    setCredentialProviderForTests(null);
  });

  it("keeps preferring OAuth from the default env provider when LONGBRIDGE_OAUTH_CLIENT_ID is set", async () => {
    vi.stubEnv("LONGBRIDGE_OAUTH_CLIENT_ID", "client-env");
    const { resolveLongbridgeConfig } = await import("../src/services/marketdata/longbridgeConfig.js");

    const config = await resolveLongbridgeConfig();

    expect(sdk.oauthBuild).toHaveBeenCalledWith("client-env", expect.any(Function));
    expect(config).toMatchObject({ kind: "oauth" });
    expect(sdk.fromApikey).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from "vitest";
import type { OAuth } from "longbridge";
import { performOAuthLogin } from "../src/oauthLogin.js";

const FAKE_OAUTH = { handle: true } as unknown as OAuth;

describe("performOAuthLogin", () => {
  it("opens the authorization URL and succeeds when build and verify pass", async () => {
    const openUrl = vi.fn();
    const verify = vi.fn().mockResolvedValue(undefined);
    const result = await performOAuthLogin("client-123", {
      openUrl,
      buildOAuth: async (clientId, onOpenUrl) => {
        expect(clientId).toBe("client-123");
        onOpenUrl(null, "https://auth.example/authorize");
        return FAKE_OAUTH;
      },
      verify,
    });
    expect(result).toEqual({ ok: true });
    expect(openUrl).toHaveBeenCalledWith("https://auth.example/authorize");
    expect(verify).toHaveBeenCalledWith(FAKE_OAUTH);
  });

  it("returns a timeout error when the browser flow is abandoned", async () => {
    const result = await performOAuthLogin("client-123", {
      openUrl: vi.fn(),
      buildOAuth: () => new Promise<never>(() => {}),
      verify: vi.fn(),
      timeoutMs: 10,
    });
    expect(result).toEqual({ ok: false, error: "授权超时，请重试并在浏览器中完成登录" });
  });

  it("classifies a build failure into a fixed safe message", async () => {
    const result = await performOAuthLogin("client-123", {
      openUrl: vi.fn(),
      buildOAuth: async () => {
        throw new Error("401 unauthorized");
      },
      verify: vi.fn(),
    });
    expect(result).toEqual({
      ok: false,
      error: "Longbridge rejected the credentials — check the app key, app secret, and access token.",
    });
  });

  it("classifies a verify failure after a successful build", async () => {
    const result = await performOAuthLogin("client-123", {
      openUrl: vi.fn(),
      buildOAuth: async () => FAKE_OAUTH,
      verify: async () => {
        throw new Error("ECONNREFUSED quote api unreachable");
      },
    });
    expect(result).toEqual({ ok: false, error: "Could not reach Longbridge — check the network connection." });
  });
});

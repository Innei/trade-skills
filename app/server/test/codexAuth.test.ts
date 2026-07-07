import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createCodexApiKeyLoader } from "../src/ai/codexAuth.js";

function jwt(expSeconds: number): string {
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds })).toString("base64url");
  return `head.${payload}.sig`;
}

async function writeAuthFile(token: string, extra: Record<string, unknown> = {}): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "codex-auth-"));
  const file = path.join(dir, "auth.json");
  await writeFile(
    file,
    JSON.stringify({
      auth_mode: "chatgpt",
      OPENAI_API_KEY: null,
      tokens: {
        id_token: "id-token",
        access_token: token,
        refresh_token: "refresh-1",
        account_id: "acct-1",
      },
      last_refresh: "2026-07-01T00:00:00.000Z",
      ...extra,
    }),
  );
  return file;
}

const NOW = 1_780_000_000_000;

describe("createCodexApiKeyLoader", () => {
  it("returns undefined for other providers without touching the auth file", async () => {
    const refresh = vi.fn();
    const getApiKey = createCodexApiKeyLoader({
      authPath: "/nonexistent/auth.json",
      refresh,
      now: () => NOW,
    });
    await expect(getApiKey("anthropic")).resolves.toBeUndefined();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("returns the stored access token while it is still valid", async () => {
    const token = jwt(NOW / 1000 + 3600);
    const file = await writeAuthFile(token);
    const refresh = vi.fn();
    const getApiKey = createCodexApiKeyLoader({ authPath: file, refresh, now: () => NOW });
    await expect(getApiKey("openai-codex")).resolves.toBe(token);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes an expired token and writes it back preserving other fields", async () => {
    const expired = jwt(NOW / 1000 - 10);
    const fresh = jwt(NOW / 1000 + 3600);
    const file = await writeAuthFile(expired);
    const refresh = vi.fn(async () => ({ access: fresh, refresh: "refresh-2", expires: NOW + 3_600_000 }));
    const getApiKey = createCodexApiKeyLoader({ authPath: file, refresh, now: () => NOW });

    await expect(getApiKey("openai-codex")).resolves.toBe(fresh);
    expect(refresh).toHaveBeenCalledWith("refresh-1");

    const saved = JSON.parse(await readFile(file, "utf8"));
    expect(saved.tokens.access_token).toBe(fresh);
    expect(saved.tokens.refresh_token).toBe("refresh-2");
    expect(saved.tokens.id_token).toBe("id-token");
    expect(saved.tokens.account_id).toBe("acct-1");
    expect(saved.auth_mode).toBe("chatgpt");
    expect(saved.last_refresh).toBe(new Date(NOW).toISOString());
  });

  it("returns undefined when the auth file is missing", async () => {
    const getApiKey = createCodexApiKeyLoader({
      authPath: "/nonexistent/auth.json",
      refresh: vi.fn(),
      now: () => NOW,
    });
    await expect(getApiKey("openai-codex")).resolves.toBeUndefined();
  });

  it("returns undefined when refresh fails", async () => {
    const file = await writeAuthFile(jwt(NOW / 1000 - 10));
    const refresh = vi.fn(async () => {
      throw new Error("boom");
    });
    const getApiKey = createCodexApiKeyLoader({ authPath: file, refresh, now: () => NOW });
    await expect(getApiKey("openai-codex")).resolves.toBeUndefined();
  });

  it("dedupes concurrent refreshes into a single call", async () => {
    const fresh = jwt(NOW / 1000 + 3600);
    const file = await writeAuthFile(jwt(NOW / 1000 - 10));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const refresh = vi.fn(async () => {
      await gate;
      return { access: fresh, refresh: "refresh-2", expires: NOW + 3_600_000 };
    });
    const getApiKey = createCodexApiKeyLoader({ authPath: file, refresh, now: () => NOW });

    const [a, b] = [getApiKey("openai-codex"), getApiKey("openai-codex")];
    release();
    await expect(a).resolves.toBe(fresh);
    await expect(b).resolves.toBe(fresh);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("treats an undecodable token as expired and refreshes", async () => {
    const fresh = jwt(NOW / 1000 + 3600);
    const file = await writeAuthFile("not-a-jwt");
    const refresh = vi.fn(async () => ({ access: fresh, refresh: "refresh-2", expires: NOW + 3_600_000 }));
    const getApiKey = createCodexApiKeyLoader({ authPath: file, refresh, now: () => NOW });
    await expect(getApiKey("openai-codex")).resolves.toBe(fresh);
  });
});

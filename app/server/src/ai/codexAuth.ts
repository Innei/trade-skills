import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { refreshOpenAICodexToken } from "@earendil-works/pi-ai/oauth";

const EXPIRY_MARGIN_MS = 60_000;

interface CodexTokens {
  access_token: string;
  refresh_token: string;
  [key: string]: unknown;
}

interface CodexAuthFile {
  tokens?: CodexTokens;
  last_refresh?: string;
  [key: string]: unknown;
}

export interface CodexAuthDeps {
  authPath?: string;
  refresh?: (refreshToken: string) => Promise<{ access: string; refresh: string; expires: number }>;
  now?: () => number;
}

function defaultAuthPath(): string {
  const home = process.env.CODEX_HOME || path.join(homedir(), ".codex");
  return path.join(home, "auth.json");
}

function jwtExpiryMs(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof claims.exp === "number" ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}

async function readAuthFile(authPath: string): Promise<CodexAuthFile | null> {
  try {
    const parsed = JSON.parse(await readFile(authPath, "utf8")) as CodexAuthFile;
    if (typeof parsed?.tokens?.access_token !== "string" || typeof parsed.tokens.refresh_token !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function createCodexApiKeyLoader(deps: CodexAuthDeps = {}) {
  const refresh = deps.refresh ?? refreshOpenAICodexToken;
  const now = deps.now ?? (() => Date.now());
  let inFlight: Promise<string | undefined> | null = null;

  async function refreshAndPersist(authPath: string, auth: CodexAuthFile): Promise<string | undefined> {
    const tokens = auth.tokens as CodexTokens;
    try {
      const next = await refresh(tokens.refresh_token);
      const updated: CodexAuthFile = {
        ...auth,
        tokens: { ...tokens, access_token: next.access, refresh_token: next.refresh },
        last_refresh: new Date(now()).toISOString(),
      };
      await writeFile(authPath, JSON.stringify(updated, null, 2));
      return next.access;
    } catch (err) {
      console.error(
        `[codex-auth] token refresh failed: ${err instanceof Error ? err.message : String(err)} — run \`codex\` to re-login`,
      );
      return undefined;
    }
  }

  return async function getApiKey(provider: string): Promise<string | undefined> {
    if (provider !== "openai-codex") return undefined;

    const authPath = deps.authPath ?? defaultAuthPath();
    const auth = await readAuthFile(authPath);
    if (!auth) {
      console.error(`[codex-auth] cannot read ${authPath} — run \`codex\` to login first`);
      return undefined;
    }

    const expiry = jwtExpiryMs(auth.tokens!.access_token);
    if (expiry !== null && now() < expiry - EXPIRY_MARGIN_MS) {
      return auth.tokens!.access_token;
    }

    if (!inFlight) {
      inFlight = refreshAndPersist(authPath, auth).finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  };
}

export const getCodexApiKey = createCodexApiKeyLoader();

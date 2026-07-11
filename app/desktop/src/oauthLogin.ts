import { Config, OAuth, QuoteContext } from "longbridge";
import type { TestCredentialsResult } from "./credentialsBridge.js";
import { classifyCredentialTestError } from "./credentialsTestErrors.js";

export const DEFAULT_LONGBRIDGE_OAUTH_CLIENT_ID = "74580679-9988-45b1-a730-2a59161e617a";

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const VERIFY_SYMBOL = "AAPL.US";

export interface OAuthLoginDeps {
  openUrl: (url: string) => void;
  buildOAuth?: (clientId: string, onOpenUrl: (err: Error | null, url: string) => void) => Promise<OAuth>;
  verify?: (oauth: OAuth) => Promise<void>;
  timeoutMs?: number;
}

async function defaultVerify(oauth: OAuth): Promise<void> {
  const ctx = await QuoteContext.new(Config.fromOAuth(oauth));
  await ctx.quote([VERIFY_SYMBOL]);
}

export async function performOAuthLogin(clientId: string, deps: OAuthLoginDeps): Promise<TestCredentialsResult> {
  const buildOAuth = deps.buildOAuth ?? ((id, onOpenUrl) => OAuth.build(id, onOpenUrl));
  const verify = deps.verify ?? defaultVerify;
  const timeoutMs = deps.timeoutMs ?? LOGIN_TIMEOUT_MS;

  let openUrlError: string | null = null;
  const build = buildOAuth(clientId, (err, url) => {
    if (err) {
      openUrlError = err.message;
      return;
    }
    deps.openUrl(url);
  });

  // OAuth.build resolves only after the browser flow completes; if the user
  // abandons the browser tab the promise hangs forever, so cap the wait.
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("authorization timed out")), timeoutMs);
  });

  try {
    const oauth = await Promise.race([build, timeout]);
    await verify(oauth);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "authorization timed out") {
      return { ok: false, error: "授权超时，请重试并在浏览器中完成登录" };
    }
    return { ok: false, error: classifyCredentialTestError(openUrlError ?? message) };
  } finally {
    clearTimeout(timer);
  }
}

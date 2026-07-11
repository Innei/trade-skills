import type { SecretBox } from "./ai/secretBox.js";
import { initAiSettings } from "./ai/initAiSettings.js";
import { getDb } from "./db/index.js";
import { loadDotenv } from "./dotenv.js";
import { initAuthUrlOpener, type AuthUrlOpener } from "./services/credentials/authUrlOpener.js";
import { initCredentialProvider } from "./services/credentials/registry.js";
import type { CredentialProvider } from "./services/credentials/types.js";

export interface ServerRuntimeOptions {
  credentialProvider?: CredentialProvider;
  secretBox?: SecretBox;
  openAuthUrl?: AuthUrlOpener;
}

export function initServerRuntime(opts?: ServerRuntimeOptions): void {
  loadDotenv();

  // 1h prompt-cache TTL: commentator sessions re-run at 5-min heartbeats, the
  // default 5-min ephemeral TTL expires right at the boundary and misses.
  process.env.PI_CACHE_RETENTION ??= "long";

  initCredentialProvider(opts?.credentialProvider);
  initAuthUrlOpener(opts?.openAuthUrl);
  initAiSettings(getDb(), { secretBox: opts?.secretBox });
}

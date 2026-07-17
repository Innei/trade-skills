import type { SecretBox } from "@kansoku/pro-api";
import { getDb } from "../../packages/core/src/db/index.js";
import { loadPro } from "../../packages/core/src/pro/loader.js";
import { getPro } from "../../packages/core/src/pro/registry.js";
import {
  createWatchedMarketsStore,
  setActiveWatchedMarketsStore,
} from "../../packages/core/src/services/watchedMarketsStore.js";
import { loadDotenv } from "./dotenv.js";
import { initAuthUrlOpener, type AuthUrlOpener } from "../../packages/core/src/services/credentials/authUrlOpener.js";
import { initCredentialProvider } from "../../packages/core/src/services/credentials/registry.js";
import type { CredentialProvider } from "../../packages/core/src/services/credentials/types.js";

export interface ServerRuntimeOptions {
  credentialProvider?: CredentialProvider;
  secretBox?: SecretBox;
  openAuthUrl?: AuthUrlOpener;
}

export async function initServerRuntime(opts?: ServerRuntimeOptions): Promise<void> {
  loadDotenv();

  // 1h prompt-cache TTL: commentator sessions re-run at 5-min heartbeats, the
  // default 5-min ephemeral TTL expires right at the boundary and misses.
  process.env.PI_CACHE_RETENTION ??= "long";

  initCredentialProvider(opts?.credentialProvider);
  initAuthUrlOpener(opts?.openAuthUrl);
  setActiveWatchedMarketsStore(createWatchedMarketsStore(getDb()));

  await loadPro();
  await getPro()?.initRuntime?.(getDb(), opts?.secretBox);
}

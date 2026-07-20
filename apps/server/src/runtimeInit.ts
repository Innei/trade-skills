import type { SecretBox } from '@kansoku/pro-api';
import { getAiRuntime, initAiSettings } from '@kansoku/core/ai/initAiSettings';
import { getDb } from '@kansoku/core/db/index';
import { setProductionHost } from '@kansoku/core/license/dodoEnv';
import { startLicenseRevalidation } from '@kansoku/core/license/licenseSchedule';
import { initLicenseManager } from '@kansoku/core/license/licenseState';
import {
  createWatchedMarketsStore,
  setActiveWatchedMarketsStore,
} from '@kansoku/core/services/watchedMarketsStore';
import { loadDotenv } from './dotenv.js';
import {
  initAuthUrlOpener,
  type AuthUrlOpener,
} from '@kansoku/core/services/credentials/authUrlOpener';
import { initCredentialProvider } from '@kansoku/core/services/credentials/registry';
import type { CredentialProvider } from '@kansoku/core/services/credentials/types';
import { setProPresent } from '@kansoku/core/pro/bundleState';
import { registerProChannels } from '@kansoku/core/pro/channels';
import { registerProHooks } from '@kansoku/core/pro/hooks';
import { registerProAiExtension } from '@kansoku/core/pro/aiExtension';
import type { ServerProComposition } from './edition/types.js';

export interface ServerRuntimeOptions {
  credentialProvider?: CredentialProvider;
  secretBox?: SecretBox;
  openAuthUrl?: AuthUrlOpener;
  // True when this host is a production artifact (packaged desktop app,
  // NODE_ENV=production server). Pro uses it to pick Dodo live vs test.
  productionHost?: boolean;
}

export async function initServerRuntime(
  opts?: ServerRuntimeOptions,
): Promise<ServerProComposition | null> {
  loadDotenv();

  // 1h prompt-cache TTL: commentator sessions re-run at 5-min heartbeats, the
  // default 5-min ephemeral TTL expires right at the boundary and misses.
  process.env.PI_CACHE_RETENTION ??= 'long';

  initCredentialProvider(opts?.credentialProvider);
  initAuthUrlOpener(opts?.openAuthUrl);
  setActiveWatchedMarketsStore(createWatchedMarketsStore(getDb()));
  initAiSettings(getDb(), { secretBox: opts?.secretBox });

  const productionHost = opts?.productionHost ?? process.env.NODE_ENV === 'production';
  setProductionHost(productionHost);
  // The host passes no secretBox in dev (plaintext keyfile mode) —
  // initAiSettings resolves the fallback box, so the license store must take
  // the resolved one, not the raw (possibly undefined) opts value.
  initLicenseManager(getDb(), getAiRuntime().secretBox);
  startLicenseRevalidation();

  const proComposition = await import('./edition/pro.js')
    .then((m) => m.loadProComposition())
    .catch((error: unknown) => {
      console.warn('[server] pro composition unavailable, running free', error);
      return null;
    });
  setProPresent(proComposition != null);
  if (proComposition?.hooks) registerProHooks(proComposition.hooks);
  if (proComposition?.aiExtension) registerProAiExtension(proComposition.aiExtension);
  if (proComposition?.realtimeChannels) registerProChannels(proComposition.realtimeChannels);
  await proComposition?.start?.();
  return proComposition;
}

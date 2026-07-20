import type { SecretBox } from '@kansoku/pro-api';
import { EDITION_ABI_VERSION } from '@kansoku/pro-api/edition';
import { createLogger } from '@tsuki-hono/common';
import { getAiRuntime, initAiSettings } from '@kansoku/core/ai/initAiSettings';
import { getActiveSettingsStore } from '@kansoku/core/ai/settingsStore';
import { getDb } from '@kansoku/core/db/index';
import type { BaseServerEdition } from '@kansoku/core/edition/base';
import type { ServerEditionHost } from '@kansoku/core/edition/host';
import { KANSOKU_HOME } from '@kansoku/core/env';
import { setProductionHost } from '@kansoku/core/license/dodoEnv';
import { isLicensed } from '@kansoku/core/license/licenseGate';
import { startLicenseRevalidation } from '@kansoku/core/license/licenseSchedule';
import { getActiveBundleKey, initLicenseManager } from '@kansoku/core/license/licenseState';
import {
  configureCapabilitiesService,
} from '@kansoku/core/modules/capabilities/capabilities.service';
import { configureSymbolsService } from '@kansoku/core/modules/symbols/symbols.service';
import {
  configureDefaultAiTurnPipeline,
  EditionAiTurnPipeline,
  EditionDeepDiveService,
  EditionFollowAutomation,
} from '@kansoku/core/pro/domain/defaultImplementations';
import { setEncBundlePresent } from '@kansoku/core/pro/bundleState';
import { EditionRuntime } from '@kansoku/core/pro/editionRuntime';
import type { EditionActivation } from '@kansoku/core/pro/editionLoader';
import { loadEdition, loadEditionFromDevDist, proDevDistDir } from '@kansoku/core/pro/editionLoader';
import { ServerEdition } from '@kansoku/core/edition/serverEdition';
import {
  createWatchedMarketsStore,
  getActiveWatchedMarketsStore,
  setActiveWatchedMarketsStore,
} from '@kansoku/core/services/watchedMarketsStore';
import { loadDotenv } from './dotenv.js';
import { readGeneratedPublicCommit } from './generatedPublicCommit.js';
import { serverEncLayout } from './proEncLayout.js';
import {
  initAuthUrlOpener,
  type AuthUrlOpener,
} from '@kansoku/core/services/credentials/authUrlOpener';
import { initCredentialProvider } from '@kansoku/core/services/credentials/registry';
import type { CredentialProvider } from '@kansoku/core/services/credentials/types';

export interface ServerRuntimeOptions {
  credentialProvider?: CredentialProvider;
  secretBox?: SecretBox;
  openAuthUrl?: AuthUrlOpener;
  // Electron bundles this whole call chain into one file at a different
  // directory depth (see editionLoader.ts's proDevDistDir()) — the desktop
  // host passes its own app root here so the pro slot (both pro.enc and, in
  // dev, dist-dev/) still resolves; the Tsuki server host runs TS directly
  // and leaves this unset.
  proAppDir?: string;
  // True when this host is a production artifact (packaged desktop app,
  // NODE_ENV=production server). Pro uses it to pick Dodo live vs test.
  productionHost?: boolean;
  // Overrides the build-time-generated public-commit.json read (see
  // generatedPublicCommit.ts) for hosts (e.g. desktop) that embed their own
  // value instead of relying on the server's generated file.
  expectedPublicCommit?: string;
}

export interface ServerRuntimeResult {
  host: ServerEditionHost;
  edition: BaseServerEdition;
  // Whether a real edition bundle actually activated for the server runtime
  // (from pro.enc or, in dev, dist-dev/) — true means callers may still load
  // further edition-protocol runtimes (e.g. desktop) against the same
  // source in this process; false means the server ran the free ServerEdition
  // (bundle absent/locked/rejected).
  bundleActive: boolean;
  // Only meaningful when bundleActive===true: which source produced the
  // active edition, so callers resolving a second runtime (desktop) in the
  // same process (see kernel.ts) know whether to retry via loadEdition()
  // against the same pro.enc or via loadEditionFromDevDist() against the
  // same dist-dev/ directory. Undefined when bundleActive===false.
  editionSource?: 'enc' | 'dist-dev';
}

function activateServerEditionCapabilities(
  edition: BaseServerEdition,
  activation: EditionActivation<BaseServerEdition>,
): void {
  const capabilities = edition.proCapabilities?.() ?? {};
  configureCapabilitiesService(new EditionRuntime(activation));
  if (capabilities.hooks) {
    configureSymbolsService({
      followAutomation: new EditionFollowAutomation(capabilities.hooks),
      deepDiveService: new EditionDeepDiveService(capabilities.hooks),
    });
  }
  configureDefaultAiTurnPipeline(() => new EditionAiTurnPipeline(capabilities.aiExtension));
}

export async function initServerRuntime(
  opts?: ServerRuntimeOptions,
): Promise<ServerRuntimeResult> {
  loadDotenv();

  // 1h prompt-cache TTL: commentator sessions re-run at 5-min heartbeats, the
  // default 5-min ephemeral TTL expires right at the boundary and misses.
  process.env.PI_CACHE_RETENTION ??= 'long';

  initCredentialProvider(opts?.credentialProvider);
  initAuthUrlOpener(opts?.openAuthUrl);
  const watchedMarkets = createWatchedMarketsStore(getDb());
  setActiveWatchedMarketsStore(watchedMarkets);
  initAiSettings(getDb(), { secretBox: opts?.secretBox });

  const productionHost = opts?.productionHost ?? process.env.NODE_ENV === 'production';
  setProductionHost(productionHost);
  // The host passes no secretBox in dev (plaintext keyfile mode) —
  // initAiSettings resolves the fallback box, so the license store must take
  // the resolved one, not the raw (possibly undefined) opts value.
  initLicenseManager(getDb(), getAiRuntime().secretBox);
  startLicenseRevalidation();

  const host: ServerEditionHost = {
    db: getDb(),
    license: { isLicensed },
    aiSettings: getActiveSettingsStore(),
    watchedMarkets: getActiveWatchedMarketsStore(),
    paths: { kansokuHome: KANSOKU_HOME },
    secretBox: opts?.secretBox,
    production: productionHost,
    logger: createLogger('server'),
  };

  const { encPath, virtualDir } = serverEncLayout(opts?.proAppDir);
  const keyHex = getActiveBundleKey() ?? process.env.KANSOKU_BUNDLE_KEY ?? null;
  const activation = await loadEdition<ServerEditionHost, BaseServerEdition>({
    encPath,
    virtualDir,
    runtime: 'server',
    keyHex,
    host,
    expectedPublicCommit:
      opts?.expectedPublicCommit ?? (productionHost ? readGeneratedPublicCommit() : undefined),
  });
  console.info(
    `[edition] runtime=server buildId=${activation.buildId ?? 'n/a'} keyId=${activation.keyId ?? 'n/a'} abi=${EDITION_ABI_VERSION} state=${activation.state} code=${activation.error?.code ?? 'n/a'}`,
  );

  let edition: BaseServerEdition;
  let bundleActive: boolean;
  let editionSource: 'enc' | 'dist-dev' | undefined;
  if (activation.state === 'active' && activation.edition) {
    edition = activation.edition;
    bundleActive = true;
    editionSource = 'enc';
    setEncBundlePresent(activation.bundlePresent);
    activateServerEditionCapabilities(edition, activation);
  } else if (activation.state === 'absent' && !productionHost) {
    // Dev host, no pro.enc staged: retry the edition protocol against the
    // unencrypted watch build at dist-dev/server/index.mjs (design §17)
    // before running free. Only 'absent' triggers this — 'locked' means an
    // enc bundle IS present (just missing a key), which dist-dev cannot
    // substitute for.
    const devActivation = await loadEditionFromDevDist<ServerEditionHost, BaseServerEdition>({
      runtime: 'server',
      distDevDir: proDevDistDir(opts?.proAppDir),
      host,
    });
    console.info(
      `[edition] runtime=server source=dist-dev abi=${EDITION_ABI_VERSION} state=${devActivation.state} code=${devActivation.error?.code ?? 'n/a'}`,
    );
    if (devActivation.state === 'active' && devActivation.edition) {
      edition = devActivation.edition;
      bundleActive = true;
      editionSource = 'dist-dev';
      setEncBundlePresent(activation.bundlePresent);
      activateServerEditionCapabilities(edition, devActivation);
    } else {
      edition = new ServerEdition(host);
      bundleActive = false;
      setEncBundlePresent(activation.bundlePresent);
    }
  } else if (activation.state === 'absent' || activation.state === 'locked') {
    edition = new ServerEdition(host);
    bundleActive = false;
    setEncBundlePresent(activation.bundlePresent);
  } else {
    // A bundle was present but rejected (incompatible commit combo or a
    // decrypt/ABI/init failure). Run free instead of reactivating the exact
    // bundle loadEdition just refused.
    console.error(
      `[edition] runtime=server rejected bundle (state=${activation.state}); running in free mode`,
    );
    edition = new ServerEdition(host);
    bundleActive = false;
    setEncBundlePresent(activation.bundlePresent);
  }

  return { host, edition, bundleActive, editionSource };
}

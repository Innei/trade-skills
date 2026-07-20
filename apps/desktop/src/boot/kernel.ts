// Loaded before initServerRuntime() (which resolves the pro edition via
// loadEdition()/loadEditionFromDevDist()) so global Reflect is patched when
// the pro edition's Tsuki controller/module decorators run; otherwise their
// route metadata is written before reflect-metadata installs and Tsuki maps
// no routes. bootstrap.js also imports it, but that is dynamically imported
// later, too late for this ordering requirement.
import 'reflect-metadata';
import { join } from 'node:path';
import { app, ipcMain, safeStorage, shell } from 'electron';
import type { IpcServiceConstructor } from 'electron-ipc-decorator';
import type { BaseDesktopEdition } from '@kansoku/core/edition/base';
import { DefaultIpcRegistry } from '@kansoku/core/edition/ipcRegistry';
import type { DesktopEditionHost } from '@kansoku/core/edition/host';
import { DesktopEdition } from '@kansoku/core/edition/desktopEdition';
import { DefaultRealtimeChannelRegistry } from '@kansoku/core/edition/realtimeRegistry';
import { hasEncBundle } from '@kansoku/core/pro/bundleState';
import { loadEdition, loadEditionFromDevDist, proDevDistDir } from '@kansoku/core/pro/editionLoader';
import { isEditionActive } from '@kansoku/core/pro/editionRuntime';
import { readEditionWebManifest } from '@kansoku/core/pro/webManifest';
import { createCredentialsBridgeHandlers, registerCredentialsIpc } from '../credentials/bridge.js';
import { createDesktopSecretBox } from '../credentials/secretBox.js';
import { nonAiIpcServiceClasses } from '../ipc/index.js';
import { serverEncLayout } from '../../../server/src/proEncLayout.js';
import { IS_DEV } from './env.js';
import { startProActivationWatch } from './proActivationWatch.js';
import { promptProRelaunch } from './proRelaunch.js';

export async function bootKernel() {
  const expectedPublicCommit = app.isPackaged && __PUBLIC_COMMIT__ ? __PUBLIC_COMMIT__ : undefined;

  const [{ initServerRuntime }, { attachRealtimeBridge }, { CHART_DATA_DIR }, { getActiveBundleKey }] =
    await Promise.all([
      import('../../../server/src/runtimeInit.js'),
      import('../realtime/bridge.js'),
      import('@kansoku/core/env'),
      import('@kansoku/core/license/licenseState'),
    ]);

  // Dev keeps the pre-P3 plaintext keyfile so ELECTRON_DEV workflows are
  // unaffected; packaged builds move the AI master key into safeStorage.
  const secretBox = IS_DEV
    ? undefined
    : createDesktopSecretBox({
        safeStorage,
        wrappedKeyPath: join(app.getPath('userData'), 'ai-master-key.json'),
        legacyKeyPath: join(CHART_DATA_DIR, 'ai-secret.key'),
      });

  const {
    host: serverHost,
    edition: serverEdition,
    bundleActive,
    editionSource,
  } = await initServerRuntime({
    secretBox,
    openAuthUrl: (url) => {
      shell.openExternal(url).catch(() => {});
    },
    proAppDir: app.getAppPath(),
    productionHost: app.isPackaged,
    expectedPublicCommit,
    // Packaged builds only ever stage pro.enc (see desktop/scripts/
    // stagePro.mjs) — no dist-dev/ to fall back to. Dev boots through the
    // edition protocol against dist-dev/ instead (see
    // proDevDistDir()/loadEditionFromDevDist() below).
  });
  await serverEdition.initialize();

  const { createKernel } = await import('../../../server/src/bootstrap.js');
  const kernel = await createKernel(serverEdition);

  const ipcRegistry = new DefaultIpcRegistry();
  const realtimeRegistry = new DefaultRealtimeChannelRegistry();
  const desktopHost: DesktopEditionHost = {
    ...serverHost,
    aiRuntimeAlreadyInitialized: true,
    ipc: ipcRegistry,
    realtime: realtimeRegistry,
  };

  const { encPath, virtualDir } = serverEncLayout(app.getAppPath());
  const keyHex = getActiveBundleKey() ?? process.env.KANSOKU_BUNDLE_KEY ?? null;

  // initServerRuntime() already resolved the server-side edition. Only retry
  // the edition protocol for the desktop runtime when the server side
  // actually activated a bundle; otherwise go straight to the free desktop
  // edition. editionSource says which source the server side activated
  // from, so the desktop retry hits the same one: pro.enc via loadEdition(),
  // or dist-dev/ (dev only, design §17) via loadEditionFromDevDist().
  let desktopEdition: BaseDesktopEdition;
  if (bundleActive) {
    const desktopActivation =
      editionSource === 'dist-dev'
        ? await loadEditionFromDevDist<DesktopEditionHost, BaseDesktopEdition>({
            runtime: 'desktop',
            distDevDir: proDevDistDir(app.getAppPath()),
            host: desktopHost,
          })
        : await loadEdition<DesktopEditionHost, BaseDesktopEdition>({
            encPath,
            virtualDir,
            runtime: 'desktop',
            keyHex,
            host: desktopHost,
            expectedPublicCommit,
          });
    desktopEdition =
      desktopActivation.state === 'active' && desktopActivation.edition
        ? desktopActivation.edition
        : new DesktopEdition(desktopHost);
  } else {
    desktopEdition = new DesktopEdition(desktopHost);
  }

  // readEditionWebManifest() only re-reads and re-validates the same bundle
  // loadEdition() above already resolved, so calling it here regardless of
  // `bundleActive` is safe.
  const webManifest = await readEditionWebManifest({ encPath, keyHex, expectedPublicCommit });

  desktopEdition.configureIpc(ipcRegistry);
  desktopEdition.configureRealtime(realtimeRegistry);
  await desktopEdition.initialize();

  const apiApp = kernel.app.getInstance();
  attachRealtimeBridge(realtimeRegistry.list());
  registerCredentialsIpc(ipcMain, createCredentialsBridgeHandlers());

  const health = await apiApp.fetch(new Request('http://localhost/api/health'));
  console.log(`[desktop] kernel self-test /api/health -> ${health.status}`, await health.text());

  await desktopEdition.start();
  await serverEdition.start();

  startProActivationWatch({
    hasEncBundle,
    isProPresent: isEditionActive,
    getBundleKey: getActiveBundleKey,
    relaunch: () => void promptProRelaunch(),
  });

  return {
    kernel,
    ipcServiceClasses: [
      ...nonAiIpcServiceClasses,
      ...(ipcRegistry.build() as unknown as IpcServiceConstructor[]),
    ] as const,
    webManifest,
    dispose: async () => {
      await Promise.allSettled([desktopEdition.dispose(), serverEdition.dispose()]);
      // Drop the decrypted files Map reference so it's GC-eligible once the
      // pro-asset protocol handler (registered against this same object in
      // main.ts) is no longer serving requests — §15.5 exit-time cleanup.
      webManifest.files = null;
    },
  };
}

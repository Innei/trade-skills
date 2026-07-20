import { IpcService } from 'electron-ipc-decorator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerProComposition } from '../../../server/src/edition/types.js';

const initServerRuntime = vi.hoisted(() =>
  vi.fn<() => Promise<ServerProComposition | null>>(async () => null),
);
vi.mock('../../../server/src/runtimeInit.js', () => ({ initServerRuntime }));

const fetchHealth = vi.hoisted(() => vi.fn(async () => new Response('ok', { status: 200 })));
const createKernel = vi.hoisted(() =>
  vi.fn(async () => ({ app: { getInstance: () => ({ fetch: fetchHealth }) } })),
);
vi.mock('../../../server/src/bootstrap.js', () => ({ createKernel }));

const attachRealtimeBridge = vi.hoisted(() => vi.fn());
vi.mock('@desktop/kernel/realtime/bridge.js', () => ({ attachRealtimeBridge }));

vi.mock('@kansoku/core/env', () => ({ CHART_DATA_DIR: '/tmp/chart-data' }));

const getActiveBundleKey = vi.hoisted(() => vi.fn(() => undefined));
vi.mock('@kansoku/core/license/licenseState', () => ({ getActiveBundleKey }));

const loadPro = vi.hoisted(() => vi.fn(async () => null as { webFiles: Map<string, Buffer> } | null));
vi.mock('@kansoku/core/pro/loader', () => ({ loadPro }));

const loadProComposition = vi.hoisted(() =>
  vi.fn<() => Promise<import('@desktop/edition/types.js').DesktopProComposition | null>>(
    async () => null,
  ),
);
vi.mock('@desktop/edition/pro.js', () => ({ loadProComposition }));

vi.mock('@desktop/boot/env.js', () => ({ IS_DEV: true }));

vi.mock('@desktop/data/credentials/bridge.js', () => ({
  registerCredentialsIpc: vi.fn(),
  createCredentialsBridgeHandlers: vi.fn(() => ({})),
}));

vi.mock('@desktop/data/credentials/secretBox.js', () => ({
  createDesktopSecretBox: vi.fn(),
}));

vi.mock('@desktop/boot/proActivationWatch.js', () => ({ startProActivationWatch: vi.fn() }));

vi.mock('@desktop/boot/proRelaunch.js', () => ({ promptProRelaunch: vi.fn() }));

const electronApp = vi.hoisted(() => ({
  getPath: vi.fn(() => '/tmp/userData'),
  getAppPath: vi.fn(() => '/tmp/app'),
  isPackaged: false,
}));
vi.mock('electron', () => ({
  app: electronApp,
  ipcMain: { on: vi.fn(), handle: vi.fn() },
  safeStorage: {},
  shell: { openExternal: vi.fn(() => Promise.resolve()) },
}));

// Deliberately NOT mocked: this test proves that bootKernel keeps the real
// registry's getPro()/isProPresent() (still read by capabilities.service,
// features.ts and proActivationWatch.ts) correct now that loadPro no longer
// calls registerProModule itself.
const { getPro, isProPresent, unregisterProModuleForTests } = await import(
  '@kansoku/core/pro/registry'
);
const { bootKernel } = await import('@desktop/boot/kernel.js');

describe('bootKernel keeps the real pro registry in sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    initServerRuntime.mockResolvedValue(null);
    createKernel.mockResolvedValue({ app: { getInstance: () => ({ fetch: fetchHealth }) } });
    fetchHealth.mockResolvedValue(new Response('ok', { status: 200 }));
    loadPro.mockResolvedValue(null);
    loadProComposition.mockResolvedValue(null);
    unregisterProModuleForTests();
  });

  afterEach(() => {
    unregisterProModuleForTests();
  });

  it('leaves getPro()/isProPresent() false when the pro composition never loads', async () => {
    await bootKernel();

    expect(getPro()).toBeNull();
    expect(isProPresent()).toBe(false);
  });

  it('flips getPro()/isProPresent() true once the pro composition loads', async () => {
    class DesktopIpc extends IpcService {
      static readonly groupName = 'desktopPro';
    }
    loadProComposition.mockResolvedValueOnce({
      ipcServices: [DesktopIpc],
      realtimeChannels: [],
      start: vi.fn(),
      dispose: vi.fn(),
    });

    await bootKernel();

    expect(getPro()).not.toBeNull();
    expect(isProPresent()).toBe(true);
  });
});

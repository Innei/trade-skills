import { IpcService } from 'electron-ipc-decorator';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const callOrder = vi.hoisted(() => [] as string[]);

const registerProModule = vi.hoisted(() => vi.fn());
const freeHooks = vi.hoisted(() => ({ marker: 'free-hooks' }));
const getPro = vi.hoisted(() => vi.fn(() => undefined));
const hasEncBundle = vi.hoisted(() => vi.fn(() => false));
const isProPresent = vi.hoisted(() => vi.fn(() => false));
vi.mock('@kansoku/core/pro/registry', () => ({
  getPro,
  hasEncBundle,
  isProPresent,
  registerProModule,
  freeHooks,
}));

const getActiveBundleKey = vi.hoisted(() => vi.fn(() => undefined));
vi.mock('@kansoku/core/license/licenseState', () => ({ getActiveBundleKey }));

const loadPro = vi.hoisted(() =>
  vi.fn(async () => {
    callOrder.push('loadPro');
    return null as { webFiles: Map<string, Buffer> } | null;
  }),
);
vi.mock('@kansoku/core/pro/loader', () => ({ loadPro }));

const loadProComposition = vi.hoisted(() =>
  vi.fn<() => Promise<import('@desktop/edition/types.js').DesktopProComposition | null>>(
    async () => {
      callOrder.push('loadProComposition');
      return null;
    },
  ),
);
vi.mock('@desktop/edition/pro.js', () => ({ loadProComposition }));

vi.mock('@desktop/boot/env.js', () => ({ IS_DEV: true }));

const registerCredentialsIpc = vi.hoisted(() => vi.fn());
const createCredentialsBridgeHandlers = vi.hoisted(() => vi.fn(() => ({})));
vi.mock('@desktop/data/credentials/bridge.js', () => ({
  registerCredentialsIpc,
  createCredentialsBridgeHandlers,
}));

vi.mock('@desktop/data/credentials/secretBox.js', () => ({
  createDesktopSecretBox: vi.fn(),
}));

const startProActivationWatch = vi.hoisted(() => vi.fn());
vi.mock('@desktop/boot/proActivationWatch.js', () => ({ startProActivationWatch }));

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

const { bootKernel } = await import('@desktop/boot/kernel.js');

describe('bootKernel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callOrder.length = 0;
    initServerRuntime.mockResolvedValue(null);
    createKernel.mockResolvedValue({ app: { getInstance: () => ({ fetch: fetchHealth }) } });
    fetchHealth.mockResolvedValue(new Response('ok', { status: 200 }));
    getPro.mockReturnValue(undefined);
  });

  it('boots free when the pro composition rejects', async () => {
    loadProComposition.mockRejectedValueOnce(new Error('chunk missing'));
    const result = await bootKernel();

    expect(result.proComposition).toBeNull();
    expect(result.webFiles).toBeNull();
    expect(createKernel).toHaveBeenCalledWith([]);
    expect(registerProModule).not.toHaveBeenCalled();
  });

  it('boots free when the pro composition resolves null', async () => {
    loadProComposition.mockResolvedValueOnce(null);
    const result = await bootKernel();

    expect(result.proComposition).toBeNull();
    expect(attachRealtimeBridge).toHaveBeenCalled();
    expect(registerProModule).not.toHaveBeenCalled();
  });

  it('passes server pro modules into createKernel and starts the desktop composition', async () => {
    const serverModule = class ServerAiModule {};
    initServerRuntime.mockResolvedValueOnce({ modules: [serverModule] });
    const start = vi.fn();
    const dispose = vi.fn();
    class DesktopIpc extends IpcService {
      static readonly groupName = 'desktopPro';
    }
    const ipcServiceClass = DesktopIpc;
    loadProComposition.mockResolvedValueOnce({
      ipcServices: [ipcServiceClass],
      realtimeChannels: [],
      start,
      dispose,
    });

    const result = await bootKernel();

    expect(createKernel).toHaveBeenCalledWith([serverModule]);
    expect(start).toHaveBeenCalledTimes(1);
    expect(result.proComposition?.ipcServices).toEqual([ipcServiceClass]);
    // Task 8's loadPro no longer calls registerProModule itself; bootKernel
    // must re-feed the old registry so getPro()/isProPresent() (read by
    // capabilities/features/proActivationWatch) still flip true when pro
    // actually loads. See kernelProPresence.test.ts for the real-registry proof.
    expect(registerProModule).toHaveBeenCalledWith({ hooks: freeHooks });

    await result.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('returns the decrypted web chunks from loadPro', async () => {
    const webFiles = new Map([['assets/__pro__/pro-a1.js', Buffer.from('x')]]);
    loadPro.mockResolvedValueOnce({ webFiles });

    const result = await bootKernel();

    expect(result.webFiles).toBe(webFiles);
  });

  it('registers pro virtual modules via loadPro before reaching the edition composition point', async () => {
    await bootKernel();

    expect(callOrder).toEqual(['loadPro', 'loadProComposition']);
  });
});

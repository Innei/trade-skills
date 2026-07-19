import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProChannel } from '@kansoku/pro-api';
import { BaseEdition } from '@kansoku/core/edition/base';
import { freeHooks, registerProModule, unregisterProModuleForTests } from '@kansoku/core/pro/registry';
import { nonAiIpcServiceClasses } from '../../src/ipc/index.js';

const electron = vi.hoisted(() => ({
  app: {
    getAppPath: vi.fn(() => '/app'),
    isPackaged: false,
    getPath: vi.fn(() => '/tmp'),
  },
  ipcMain: { on: vi.fn(), handle: vi.fn() },
  safeStorage: {},
  shell: { openExternal: vi.fn() },
}));
vi.mock('electron', () => electron);

vi.mock('electron-ipc-decorator', () => ({
  IpcMethod: () => (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
  IpcService: class {},
}));

vi.mock('../../src/boot/env.js', () => ({ IS_DEV: true }));

vi.mock('../../src/credentials/bridge.js', () => ({
  createCredentialsBridgeHandlers: vi.fn(() => ({})),
  registerCredentialsIpc: vi.fn(),
}));

const loadEdition = vi.hoisted(() => vi.fn());
vi.mock('@kansoku/core/pro/editionLoader', () => ({ loadEdition }));

const initServerRuntime = vi.hoisted(() => vi.fn());
vi.mock('../../../server/src/runtimeInit.js', () => ({ initServerRuntime }));

const attachRealtimeBridge = vi.hoisted(() => vi.fn());
vi.mock('../../src/realtime/bridge.js', () => ({ attachRealtimeBridge }));

const createKernel = vi.hoisted(() => vi.fn());
vi.mock('../../../server/src/bootstrap.js', () => ({ createKernel }));

const getActiveBundleKey = vi.hoisted(() => vi.fn((): string | null => null));
vi.mock('@kansoku/core/license/licenseState', () => ({ getActiveBundleKey }));

vi.stubGlobal('__DESKTOP_DEV__', false);

const { bootKernel } = await import('../../src/boot/kernel.js');

function fakeCoreHost() {
  return {
    db: {},
    license: { isLicensed: () => true },
    aiSettings: {},
    watchedMarkets: {},
    paths: { kansokuHome: '/tmp/kansoku-home' },
    production: false,
    logger: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
  };
}

function fakeServerEdition() {
  return {
    initialize: vi.fn(async () => {}),
    start: vi.fn(async () => {}),
    dispose: vi.fn(async () => {}),
  };
}

function stubOkFetch() {
  return vi.fn(async () => new Response('ok', { status: 200 }));
}

beforeEach(() => {
  initServerRuntime.mockReset();
  attachRealtimeBridge.mockReset();
  createKernel.mockReset();
  loadEdition.mockReset();
  getActiveBundleKey.mockReset().mockReturnValue(null);

  createKernel.mockImplementation(async () => ({
    app: { getInstance: () => ({ fetch: stubOkFetch() }) },
  }));
});

afterEach(() => {
  unregisterProModuleForTests();
  vi.restoreAllMocks();
});

const nonActiveActivation = (state: 'absent' | 'locked') => ({
  state,
  bundlePresent: state !== 'absent',
});

describe('bootKernel', () => {
  it('state=absent: boots on the legacy adapter with no pro entries merged, and dispose resolves', async () => {
    loadEdition.mockResolvedValueOnce(nonActiveActivation('absent'));
    const serverEdition = fakeServerEdition();
    initServerRuntime.mockResolvedValueOnce({ host: fakeCoreHost(), edition: serverEdition });

    const result = await bootKernel();

    expect(result.ipcServiceClasses).toEqual(nonAiIpcServiceClasses);
    await expect(result.dispose()).resolves.toBeUndefined();
  });

  it('state=locked: boots on the legacy adapter with no pro entries merged', async () => {
    loadEdition.mockResolvedValueOnce(nonActiveActivation('locked'));
    const serverEdition = fakeServerEdition();
    initServerRuntime.mockResolvedValueOnce({ host: fakeCoreHost(), edition: serverEdition });

    const result = await bootKernel();

    expect(result.ipcServiceClasses).toEqual(nonAiIpcServiceClasses);
    await expect(result.dispose()).resolves.toBeUndefined();
  });

  it('merges a registered pro module ipc classes/channels into the active desktop output via the legacy adapter', async () => {
    class DummyIpcService {
      static groupName = 'dummy';
    }
    const dummyChannel: ProChannel = { kind: 'dummy-channel', parse: () => null, attach: () => () => {} };
    registerProModule({ hooks: freeHooks, ipcServiceClasses: [DummyIpcService], channels: [dummyChannel] });

    loadEdition.mockResolvedValueOnce(nonActiveActivation('absent'));
    const serverEdition = fakeServerEdition();
    initServerRuntime.mockResolvedValueOnce({ host: fakeCoreHost(), edition: serverEdition });

    const result = await bootKernel();

    expect(result.ipcServiceClasses).toEqual([...nonAiIpcServiceClasses, DummyIpcService]);
    expect(attachRealtimeBridge).toHaveBeenCalledWith([dummyChannel]);
  });

  it('starts serverEdition and desktopEdition exactly once each', async () => {
    loadEdition.mockResolvedValueOnce(nonActiveActivation('absent'));
    const serverEdition = fakeServerEdition();
    initServerRuntime.mockResolvedValueOnce({ host: fakeCoreHost(), edition: serverEdition });

    const startSpy = vi.spyOn(BaseEdition.prototype, 'start');

    await bootKernel();

    expect(serverEdition.start).toHaveBeenCalledTimes(1);
    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it('dispose() disposes both serverEdition and desktopEdition', async () => {
    loadEdition.mockResolvedValueOnce(nonActiveActivation('absent'));
    const serverEdition = fakeServerEdition();
    initServerRuntime.mockResolvedValueOnce({ host: fakeCoreHost(), edition: serverEdition });

    const disposeSpy = vi.spyOn(BaseEdition.prototype, 'dispose');

    const result = await bootKernel();
    await result.dispose();

    expect(serverEdition.dispose).toHaveBeenCalledTimes(1);
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });
});

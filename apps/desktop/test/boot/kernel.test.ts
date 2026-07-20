import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseEdition } from '@kansoku/core/edition/base';
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
const loadEditionFromDevDist = vi.hoisted(() => vi.fn());
const proDevDistDir = vi.hoisted(() => vi.fn(() => '/app/../pro/dist-dev'));
vi.mock('@kansoku/core/pro/editionLoader', () => ({ loadEdition, loadEditionFromDevDist, proDevDistDir }));

const initServerRuntime = vi.hoisted(() => vi.fn());
vi.mock('../../../server/src/runtimeInit.js', () => ({ initServerRuntime }));

const attachRealtimeBridge = vi.hoisted(() => vi.fn());
vi.mock('../../src/realtime/bridge.js', () => ({ attachRealtimeBridge }));

const createKernel = vi.hoisted(() => vi.fn());
vi.mock('../../../server/src/bootstrap.js', () => ({ createKernel }));

const getActiveBundleKey = vi.hoisted(() => vi.fn((): string | null => null));
vi.mock('@kansoku/core/license/licenseState', () => ({ getActiveBundleKey }));

const readEditionWebManifest = vi.hoisted(() => vi.fn());
vi.mock('@kansoku/core/pro/webManifest', () => ({ readEditionWebManifest }));

vi.stubGlobal('__DESKTOP_DEV__', false);
vi.stubGlobal('__PUBLIC_COMMIT__', null);

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
  loadEditionFromDevDist.mockReset();
  proDevDistDir.mockReset().mockReturnValue('/app/../pro/dist-dev');
  getActiveBundleKey.mockReset().mockReturnValue(null);
  readEditionWebManifest.mockReset().mockResolvedValue({
    state: 'absent',
    files: null,
    entryPath: null,
    errorCode: null,
  });

  createKernel.mockImplementation(async () => ({
    app: { getInstance: () => ({ fetch: stubOkFetch() }) },
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

const nonActiveActivation = (state: 'absent' | 'locked') => ({
  state,
  bundlePresent: state !== 'absent',
});

describe('bootKernel', () => {
  it('state=absent: boots on the free desktop edition, and dispose resolves', async () => {
    const serverEdition = fakeServerEdition();
    initServerRuntime.mockResolvedValueOnce({
      host: fakeCoreHost(),
      edition: serverEdition,
      bundleActive: false,
    });

    const result = await bootKernel();

    expect(result.ipcServiceClasses).toEqual(nonAiIpcServiceClasses);
    expect(loadEdition).not.toHaveBeenCalled();
    await expect(result.dispose()).resolves.toBeUndefined();
  });

  it('state=locked: boots on the free desktop edition', async () => {
    const serverEdition = fakeServerEdition();
    initServerRuntime.mockResolvedValueOnce({
      host: fakeCoreHost(),
      edition: serverEdition,
      bundleActive: false,
    });

    const result = await bootKernel();

    expect(result.ipcServiceClasses).toEqual(nonAiIpcServiceClasses);
    expect(loadEdition).not.toHaveBeenCalled();
    await expect(result.dispose()).resolves.toBeUndefined();
  });

  it('starts serverEdition and desktopEdition exactly once each', async () => {
    const serverEdition = fakeServerEdition();
    initServerRuntime.mockResolvedValueOnce({
      host: fakeCoreHost(),
      edition: serverEdition,
      bundleActive: false,
    });

    const startSpy = vi.spyOn(BaseEdition.prototype, 'start');

    await bootKernel();

    expect(serverEdition.start).toHaveBeenCalledTimes(1);
    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it('dispose() disposes both serverEdition and desktopEdition', async () => {
    const serverEdition = fakeServerEdition();
    initServerRuntime.mockResolvedValueOnce({
      host: fakeCoreHost(),
      edition: serverEdition,
      bundleActive: false,
    });

    const disposeSpy = vi.spyOn(BaseEdition.prototype, 'dispose');

    const result = await bootKernel();
    await result.dispose();

    expect(serverEdition.dispose).toHaveBeenCalledTimes(1);
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });

  it('bundleActive=true: retries the edition protocol for the desktop runtime via loadEdition()', async () => {
    loadEdition.mockResolvedValueOnce(nonActiveActivation('absent'));
    const serverEdition = fakeServerEdition();
    initServerRuntime.mockResolvedValueOnce({
      host: fakeCoreHost(),
      edition: serverEdition,
      bundleActive: true,
    });

    const result = await bootKernel();

    expect(loadEdition).toHaveBeenCalledTimes(1);
    expect(loadEdition).toHaveBeenCalledWith(expect.objectContaining({ runtime: 'desktop' }));
    expect(result.ipcServiceClasses).toEqual(nonAiIpcServiceClasses);
  });

  it('bundleActive=true, editionSource="dist-dev": retries the edition protocol for the desktop runtime via loadEditionFromDevDist() against dist-dev/, not loadEdition() against pro.enc (design §17)', async () => {
    loadEditionFromDevDist.mockResolvedValueOnce(nonActiveActivation('absent'));
    const serverEdition = fakeServerEdition();
    initServerRuntime.mockResolvedValueOnce({
      host: fakeCoreHost(),
      edition: serverEdition,
      bundleActive: true,
      editionSource: 'dist-dev',
    });

    const result = await bootKernel();

    expect(loadEditionFromDevDist).toHaveBeenCalledTimes(1);
    expect(loadEditionFromDevDist).toHaveBeenCalledWith(
      expect.objectContaining({ runtime: 'desktop', distDevDir: '/app/../pro/dist-dev' }),
    );
    expect(loadEdition).not.toHaveBeenCalled();
    expect(result.ipcServiceClasses).toEqual(nonAiIpcServiceClasses);
  });

  it('bundleActive=false: never calls loadEdition() again for the desktop runtime', async () => {
    const serverEdition = fakeServerEdition();
    initServerRuntime.mockResolvedValueOnce({
      host: fakeCoreHost(),
      edition: serverEdition,
      bundleActive: false,
    });

    await expect(bootKernel()).resolves.toBeDefined();

    expect(loadEdition).not.toHaveBeenCalled();
  });

  it('packaged with __PUBLIC_COMMIT__ set: threads the same expectedPublicCommit into initServerRuntime and loadEdition', async () => {
    electron.app.isPackaged = true;
    vi.stubGlobal('__PUBLIC_COMMIT__', 'deadbeef');
    loadEdition.mockResolvedValueOnce(nonActiveActivation('absent'));
    const serverEdition = fakeServerEdition();
    initServerRuntime.mockResolvedValueOnce({
      host: fakeCoreHost(),
      edition: serverEdition,
      bundleActive: true,
    });

    await bootKernel();

    expect(initServerRuntime).toHaveBeenCalledWith(expect.objectContaining({ expectedPublicCommit: 'deadbeef' }));
    expect(loadEdition).toHaveBeenCalledWith(expect.objectContaining({ expectedPublicCommit: 'deadbeef' }));

    electron.app.isPackaged = false;
    vi.stubGlobal('__PUBLIC_COMMIT__', null);
  });

  it('unpackaged (dev) default: expectedPublicCommit is undefined on both call sites', async () => {
    loadEdition.mockResolvedValueOnce(nonActiveActivation('absent'));
    const serverEdition = fakeServerEdition();
    initServerRuntime.mockResolvedValueOnce({
      host: fakeCoreHost(),
      edition: serverEdition,
      bundleActive: true,
    });

    await bootKernel();

    expect(initServerRuntime).toHaveBeenCalledWith(expect.objectContaining({ expectedPublicCommit: undefined }));
    expect(loadEdition).toHaveBeenCalledWith(expect.objectContaining({ expectedPublicCommit: undefined }));
  });

  it('bundleActive=false: still calls readEditionWebManifest() unconditionally and returns its result', async () => {
    const serverEdition = fakeServerEdition();
    initServerRuntime.mockResolvedValueOnce({
      host: fakeCoreHost(),
      edition: serverEdition,
      bundleActive: false,
    });
    readEditionWebManifest.mockResolvedValueOnce({
      state: 'active',
      files: new Map([['web/index.mjs', Buffer.from('x')]]),
      entryPath: 'web/index.mjs',
      errorCode: null,
    });

    const result = await bootKernel();

    expect(loadEdition).not.toHaveBeenCalled();
    expect(readEditionWebManifest).toHaveBeenCalledTimes(1);
    expect(readEditionWebManifest).toHaveBeenCalledWith(
      expect.objectContaining({ keyHex: null, expectedPublicCommit: undefined }),
    );
    expect(result.webManifest.state).toBe('active');
    expect(result.webManifest.files?.get('web/index.mjs')).toBeInstanceOf(Buffer);
  });

  it('bundleActive=true: calls loadEdition() and readEditionWebManifest() with the same encPath/keyHex', async () => {
    loadEdition.mockResolvedValueOnce(nonActiveActivation('absent'));
    const serverEdition = fakeServerEdition();
    initServerRuntime.mockResolvedValueOnce({
      host: fakeCoreHost(),
      edition: serverEdition,
      bundleActive: true,
    });
    readEditionWebManifest.mockResolvedValueOnce({
      state: 'absent',
      files: null,
      entryPath: null,
      errorCode: null,
    });

    const result = await bootKernel();

    expect(loadEdition).toHaveBeenCalledTimes(1);
    expect(readEditionWebManifest).toHaveBeenCalledTimes(1);
    const loadEditionArgs = loadEdition.mock.calls[0][0];
    const webManifestArgs = readEditionWebManifest.mock.calls[0][0];
    expect(webManifestArgs.encPath).toBe(loadEditionArgs.encPath);
    expect(webManifestArgs.keyHex).toBe(loadEditionArgs.keyHex);
    expect(result.webManifest.state).toBe('absent');
  });

  it('dispose() drops the webManifest.files reference so it becomes GC-eligible', async () => {
    const serverEdition = fakeServerEdition();
    initServerRuntime.mockResolvedValueOnce({
      host: fakeCoreHost(),
      edition: serverEdition,
      bundleActive: false,
    });
    const files = new Map([['web/index.mjs', Buffer.from('x')]]);
    readEditionWebManifest.mockResolvedValueOnce({
      state: 'active',
      files,
      entryPath: 'web/index.mjs',
      errorCode: null,
    });

    const result = await bootKernel();
    expect(result.webManifest.files).toBe(files);

    await result.dispose();

    expect(result.webManifest.files).toBeNull();
  });
});

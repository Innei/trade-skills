import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setModelsRuntimeForTests } from '@kansoku/core/ai/modelsRuntime';
import {
  capabilitiesService,
  resetCapabilitiesServiceForTests,
} from '@kansoku/core/modules/capabilities/capabilities.service';
import {
  resetSymbolsServiceForTests,
  symbolsService,
} from '@kansoku/core/modules/symbols/symbols.service';
import {
  defaultAiTurnPipeline,
  resetDefaultAiTurnPipelineForTests,
} from '@kansoku/core/pro/domain/defaultImplementations';
import { resetEncBundleStateForTests } from '@kansoku/core/pro/bundleState';

vi.mock('@kansoku/core/pro/editionLoader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kansoku/core/pro/editionLoader')>();
  return {
    ...actual,
    loadEdition: vi.fn(actual.loadEdition),
    loadEditionFromDevDist: vi.fn(actual.loadEditionFromDevDist),
  };
});

const { initServerRuntime } = await import('../src/runtimeInit.js');
const { loadEdition, loadEditionFromDevDist } = await import('@kansoku/core/pro/editionLoader');

let tmpAppDir: string;

beforeEach(() => {
  tmpAppDir = mkdtempSync(join(tmpdir(), 'kansoku-server-runtime-init-'));
  vi.mocked(loadEdition).mockClear();
  vi.mocked(loadEditionFromDevDist).mockClear();
});

afterEach(() => {
  rmSync(tmpAppDir, { recursive: true, force: true });
  resetEncBundleStateForTests();
  setModelsRuntimeForTests(null);
  resetCapabilitiesServiceForTests();
  resetSymbolsServiceForTests();
  resetDefaultAiTurnPipelineForTests();
});

describe('initServerRuntime: expectedPublicCommit wiring', () => {
  it('productionHost=true with an explicit opts.expectedPublicCommit passes that exact value', async () => {
    await initServerRuntime({
      proAppDir: tmpAppDir,
      productionHost: true,
      expectedPublicCommit: 'deadbeef',
    });

    expect(loadEdition).toHaveBeenCalledWith(
      expect.objectContaining({ expectedPublicCommit: 'deadbeef' }),
    );
  });

  it('productionHost=false passes expectedPublicCommit: undefined regardless of opts', async () => {
    await initServerRuntime({
      proAppDir: tmpAppDir,
      productionHost: false,
    });

    expect(loadEdition).toHaveBeenCalledWith(
      expect.objectContaining({ expectedPublicCommit: undefined }),
    );
  });
});

describe('initServerRuntime: active edition capability wiring', () => {
  beforeEach(() => {
    process.env.KANSOKU_LICENSE_BYPASS = '1';
  });

  afterEach(() => {
    delete process.env.KANSOKU_LICENSE_BYPASS;
  });

  it('routes capabilitiesService/symbolsService/AI turn pipeline through the active edition', async () => {
    const followCalls: string[] = [];
    const fakeEdition = {
      async initialize() {},
      async start() {},
      async dispose() {},
      configureServer() {},
      proCapabilities: () => ({
        hooks: {
          requestImmediateFollow: (symbol: string) => {
            followCalls.push(symbol);
          },
          startDeepDiveForNote: (note: string) => ({ started: true as const, note }) as never,
          deepDiveStatus: () => ({ running: true }) as never,
        },
        aiExtension: {
          prepareTurn: async () => ({ promptContext: 'from-active-edition' }),
        },
      }),
    };
    vi.mocked(loadEdition).mockResolvedValueOnce({
      state: 'active',
      bundlePresent: true,
      keyId: 'test-key',
      edition: fakeEdition,
    } as never);

    await initServerRuntime({ proAppDir: tmpAppDir, productionHost: false });

    const capabilities = await capabilitiesService.get();
    expect(capabilities.pro).toBe(true);
    expect(capabilities.hasEncBundle).toBe(true);

    const followSymbol = `TESTACTIVE${Date.now()}.US`;
    await symbolsService.stopFollow({ sym: followSymbol });
    await symbolsService.startFollow({ sym: followSymbol });
    expect(followCalls).toEqual([followSymbol]);
    await symbolsService.stopFollow({ sym: followSymbol });

    const turn = await defaultAiTurnPipeline().prepareTurn({
      surface: 'analyst',
      sessionId: 'active-edition-session',
    });
    expect(turn.processors).toHaveLength(1);
  });
});

describe('initServerRuntime: dev-dist edition-protocol fallback (design §17)', () => {
  it('dev host, no pro.enc (state=absent): retries via loadEditionFromDevDist() and wires capabilities the same way an active enc edition would', async () => {
    const fakeEdition = {
      async initialize() {},
      async start() {},
      async dispose() {},
      configureServer() {},
      proCapabilities: () => ({}),
    };
    vi.mocked(loadEditionFromDevDist).mockResolvedValueOnce({
      state: 'active',
      bundlePresent: true,
      edition: fakeEdition,
    } as never);

    const result = await initServerRuntime({ proAppDir: tmpAppDir, productionHost: false });

    expect(loadEditionFromDevDist).toHaveBeenCalledWith(
      expect.objectContaining({ runtime: 'server', host: expect.anything() }),
    );
    expect(result.bundleActive).toBe(true);
    expect(result.editionSource).toBe('dist-dev');
    expect(result.edition).toBe(fakeEdition);

    const capabilities = await capabilitiesService.get();
    expect(capabilities.pro).toBe(true);
  });

  it('production host (state=absent): never attempts loadEditionFromDevDist(), runs free instead', async () => {
    const result = await initServerRuntime({ proAppDir: tmpAppDir, productionHost: true });

    expect(loadEditionFromDevDist).not.toHaveBeenCalled();
    expect(result.bundleActive).toBe(false);
    expect(result.editionSource).toBeUndefined();
  });

  it('dev host, no pro.enc and no dist-dev/ built (dist-dev also resolves absent): runs free', async () => {
    const result = await initServerRuntime({ proAppDir: tmpAppDir, productionHost: false });

    expect(loadEditionFromDevDist).toHaveBeenCalledTimes(1);
    expect(result.bundleActive).toBe(false);
    expect(result.editionSource).toBeUndefined();
  });

  it('dev host, state=locked (enc present but no key): never attempts loadEditionFromDevDist() — locked means a real bundle exists, dist-dev cannot substitute for it', async () => {
    vi.mocked(loadEdition).mockResolvedValueOnce({
      state: 'locked',
      bundlePresent: true,
    } as never);

    const result = await initServerRuntime({ proAppDir: tmpAppDir, productionHost: false });

    expect(loadEditionFromDevDist).not.toHaveBeenCalled();
    expect(result.bundleActive).toBe(false);
  });
});

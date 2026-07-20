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
import { unregisterProModuleForTests } from '@kansoku/core/pro/registry';
import { resetProtocolClaimForTests } from '@kansoku/core/pro/protocolClaim';

vi.mock('@kansoku/core/pro/editionLoader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kansoku/core/pro/editionLoader')>();
  return { ...actual, loadEdition: vi.fn(actual.loadEdition) };
});

const { initServerRuntime } = await import('../src/runtimeInit.js');
const { loadEdition } = await import('@kansoku/core/pro/editionLoader');

let tmpAppDir: string;

beforeEach(() => {
  tmpAppDir = mkdtempSync(join(tmpdir(), 'kansoku-server-runtime-init-'));
  vi.mocked(loadEdition).mockClear();
});

afterEach(() => {
  rmSync(tmpAppDir, { recursive: true, force: true });
  unregisterProModuleForTests();
  resetProtocolClaimForTests();
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

  it('routes capabilitiesService/symbolsService/AI turn pipeline through the active edition, not the legacy registry', async () => {
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

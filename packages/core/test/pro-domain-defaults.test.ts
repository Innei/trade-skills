import { afterEach, describe, expect, it } from 'vitest';
import { prepareProAiTurn } from '../src/pro/aiExtension.js';
import { setEncBundlePresent } from '../src/pro/bundleState.js';
import {
  DisabledDeepDiveService,
  DisabledFollowAutomation,
  EmptyAiTurnPipeline,
} from '../src/pro/domain/defaultImplementations.js';
import { FreeEditionRuntimeStatusReader } from '../src/pro/editionRuntime.js';

afterEach(() => {
  setEncBundlePresent(false);
});

describe('default-edition implementations match free behavior', () => {
  it('DisabledFollowAutomation is a no-op', () => {
    expect(new DisabledFollowAutomation().requestImmediateFollow('AAPL')).toBeUndefined();
  });

  it('DisabledDeepDiveService reports disabled', () => {
    const service = new DisabledDeepDiveService();
    expect(service.startDeepDiveForNote('note')).toEqual({ started: false, reason: 'disabled' });
    expect(service.deepDiveStatus()).toEqual({ running: false });
  });

  it('EmptyAiTurnPipeline matches prepareProAiTurn with no extension', async () => {
    const context = { surface: 'assistant' as const, sessionId: 's1' };
    const fromPipeline = await new EmptyAiTurnPipeline().prepareTurn(context);
    const fromFn = await prepareProAiTurn(context, undefined);
    expect(fromPipeline).toEqual({ readMounts: [], processors: [] });
    expect(fromPipeline).toEqual(fromFn);
  });
});

describe('FreeEditionRuntimeStatusReader.status', () => {
  it('reports absent when no enc bundle is present', () => {
    const reader = new FreeEditionRuntimeStatusReader();
    expect(reader.status).toEqual({ state: 'absent', bundlePresent: false, keyId: undefined });
  });

  it('reports locked when the enc bundle is present', () => {
    setEncBundlePresent(true);
    const reader = new FreeEditionRuntimeStatusReader();
    expect(reader.status).toEqual({ state: 'locked', bundlePresent: true, keyId: undefined });
  });
});

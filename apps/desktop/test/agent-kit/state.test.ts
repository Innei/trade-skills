import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readState, sha256, writeState } from '@desktop/agent-kit/state.js';

describe('agent-kit state store', () => {
  let dataRoot: string;

  beforeEach(async () => {
    dataRoot = await mkdtemp(join(tmpdir(), 'agent-kit-state-'));
  });

  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it('returns null when no state.json exists', () => {
    expect(readState(dataRoot)).toBeNull();
  });

  it('writes and reads state back', () => {
    const state = {
      kitVersion: '1.0.0+20260722',
      appVersion: '1.0.0',
      syncedAt: '2026-07-22T00:00:00.000Z',
      templates: {
        'CLAUDE.md': {
          initialContentHash: sha256('hello'),
          sourceTemplateHash: 'abc',
          writtenAt: '2026-07-22T00:00:00.000Z',
        },
      },
    };
    writeState(dataRoot, state);
    expect(readState(dataRoot)).toEqual(state);
  });

  it('returns null when state.json is corrupt', async () => {
    const { writeFile, mkdir } = await import('node:fs/promises');
    await mkdir(join(dataRoot, '.kansoku-agent-kit'), { recursive: true });
    await writeFile(join(dataRoot, '.kansoku-agent-kit', 'state.json'), 'not json', 'utf8');
    expect(readState(dataRoot)).toBeNull();
  });

  it('sha256 is deterministic for the same content', () => {
    expect(sha256('same')).toBe(sha256('same'));
    expect(sha256('a')).not.toBe(sha256('b'));
  });
});

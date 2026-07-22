import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAgentKitStore } from '@desktop/agent-kit/store.js';

describe('createAgentKitStore', () => {
  let dir: string;
  let path: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'agent-kit-store-'));
    path = join(dir, 'agent-kit.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('defaults to enabled true when the file is absent', () => {
    const store = createAgentKitStore(path);
    expect(store.read()).toEqual({ enabled: true });
  });

  it('persists state and reads it back', () => {
    const store = createAgentKitStore(path);
    store.write({ enabled: false, lastSyncAt: '2026-07-22T00:00:00.000Z' });
    expect(store.read()).toEqual({ enabled: false, lastSyncAt: '2026-07-22T00:00:00.000Z' });
    expect(createAgentKitStore(path).read()).toEqual({
      enabled: false,
      lastSyncAt: '2026-07-22T00:00:00.000Z',
    });
  });

  it('treats corrupt JSON as the default state', async () => {
    await writeFile(path, 'not json', 'utf8');
    expect(createAgentKitStore(path).read()).toEqual({ enabled: true });
  });

  it('treats a missing enabled field as true', async () => {
    await writeFile(path, JSON.stringify({ lastSyncAt: 'x' }), 'utf8');
    expect(createAgentKitStore(path).read()).toEqual({ enabled: true, lastSyncAt: 'x' });
  });
});

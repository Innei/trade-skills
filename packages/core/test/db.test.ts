import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../src/db/index.js';

const chartDataDir = mkdtempSync(join(tmpdir(), 'core-db-adopt-'));

vi.mock('../src/env.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/env.js')>()),
  CHART_DATA_DIR: chartDataDir,
}));

afterEach(() => {
  vi.resetModules();
});

afterAll(() => {
  rmSync(chartDataDir, { recursive: true, force: true });
});

describe('adoptDb', () => {
  it('adopts when no singleton exists; getDb then returns the adopted instance', async () => {
    const { adoptDb, getDb } = await import('../src/db/index.js');
    const fake = { marker: 'fake' } as unknown as Db;

    adoptDb(fake);

    expect(getDb()).toBe(fake);
  });

  it('is a no-op when adopting the same instance again', async () => {
    const { adoptDb, getDb } = await import('../src/db/index.js');
    const fake = { marker: 'fake' } as unknown as Db;

    adoptDb(fake);

    expect(() => adoptDb(fake)).not.toThrow();
    expect(getDb()).toBe(fake);
  });

  it('throws when adopting a different instance after one is already active', async () => {
    const { adoptDb } = await import('../src/db/index.js');
    const a = { marker: 'a' } as unknown as Db;
    const b = { marker: 'b' } as unknown as Db;

    adoptDb(a);

    expect(() => adoptDb(b)).toThrow(/already active — call adoptDb\(\) before any getDb\(\) call/);
  });

  it('throws when adopting a different db after getDb already created one lazily', async () => {
    const { adoptDb, getDb } = await import('../src/db/index.js');

    getDb();
    const other = { marker: 'other' } as unknown as Db;

    expect(() => adoptDb(other)).toThrow(
      /already active — call adoptDb\(\) before any getDb\(\) call/,
    );
  });
});

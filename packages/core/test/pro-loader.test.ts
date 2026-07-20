import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadPro } from '../src/pro/loader.js';

const roots: string[] = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

function stageAppDir(): string {
  const root = mkdtempSync(join(tmpdir(), 'kansoku-loader-'));
  roots.push(root);
  mkdirSync(join(root, 'pro'), { recursive: true });
  return root;
}

describe('loadPro', () => {
  it('returns null when pro.enc is absent', async () => {
    await expect(loadPro(stageAppDir())).resolves.toBeNull();
  });

  it('returns null when pro.enc is present but no key is available', async () => {
    const root = stageAppDir();
    writeFileSync(join(root, 'pro', 'pro.enc'), Buffer.from('KPRO1'));
    await expect(loadPro(root)).resolves.toBeNull();
  });

  it('returns null on a tampered blob rather than throwing', async () => {
    const root = stageAppDir();
    writeFileSync(join(root, 'pro', 'pro.enc'), Buffer.from('KPRO1garbage'));
    process.env.KANSOKU_BUNDLE_KEY = '00'.repeat(32);
    try {
      await expect(loadPro(root)).resolves.toBeNull();
    } finally {
      delete process.env.KANSOKU_BUNDLE_KEY;
    }
  });
});

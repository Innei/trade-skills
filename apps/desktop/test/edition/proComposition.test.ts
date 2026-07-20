import { describe, expect, it } from 'vitest';
import { loadProComposition } from '../../src/edition/pro.js';

describe('desktop loadProComposition (default/free)', () => {
  it('resolves to null so the host runs free', async () => {
    await expect(loadProComposition()).resolves.toBeNull();
  });
});

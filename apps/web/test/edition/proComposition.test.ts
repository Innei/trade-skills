import { describe, expect, it } from 'vitest';
import { loadProComposition } from '../../src/edition/pro';

describe('web loadProComposition (default/free)', () => {
  it('resolves to null so no pro routes exist', async () => {
    await expect(loadProComposition()).resolves.toBeNull();
  });
});

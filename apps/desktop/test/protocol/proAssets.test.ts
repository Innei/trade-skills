import { beforeEach, describe, expect, it } from 'vitest';
import { resolveAssetSource, setProAssets } from '@desktop/platform/protocol/protocol.js';

describe('resolveAssetSource', () => {
  beforeEach(() => setProAssets(null));

  it('falls through to disk when no pro assets are registered', () => {
    expect(resolveAssetSource('assets/main-a1.js')).toEqual({ kind: 'disk' });
  });

  it('serves a registered pro chunk from memory', () => {
    const body = Buffer.from('export const x = 1;');
    setProAssets(new Map([['assets/__pro__/pro-a1.js', body]]));
    expect(resolveAssetSource('assets/__pro__/pro-a1.js')).toEqual({ kind: 'memory', body });
  });

  it('falls through for a path the pro map does not carry', () => {
    setProAssets(new Map([['assets/__pro__/pro-a1.js', Buffer.from('x')]]));
    expect(resolveAssetSource('index.html')).toEqual({ kind: 'disk' });
  });

  it('drops registered assets when cleared', () => {
    setProAssets(new Map([['assets/__pro__/pro-a1.js', Buffer.from('x')]]));
    setProAssets(null);
    expect(resolveAssetSource('assets/__pro__/pro-a1.js')).toEqual({ kind: 'disk' });
  });
});

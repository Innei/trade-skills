import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isProModule, normalizeModuleId, proLeakGuard } from '../src/chunkGuard.js';

const roots: string[] = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

function runGuard(bundle: Record<string, unknown>): string | null {
  const plugin = proLeakGuard({ proDir: '__pro__/' });
  let error: string | null = null;
  const ctx = {
    error(message: string) {
      error = message;
      throw new Error(message);
    },
  };
  try {
    (plugin.generateBundle as (this: typeof ctx, o: unknown, b: unknown) => void).call(ctx, {}, bundle);
  } catch {
    // guard reported via ctx.error; message captured above
  }
  return error;
}

describe('isProModule', () => {
  it('matches a path inside apps/pro', () => {
    expect(isProModule('/repo/apps/pro/overlays/apps/web/src/x.pro.tsx')).toBe(true);
  });

  it('does not match a public path that merely mentions pro', () => {
    expect(isProModule('/repo/apps/web/src/proHelpers.ts')).toBe(false);
  });

  it('strips vite query suffixes before deciding', () => {
    expect(isProModule('/repo/apps/pro/overlays/x.pro.ts?used')).toBe(true);
  });

  it('follows a symlink projection back into apps/pro', () => {
    const root = mkdtempSync(join(tmpdir(), 'kansoku-guard-'));
    roots.push(root);
    mkdirSync(join(root, 'apps', 'pro', 'overlays'), { recursive: true });
    mkdirSync(join(root, 'apps', 'web', 'src'), { recursive: true });
    const real = join(root, 'apps', 'pro', 'overlays', 'page.pro.tsx');
    const link = join(root, 'apps', 'web', 'src', 'page.pro.tsx');
    writeFileSync(real, 'export default null;\n');
    symlinkSync(real, link);
    expect(isProModule(link)).toBe(true);
  });

  describe('id shapes reaching the classifier', () => {
    const root = mkdtempSync(join(tmpdir(), 'kansoku-guard-shapes-'));
    roots.push(root);
    mkdirSync(join(root, 'apps', 'pro', 'overlays'), { recursive: true });
    const real = join(root, 'apps', 'pro', 'overlays', 'shape.pro.tsx');
    writeFileSync(real, 'export default null;\n');

    it('classifies a plain absolute path', () => {
      expect(isProModule(real)).toBe(true);
    });

    it('classifies a path with a ?query suffix', () => {
      expect(isProModule(`${real}?used`)).toBe(true);
    });

    it('classifies a path with a #fragment suffix', () => {
      expect(isProModule(`${real}#frag`)).toBe(true);
    });

    it('classifies a \\0-prefixed virtual-module proxy wrapping a real path', () => {
      expect(isProModule(`\0${real}`)).toBe(true);
    });

    it('classifies a /@fs/-prefixed dev-server path', () => {
      expect(isProModule(`/@fs${real}`)).toBe(true);
    });

    it('normalizeModuleId strips all four wrappers back to the bare path', () => {
      expect(normalizeModuleId(`\0/@fs${real}?used#frag`)).toBe(real);
    });
  });
});

describe('proLeakGuard', () => {
  it('passes when pro modules stay inside the encrypted dir', () => {
    expect(
      runGuard({
        'main.mjs': { type: 'chunk', modules: { '/repo/apps/desktop/src/main.ts': {} }, imports: [] },
        '__pro__/pro-a1.mjs': {
          type: 'chunk',
          modules: { '/repo/apps/pro/overlays/edition.pro.ts': {} },
          imports: [],
        },
      }),
    ).toBeNull();
  });

  it('recognises the encrypted dir under a nested asset prefix', () => {
    expect(
      runGuard({
        'assets/index-a1.js': {
          type: 'chunk',
          modules: { '/repo/apps/web/src/main.tsx': {} },
          imports: [],
        },
        'assets/__pro__/pro-a1.js': {
          type: 'chunk',
          modules: { '/repo/apps/pro/overlays/apps/web/src/edition/pro.pro.ts': {} },
          imports: [],
        },
      }),
    ).toBeNull();
  });

  it('fails when a pro module lands in a public chunk', () => {
    expect(
      runGuard({
        'main.mjs': {
          type: 'chunk',
          modules: { '/repo/apps/pro/overlays/leaked.pro.ts': {} },
          imports: [],
        },
      }),
    ).toContain('pro module outside');
  });

  it('fails when a public chunk statically imports an encrypted chunk', () => {
    expect(
      runGuard({
        'main.mjs': {
          type: 'chunk',
          modules: { '/repo/apps/desktop/src/main.ts': {} },
          imports: ['__pro__/pro-a1.mjs'],
        },
        '__pro__/pro-a1.mjs': { type: 'chunk', modules: {}, imports: [] },
      }),
    ).toContain('statically imports encrypted chunk');
  });

  it('allows a public chunk to reach the encrypted dir dynamically', () => {
    expect(
      runGuard({
        'main.mjs': {
          type: 'chunk',
          modules: { '/repo/apps/desktop/src/edition/pro.ts': {} },
          imports: [],
          dynamicImports: ['__pro__/pro-a1.mjs'],
        },
        '__pro__/pro-a1.mjs': { type: 'chunk', modules: {}, imports: [] },
      }),
    ).toBeNull();
  });

  it('fails when a pro-originated asset lands outside the encrypted dir', () => {
    expect(
      runGuard({
        'assets/styles-a1.css': {
          type: 'asset',
          originalFileNames: ['/repo/apps/pro/overlays/apps/web/src/panel.pro.css'],
        },
      }),
    ).toContain('pro asset outside');
  });

  it('passes when a pro-originated asset lands inside the encrypted dir', () => {
    expect(
      runGuard({
        'assets/__pro__/styles-a1.css': {
          type: 'asset',
          originalFileNames: ['/repo/apps/pro/overlays/apps/web/src/panel.pro.css'],
        },
      }),
    ).toBeNull();
  });

  describe('overlayRoot cross-check', () => {
    function runGuardWithOverlayRoot(
      bundle: Record<string, unknown>,
      overlayRoot: string,
    ): string | null {
      const plugin = proLeakGuard({ proDir: '__pro__/', overlayRoot });
      let error: string | null = null;
      const ctx = {
        error(message: string) {
          error = message;
          throw new Error(message);
        },
      };
      try {
        (
          plugin.generateBundle as (this: typeof ctx, o: unknown, b: unknown) => void
        ).call(ctx, {}, bundle);
      } catch {
        // guard reported via ctx.error; message captured above
      }
      return error;
    }

    it('fails when a module under overlayRoot is classified as public', () => {
      const root = mkdtempSync(join(tmpdir(), 'kansoku-guard-overlay-'));
      roots.push(root);
      const overlayRoot = join(root, 'overlays');
      mkdirSync(overlayRoot, { recursive: true });
      // Deliberately outside apps/pro/, so isProModule's marker/realpath check
      // both miss it — this is exactly the classifier-miss scenario the
      // cross-check exists to catch instead of failing silently alongside it.
      const missedByClassifier = join(overlayRoot, 'missed.pro.ts');
      writeFileSync(missedByClassifier, 'export default null;\n');
      expect(isProModule(missedByClassifier)).toBe(false);

      expect(
        runGuardWithOverlayRoot(
          {
            'main.mjs': {
              type: 'chunk',
              modules: { [missedByClassifier]: {} },
              imports: [],
            },
          },
          overlayRoot,
        ),
      ).toContain('missed by classifier');
    });
  });
});

import { realpathSync } from 'node:fs';
import { isAbsolute, relative, sep } from 'node:path';
import type { Plugin } from 'vite';

const PRO_PATH_MARKER = `${sep}apps${sep}pro${sep}`;
const AT_FS_PREFIX = '/@fs/';

// Module ids reaching here take several shapes depending on plugin order and
// dev vs. build: a plain absolute path, a path with a vite `?query` or
// `#fragment` suffix, a `\0`-prefixed virtual-module proxy wrapping a real
// path (e.g. a commonjs interop shim), or a dev-server `/@fs/`-prefixed path
// for files outside the served root. All four must resolve to the same
// underlying file before the pro/public decision is made, or the decision
// silently forks from reality.
export function normalizeModuleId(id: string): string {
  let normalized = id.charCodeAt(0) === 0 ? id.slice(1) : id;
  const queryIndex = normalized.search(/[#?]/);
  if (queryIndex !== -1) normalized = normalized.slice(0, queryIndex);
  if (normalized.startsWith(AT_FS_PREFIX)) normalized = normalized.slice(AT_FS_PREFIX.length - 1);
  return normalized;
}

export function isProModule(id: string): boolean {
  const path = normalizeModuleId(id);
  if (path.length === 0) return false;
  if (path.includes(PRO_PATH_MARKER)) return true;
  try {
    return realpathSync(path).includes(PRO_PATH_MARKER);
  } catch {
    return false;
  }
}

function isUnderOverlayRoot(id: string, realOverlayRoot: string): boolean {
  const path = normalizeModuleId(id);
  if (path.length === 0) return false;
  let real: string;
  try {
    real = realpathSync(path);
  } catch {
    return false;
  }
  const rel = relative(realOverlayRoot, real);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

export interface ProLeakGuardOptions {
  // Chunk-path segment marking encrypted output. A chunk counts as encrypted
  // when its emitted name contains this segment, so both '__pro__/x.mjs' and
  // 'assets/__pro__/x.js' are recognised.
  proDir: string;
  // Overlay projection root (apps/pro/overlays). When supplied, every module
  // actually bundled is cross-checked against it directly, independent of
  // the PRO_PATH_MARKER heuristic isProModule uses — this is what catches a
  // future classifier miss instead of failing silently alongside it.
  overlayRoot?: string;
}

// This dir IS the paid-code boundary: stagePro encrypts it into pro.enc and
// deletes the plaintext. Two invariants, both build-fatal:
//   1. no pro module or pro-originated asset may land in a chunk/asset
//      outside it (it would ship unencrypted);
//   2. no chunk outside it may STATICALLY import a chunk inside it — the
//      plaintext is gone in shipped builds, so a static edge crashes the free
//      app at startup. The composition point's dynamic import is the only
//      legal edge, and it is wrapped in try/catch.
export function proLeakGuard({ proDir, overlayRoot }: ProLeakGuardOptions): Plugin {
  const isEncrypted = (fileName: string) => fileName.includes(proDir);
  let realOverlayRoot: string | null = null;
  if (overlayRoot) {
    try {
      realOverlayRoot = realpathSync(overlayRoot);
    } catch {
      realOverlayRoot = null;
    }
  }

  return {
    name: 'kansoku:pro-leak-guard',
    generateBundle(_options, bundle) {
      const problems: string[] = [];
      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type === 'asset') {
          const originalFileNames = output.originalFileNames ?? [];
          const isProAsset = originalFileNames.some(isProModule);
          if (isProAsset && !isEncrypted(fileName)) {
            problems.push(
              `pro asset outside ${proDir} — ${fileName}: ${originalFileNames.join(', ')}`,
            );
          }
          continue;
        }
        if (output.type !== 'chunk') continue;
        const chunk = output;
        for (const id of Object.keys(chunk.modules)) {
          const flaggedAsPro = isProModule(id);
          if (flaggedAsPro && !isEncrypted(fileName)) {
            problems.push(`pro module outside ${proDir} — ${fileName}: ${id}`);
          }
          if (!flaggedAsPro && realOverlayRoot && isUnderOverlayRoot(id, realOverlayRoot)) {
            problems.push(
              `module under overlay root missed by classifier — ${fileName}: ${id}`,
            );
          }
        }
        if (!isEncrypted(fileName)) {
          for (const imported of chunk.imports) {
            if (isEncrypted(imported)) {
              problems.push(
                `public chunk statically imports encrypted chunk — ${fileName} -> ${imported}`,
              );
            }
          }
        }
      }
      if (problems.length > 0) {
        this.error(`pro chunk boundary violated:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
      }
    },
  };
}

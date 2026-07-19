import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const IMPORT_SPECIFIER_RE = /\bfrom\s+['"]([^'"]+)['"]/g;
const REQUIRE_SPECIFIER_RE = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;

function isScannableFile(path: string): boolean {
  if (!/\.(ts|mts)$/.test(path)) return false;
  if (path.includes('/node_modules/')) return false;
  if (path.includes('/test/')) return false;
  if (path.endsWith('.test.ts')) return false;
  return true;
}

function isElectronSpecifier(specifier: string): boolean {
  return specifier === 'electron' || /^electron\//.test(specifier);
}

function collectSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  for (const match of source.matchAll(IMPORT_SPECIFIER_RE)) specifiers.push(match[1]);
  for (const match of source.matchAll(REQUIRE_SPECIFIER_RE)) specifiers.push(match[1]);
  return specifiers;
}

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === 'node_modules') continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walk(path, out);
    } else if (isScannableFile(path)) {
      out.push(path);
    }
  }
}

export function findElectronImports(roots: string[]): { file: string; specifier: string }[] {
  const files: string[] = [];
  for (const root of roots) walk(root, files);

  const hits: { file: string; specifier: string }[] = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const specifier of collectSpecifiers(source)) {
      if (isElectronSpecifier(specifier)) hits.push({ file, specifier });
    }
  }
  return hits;
}

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

export const SERVER_BUNDLE_SCAN_ROOTS = [
  join(repoRoot, 'apps/server/src'),
  join(repoRoot, 'packages/core/src'),
  join(repoRoot, 'packages/shared/src'),
  join(repoRoot, 'packages/pro-api/src'),
];

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// dist-main/main.mjs is the fixed on-disk output location of this module
// (tsdown's entry file, never inlined into another chunk), so this path
// math stays correct regardless of what else tsdown bundles into it.
export function resolveRepoRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "..");
}

export interface DataRootOptions {
  isPackaged: boolean;
  envOverride: string | undefined;
  userDataPath: string;
}

export function resolveDataRoot(opts: DataRootOptions): string {
  if (opts.envOverride) return opts.envOverride;
  if (opts.isPackaged) return opts.userDataPath;
  return resolveRepoRoot();
}

const DATA_ROOT_SUBDIRS = [
  "journal",
  join("journal", "charts", "data"),
  join("journal", "charts", "annotations"),
  "stocks",
];

export function scaffoldDataRoot(root: string): void {
  for (const rel of DATA_ROOT_SUBDIRS) {
    mkdirSync(join(root, rel), { recursive: true });
  }
}

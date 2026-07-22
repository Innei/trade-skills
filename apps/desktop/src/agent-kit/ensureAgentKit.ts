import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from '@kansoku/core/db/index';
import { readManifest } from './manifest.js';
import {
  readState,
  sha256,
  writeState,
  type PendingConflict,
  type PendingUpdate,
  type TemplateState,
} from './state.js';
import { makeRender, syncTemplate } from './templates.js';

export async function ensureAgentKit(input: {
  dataRoot: string;
  resourcesPath: string;
  db: Db;
  now?: () => Date;
}): Promise<{ conflicts: PendingConflict[]; updates: PendingUpdate[] }> {
  const manifest = readManifest(input.resourcesPath);
  const state = readState(input.dataRoot);
  const now = (input.now ?? (() => new Date()))();

  const kitDir = join(input.dataRoot, '.kansoku-agent-kit');
  mkdirSync(join(kitDir, 'bin'), { recursive: true });

  const cliShim = join(kitDir, 'bin', 'kansoku-cli');
  writeFileSync(
    join(kitDir, 'runtime.env'),
    [
      `KANSOKU_CLI=${cliShim}`,
      `KANSOKU_DATA_ROOT=${input.dataRoot}`,
      `KANSOKU_APP_VERSION=${manifest.appVersion}`,
      `KANSOKU_KIT_VERSION=${manifest.kitVersion}`,
      '',
    ].join('\n'),
    'utf8',
  );

  const targetShim = join(input.resourcesPath, 'kansoku-agent-kit', 'bin', 'kansoku-cli');
  rmSync(cliShim, { force: true });
  symlinkSync(targetShim, cliShim, 'file');

  const render = makeRender(input.resourcesPath, input.db);
  const conflicts: PendingConflict[] = [];
  const updates: PendingUpdate[] = [];
  const templatesNext: Record<string, TemplateState> = { ...state?.templates };

  for (const t of manifest.templates) {
    const outcome = syncTemplate({
      template: t,
      resourcesPath: input.resourcesPath,
      dataRoot: input.dataRoot,
      db: input.db,
      state,
      render,
    });
    switch (outcome.kind) {
      case 'written': {
        templatesNext[t.dest] = {
          initialContentHash: sha256(readFileSync(join(input.dataRoot, t.dest))),
          sourceTemplateHash: t.sha256,
          writtenAt: now.toISOString(),
        };
        break;
      }
      case 'conflict': {
        conflicts.push(outcome.conflict);
        break;
      }
      case 'skip-user-modified':
      case 'skip-uptodate': {
        break;
      }
      case 'pending-update': {
        updates.push(outcome.update);
        break;
      }
    }
  }

  writeState(input.dataRoot, {
    kitVersion: manifest.kitVersion,
    appVersion: manifest.appVersion,
    syncedAt: now.toISOString(),
    templates: templatesNext,
    ...(conflicts.length ? { pendingConflicts: conflicts } : {}),
    ...(updates.length ? { pendingUpdates: updates } : {}),
  });

  return { conflicts, updates };
}

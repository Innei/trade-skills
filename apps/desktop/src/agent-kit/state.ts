import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type TemplateState = {
  initialContentHash: string;
  sourceTemplateHash: string;
  writtenAt: string;
  kept?: boolean;
};

export type PendingConflict = {
  dest: string;
  templatePath: string;
  reason: 'target-exists-no-state';
};

export type PendingUpdate = {
  dest: string;
  templatePath: string;
  oldTemplateHash: string;
  newTemplateHash: string;
};

export type AgentKitDataState = {
  kitVersion: string;
  appVersion: string;
  syncedAt: string;
  templates: Record<string, TemplateState>;
  pendingConflicts?: PendingConflict[];
  pendingUpdates?: PendingUpdate[];
};

export function sha256(bytes: string | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function kitDir(dataRoot: string): string {
  return join(dataRoot, '.kansoku-agent-kit');
}

export function readState(dataRoot: string): AgentKitDataState | null {
  const p = join(kitDir(dataRoot), 'state.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as AgentKitDataState;
  } catch {
    return null;
  }
}

export function writeState(dataRoot: string, state: AgentKitDataState): void {
  const dir = kitDir(dataRoot);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'state.json'), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

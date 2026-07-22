import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { IpcMethod, IpcService } from 'electron-ipc-decorator';
import { getDb } from '@kansoku/core/db/index';
import { dataRoot } from '../boot/env.js';
import { toEnvelope } from '../kernel/ipc/envelope.js';
import { ensureAgentKit } from './ensureAgentKit.js';
import { readManifest, type ManifestTemplate } from './manifest.js';
import { readState, writeState, type AgentKitDataState } from './state.js';
import { defaultAgentKitStore } from './store.js';
import { acceptConflictWithTemplate, keepConflictOriginal, makeRender } from './templates.js';

function resourcesPath(): string {
  return process.resourcesPath;
}

function templateFor(dest: string): ManifestTemplate {
  const template = readManifest(resourcesPath()).templates.find((t) => t.dest === dest);
  if (!template) throw new Error(`agentKit: unknown template dest ${dest}`);
  return template;
}

function requireState(): AgentKitDataState {
  const state = readState(dataRoot);
  if (!state) throw new Error('agentKit: no state to act against');
  return state;
}

export class AgentKitIpc extends IpcService {
  static readonly groupName = 'agentKit';

  @IpcMethod()
  getStatus() {
    return toEnvelope('agentKit.getStatus', () => {
      const s = defaultAgentKitStore(app).read();
      const state = readState(dataRoot);
      return {
        enabled: s.enabled,
        lastSyncAt: s.lastSyncAt,
        kitVersion: state?.kitVersion,
        pendingConflicts: state?.pendingConflicts,
        pendingUpdates: state?.pendingUpdates,
      };
    });
  }

  @IpcMethod()
  setEnabled(input: { enabled: boolean }) {
    return toEnvelope('agentKit.setEnabled', async () => {
      const store = defaultAgentKitStore(app);
      if (!input.enabled) {
        store.write({ ...store.read(), enabled: false });
        return { enabled: false };
      }
      const result = await ensureAgentKit({ dataRoot, resourcesPath: resourcesPath(), db: getDb() });
      store.write({ ...store.read(), enabled: true, lastSyncAt: new Date().toISOString() });
      return { enabled: true, ...result };
    });
  }

  @IpcMethod()
  forceSync() {
    return toEnvelope('agentKit.forceSync', async () => {
      const result = await ensureAgentKit({ dataRoot, resourcesPath: resourcesPath(), db: getDb() });
      const store = defaultAgentKitStore(app);
      store.write({ ...store.read(), lastSyncAt: new Date().toISOString() });
      return result;
    });
  }

  @IpcMethod()
  resolveConflict(input: { dest: string; choice: 'use-template' | 'keep-original' }) {
    return toEnvelope('agentKit.resolveConflict', () => {
      const template = templateFor(input.dest);
      const state = requireState();
      const db = getDb();
      const templateState =
        input.choice === 'use-template'
          ? acceptConflictWithTemplate({
              template,
              resourcesPath: resourcesPath(),
              dataRoot,
              db,
              render: makeRender(resourcesPath(), db),
            })
          : keepConflictOriginal({ template, dataRoot });
      const pendingConflicts = state.pendingConflicts?.filter((c) => c.dest !== input.dest) ?? [];
      writeState(dataRoot, {
        ...state,
        templates: { ...state.templates, [input.dest]: templateState },
        pendingConflicts: pendingConflicts.length ? pendingConflicts : undefined,
      });
      return { dest: input.dest };
    });
  }

  @IpcMethod()
  applyUpdate(input: { dest: string }) {
    return toEnvelope('agentKit.applyUpdate', () => {
      const template = templateFor(input.dest);
      const state = requireState();
      const db = getDb();
      const templateState = acceptConflictWithTemplate({
        template,
        resourcesPath: resourcesPath(),
        dataRoot,
        db,
        render: makeRender(resourcesPath(), db),
      });
      const pendingUpdates = state.pendingUpdates?.filter((u) => u.dest !== input.dest) ?? [];
      writeState(dataRoot, {
        ...state,
        templates: { ...state.templates, [input.dest]: templateState },
        pendingUpdates: pendingUpdates.length ? pendingUpdates : undefined,
      });
      return { dest: input.dest };
    });
  }

  @IpcMethod()
  clean() {
    return toEnvelope('agentKit.clean', () => {
      rmSync(join(dataRoot, '.kansoku-agent-kit'), { recursive: true, force: true });
      return { cleaned: true };
    });
  }
}

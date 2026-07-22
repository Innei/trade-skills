import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type AgentKitStoreState = { enabled: boolean; lastSyncAt?: string };

export interface AgentKitStore {
  read(): AgentKitStoreState;
  write(next: AgentKitStoreState): void;
}

export function createAgentKitStore(filePath: string): AgentKitStore {
  return {
    read() {
      if (!existsSync(filePath)) return { enabled: true };
      try {
        const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
        return {
          enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : true,
          lastSyncAt: typeof parsed.lastSyncAt === 'string' ? parsed.lastSyncAt : undefined,
        };
      } catch {
        return { enabled: true };
      }
    },
    write(next) {
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    },
  };
}

export function defaultAgentKitStore(app: Pick<Electron.App, 'getPath'>): AgentKitStore {
  return createAgentKitStore(join(app.getPath('userData'), 'agent-kit.json'));
}

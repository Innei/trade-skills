import type { ProLicenseGate, SecretBox } from '@kansoku/pro-api';
import type { AiRole, RoleSetting, SettingsStore } from '../ai/settingsStore.js';
import type { Db } from '../db/index.js';
import { getDb } from '../db/index.js';
import { KANSOKU_HOME } from '../env.js';
import { DEFAULT_WATCHED_MARKETS, type WatchedMarketsStore } from '../services/watchedMarketsStore.js';
import type { IpcRegistry } from './ipcRegistry.js';
import type { RealtimeChannelRegistry } from './realtimeRegistry.js';

export interface EditionPaths {
  kansokuHome: string;
}

export interface Logger {
  log(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  debug(...args: unknown[]): void;
}

export interface CoreEditionHost {
  db: Db;
  license: ProLicenseGate;
  aiSettings: SettingsStore;
  watchedMarkets: WatchedMarketsStore;
  paths: EditionPaths;
  secretBox?: SecretBox;
  aiRuntimeAlreadyInitialized?: boolean;
  production: boolean;
  logger: Logger;
}

export interface ServerEditionHost extends CoreEditionHost {}

export interface DesktopEditionHost extends CoreEditionHost {
  ipc: IpcRegistry;
  realtime: RealtimeChannelRegistry;
  relaunch?: () => void;
}

function defaultRoleSetting(role: AiRole): RoleSetting {
  return {
    mode: role === 'primary' ? 'disabled' : 'inherit',
    provider: null,
    modelId: null,
    thinkingLevel: null,
  };
}

function createNoopSettingsStore(): SettingsStore {
  return {
    getRole: (role) => defaultRoleSetting(role),
    listRoles: () => ({
      primary: defaultRoleSetting('primary'),
      comment: defaultRoleSetting('comment'),
      analyst: defaultRoleSetting('analyst'),
      deepDive: defaultRoleSetting('deepDive'),
      chat: defaultRoleSetting('chat'),
      memory: defaultRoleSetting('memory'),
    }),
    setRole: () => {},
    revision: () => 0,
  };
}

function createNoopWatchedMarketsStore(): WatchedMarketsStore {
  let markets = DEFAULT_WATCHED_MARKETS;
  return {
    get: () => markets,
    set: (next) => {
      markets = next;
    },
    revision: () => 0,
  };
}

function createConsoleLogger(): Logger {
  return {
    log: (...args) => console.info(...args),
    info: (...args) => console.info(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args),
    debug: (...args) => console.info(...args),
  };
}

export function createDefaultServerEditionHost(
  overrides?: Partial<ServerEditionHost>,
): ServerEditionHost {
  return {
    db: getDb(),
    license: { isLicensed: () => false },
    aiSettings: createNoopSettingsStore(),
    watchedMarkets: createNoopWatchedMarketsStore(),
    paths: { kansokuHome: KANSOKU_HOME },
    production: false,
    logger: createConsoleLogger(),
    ...overrides,
  };
}

export function createDefaultDesktopEditionHost(
  overrides: Partial<DesktopEditionHost> & Pick<DesktopEditionHost, 'ipc' | 'realtime'>,
): DesktopEditionHost {
  return {
    db: getDb(),
    license: { isLicensed: () => false },
    aiSettings: createNoopSettingsStore(),
    watchedMarkets: createNoopWatchedMarketsStore(),
    paths: { kansokuHome: KANSOKU_HOME },
    production: false,
    logger: createConsoleLogger(),
    ...overrides,
  };
}

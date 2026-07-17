import type { CockpitComment, MacroEventItem } from "../../../shared/types.js";

export interface SymbolFollowState {
  symbol: string;
  following: boolean;
  startedAt: string | null;
}

export interface ProHooks {
  filterMacroForSymbol(symbol: string, items: MacroEventItem[]): Promise<MacroEventItem[]>;
  listFollowedSymbols(): string[];
  setSymbolFollowing(symbol: string, following: boolean): SymbolFollowState;
  listComments(symbol: string, date: string): Promise<CockpitComment[]>;
  listAllCommentDates(limit?: number): Promise<string[]>;
  activeSettingsRevision(): number;
}

export interface ProHostContext {
  db: unknown;
  realtimeHub: unknown;
  longbridgeClient: unknown;
  dataDir: string;
}

export interface ProCapabilities {
  pro: boolean;
  licensed: boolean;
}

export interface ProModule {
  hooks: ProHooks;
  tsukiModules?: unknown[];
  ipcServiceClasses?: unknown[];
  channels?: unknown[];
  startScheduler?: (ctx: ProHostContext) => void | (() => void);
  initRuntime?: (db: unknown, secretBox: unknown) => void | Promise<void>;
  migrations?: string;
}

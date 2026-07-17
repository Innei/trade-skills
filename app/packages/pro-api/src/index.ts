import type { AiUsageSummary, CockpitComment, MacroEventItem } from "../../../shared/types.js";
import type {
  AiSettingsService,
  DeepDiveStartResult,
  DeepDiveState,
  ReassessResult,
  ReassessStatus,
} from "./aiTypes.js";

export * from "./aiTypes.js";

export interface SymbolFollowState {
  symbol: string;
  following: boolean;
  startedAt: string | null;
}

export interface ProHooks {
  filterMacroForSymbol(symbol: string, items: MacroEventItem[]): Promise<MacroEventItem[]>;
  listFollowedSymbols(): string[];
  setSymbolFollowing(symbol: string, following: boolean): SymbolFollowState;
  symbolFollowState(symbol: string): SymbolFollowState;
  requestImmediateFollow(symbol: string): void | Promise<void>;
  listComments(symbol: string, date: string): Promise<CockpitComment[]>;
  listCommentDates(symbol: string): Promise<string[]>;
  listAllCommentDates(limit?: number): Promise<string[]>;
  reassessSymbol(symbol: string): Promise<ReassessResult>;
  analystRunStatus(symbol: string): ReassessStatus;
  startDeepDiveForNote(note: string): DeepDiveStartResult;
  deepDiveStatus(): DeepDiveState;
  usageSummary(date: string): Promise<AiUsageSummary>;
  listUsageDates(limit: number): Promise<string[]>;
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

export interface ProChannel {
  kind: string;
  parse: (raw: Record<string, unknown>) => Record<string, unknown> | null;
  attach: (
    msg: Record<string, unknown>,
    push: (envelope: string) => void,
  ) => (() => void) | Promise<() => void>;
}

export interface ProModule {
  hooks: ProHooks;
  aiSettings?: AiSettingsService;
  tsukiModules?: unknown[];
  ipcServiceClasses?: unknown[];
  channels?: ProChannel[];
  startScheduler?: (ctx?: ProHostContext) => void | (() => void);
  initRuntime?: (db: unknown, secretBox: unknown) => void | Promise<void>;
  migrations?: string;
}

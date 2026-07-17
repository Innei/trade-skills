import type { ProHooks, ProModule } from "@kansoku/pro-api";

export const freeHooks: ProHooks = {
  async filterMacroForSymbol(_symbol, items) {
    return items;
  },
  listFollowedSymbols() {
    return [];
  },
  setSymbolFollowing(symbol, _following) {
    return { symbol, following: false, startedAt: null };
  },
  symbolFollowState(symbol) {
    return { symbol, following: false, startedAt: null };
  },
  requestImmediateFollow() {},
  async listComments() {
    return [];
  },
  async listCommentDates() {
    return [];
  },
  async listAllCommentDates() {
    return [];
  },
  async reassessSymbol() {
    return { started: false, reason: "analyst layer disabled" };
  },
  analystRunStatus() {
    return { running: false };
  },
  startDeepDiveForNote() {
    return { started: false, reason: "disabled" };
  },
  deepDiveStatus() {
    return { running: false };
  },
  async usageSummary(date) {
    return { date, runs: 0, calls: 0, total_tokens: 0, cost_total: 0, by_layer: {} };
  },
  async listUsageDates() {
    return [];
  },
  activeSettingsRevision() {
    return 0;
  },
};

let activeModule: ProModule | null = null;

export function registerProModule(module: ProModule): void {
  activeModule = module;
}

export function extendProModule(patch: Partial<ProModule>): void {
  if (!activeModule) return;
  activeModule = { ...activeModule, ...patch };
}

export function getPro(): ProModule | null {
  return activeModule;
}

export function isProPresent(): boolean {
  return activeModule !== null;
}

export function unregisterProModuleForTests(): void {
  activeModule = null;
}

export function getProHooks(): ProHooks {
  return activeModule?.hooks ?? freeHooks;
}

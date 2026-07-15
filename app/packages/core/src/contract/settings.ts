import type { CredentialListEntry } from "../ai/credentialStore.js";
import type { MasterKeyStatus } from "../ai/secretBox.js";
import type { AiRole, RoleSetting } from "../ai/settingsStore.js";
import type { Market } from "../services/symbol.utils.js";
import { defineRoutes } from "./defineRoutes.js";

export interface RoleSettingOut extends RoleSetting {
  stale: boolean;
}

export interface SettingsAiOut {
  roles: Record<AiRole, RoleSettingOut>;
  credentials: CredentialListEntry[];
  masterKey: MasterKeyStatus;
}

export interface CatalogModel {
  id: string;
  name: string;
  thinkingLevels: string[];
}

export interface CatalogProvider {
  id: string;
  name: string;
  auth: { kind: "api_key" | "oauth"; status: "configured" | "missing" | "error" };
  models: CatalogModel[];
}

export type TestConnectionResult =
  | { ok: true; latencyMs: number }
  | { ok: false; status: 504 | 502; error: string; hint: string };

export interface UsageTodayOut {
  roles: Record<"comment" | "analyst" | "deepDive" | "chat", { calls: number; cost: number }>;
  total: { calls: number; cost: number };
}

export interface SettingsApi {
  getAi(): Promise<SettingsAiOut>;
  putRole(input: {
    role: string;
    mode?: unknown;
    provider?: unknown;
    modelId?: unknown;
    thinkingLevel?: unknown;
  }): Promise<{ role: AiRole } & RoleSetting>;
  deleteRole(input: { role: string }): Promise<{ role: AiRole; mode: "disabled" }>;
  putCredential(input: { provider: string; key?: unknown }): Promise<{ provider: string; masked: string | null }>;
  deleteCredential(input: { provider: string }): Promise<{ provider: string; deleted: true }>;
  getCatalog(): Promise<{ providers: CatalogProvider[] }>;
  testConnection(input: Record<string, unknown>): Promise<TestConnectionResult>;
  getUsageToday(): Promise<UsageTodayOut>;
  resetCredentials(): Promise<{ reset: true }>;
  getWatchedMarkets(): Promise<{ markets: Market[] }>;
  putWatchedMarkets(input: { markets: unknown }): Promise<{ markets: Market[] }>;
}

export const settingsRoutes = defineRoutes<SettingsApi>("settings", {
  getAi: { method: "GET", path: "/ai" },
  putRole: { method: "PUT", path: "/ai/roles/:role" },
  deleteRole: { method: "DELETE", path: "/ai/roles/:role" },
  putCredential: { method: "PUT", path: "/ai/credentials/:provider" },
  deleteCredential: { method: "DELETE", path: "/ai/credentials/:provider" },
  getCatalog: { method: "GET", path: "/ai/catalog" },
  testConnection: { method: "POST", path: "/ai/test" },
  getUsageToday: { method: "GET", path: "/ai/usage-today" },
  resetCredentials: { method: "POST", path: "/ai/reset-credentials" },
  getWatchedMarkets: { method: "GET", path: "/watched-markets" },
  putWatchedMarkets: { method: "PUT", path: "/watched-markets" },
});

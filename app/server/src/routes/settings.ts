import type { MutableModels } from "@earendil-works/pi-ai";
import type { FastifyPluginAsync } from "fastify";
import { getAiRuntime } from "../ai/initAiSettings.js";
import type { AppCredentialStore } from "../ai/credentialStore.js";
import { getModelsRuntime, SINGLE_KEY_PROVIDERS } from "../ai/modelsRuntime.js";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import type { SecretBox } from "../ai/secretBox.js";
import { type AiRole, getActiveSettingsStore, type SettingsStore } from "../ai/settingsStore.js";
import { getDb, type Db } from "../db/index.js";
import { ClientError } from "../errors.js";
import {
  allowedProviders,
  categorizeTestError,
  CODEX_PROVIDER,
  parseRole,
  ROLES,
  sanitizeAuthError,
  validateCustomRef,
  validateRoleSetting,
} from "./settingsValidation.js";

const DEFAULT_TEST_TIMEOUT_MS = 25_000;
const TEST_PROMPT_MAX_TOKENS = 16;

export interface SettingsRouteOptions {
  settingsStore?: SettingsStore;
  credentials?: AppCredentialStore;
  secretBox?: SecretBox;
  models?: MutableModels;
  testTimeoutMs?: number;
  db?: Db;
}

async function collectKnownSecrets(credentials: AppCredentialStore, provider: string): Promise<string[]> {
  try {
    const credential = await credentials.read(provider);
    if (!credential) return [];
    if (credential.type === "api_key" && credential.key) return [credential.key];
    if (credential.type === "oauth") return [credential.access, credential.refresh].filter(Boolean) as string[];
    return [];
  } catch {
    return [];
  }
}

export const settingsRoute: FastifyPluginAsync<SettingsRouteOptions> = async (app, opts) => {
  const settingsStore = opts.settingsStore ?? getActiveSettingsStore();
  const credentials = opts.credentials ?? getAiRuntime().credentials;
  const secretBox = opts.secretBox ?? getAiRuntime().secretBox;
  const models = opts.models ?? getModelsRuntime();
  const testTimeoutMs = opts.testTimeoutMs ?? DEFAULT_TEST_TIMEOUT_MS;
  const db = opts.db ?? getDb();

  app.get("/ai", async () => {
    const rolesOut = {} as Record<AiRole, ReturnType<SettingsStore["getRole"]> & { stale: boolean }>;
    for (const role of ROLES) {
      const setting = settingsStore.getRole(role);
      const stale =
        setting.mode === "custom" && !models.getModel(setting.provider ?? "", setting.modelId ?? "");
      rolesOut[role] = { ...setting, stale };
    }
    return {
      ok: true,
      data: { roles: rolesOut, credentials: credentials.list(), masterKey: secretBox.status() },
    };
  });

  app.put<{ Params: { role: string }; Body: Record<string, unknown> }>("/ai/roles/:role", async (req) => {
    const role = parseRole(req.params.role);
    const setting = validateRoleSetting(role, req.body ?? {}, models);
    settingsStore.setRole(role, setting);
    return { ok: true, data: { role, ...settingsStore.getRole(role) } };
  });

  app.delete<{ Params: { role: string } }>("/ai/roles/:role", async (req) => {
    const role = parseRole(req.params.role);
    settingsStore.setRole(role, { mode: "disabled", provider: null, modelId: null, thinkingLevel: null });
    return { ok: true, data: { role, mode: "disabled" } };
  });

  app.put<{ Params: { provider: string }; Body: { key?: unknown } }>("/ai/credentials/:provider", async (req) => {
    const provider = req.params.provider;
    if (provider === CODEX_PROVIDER) {
      throw new ClientError(`cannot set an api key for ${CODEX_PROVIDER}`, "managed by codex CLI login");
    }
    if (!SINGLE_KEY_PROVIDERS.has(provider)) {
      throw new ClientError(
        `unknown provider: ${provider}`,
        `expected one of ${[...SINGLE_KEY_PROVIDERS].join(", ")}`,
      );
    }
    const key = req.body?.key;
    if (typeof key !== "string" || !key) {
      throw new ClientError('"key" must be a non-empty string');
    }
    credentials.setApiKey(provider, key);
    const entry = credentials.list().find((e) => e.provider === provider);
    return { ok: true, data: { provider, masked: entry?.masked ?? null } };
  });

  app.delete<{ Params: { provider: string } }>("/ai/credentials/:provider", async (req) => {
    const provider = req.params.provider;
    try {
      await credentials.delete(provider);
    } catch (err) {
      const hint = provider === CODEX_PROVIDER ? "managed by codex CLI login" : undefined;
      throw new ClientError(err instanceof Error ? err.message : String(err), hint);
    }
    return { ok: true, data: { provider, deleted: true } };
  });

  app.get("/ai/catalog", async () => {
    const configuredApiKey = new Set(credentials.list().filter((e) => e.ok).map((e) => e.provider));
    const providers = [];
    for (const id of allowedProviders()) {
      const provider = models.getProvider(id);
      const name = provider?.name ?? id;
      const modelList = (provider?.getModels() ?? []).map((m) => ({
        id: m.id,
        name: m.name,
        thinkingLevels: getSupportedThinkingLevels(m),
      }));

      let auth: { kind: "api_key" | "oauth"; status: "configured" | "missing" | "error" };
      if (id === CODEX_PROVIDER) {
        try {
          const credential = await credentials.read(CODEX_PROVIDER);
          auth = { kind: "oauth", status: credential ? "configured" : "missing" };
        } catch {
          auth = { kind: "oauth", status: "error" };
        }
      } else {
        auth = { kind: "api_key", status: configuredApiKey.has(id) ? "configured" : "missing" };
      }

      providers.push({ id, name, auth, models: modelList });
    }
    return { ok: true, data: { providers } };
  });

  app.post<{ Body: Record<string, unknown> }>("/ai/test", async (req, reply) => {
    const { provider, modelId, thinkingLevel, model } = validateCustomRef(req.body ?? {}, models);
    const controller = new AbortController();
    let timedOut = false;
    let timer!: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new Error(`test call exceeded ${testTimeoutMs}ms`));
      }, testTimeoutMs);
    });
    const startedAt = Date.now();
    try {
      await Promise.race([
        models.completeSimple(
          model,
          { messages: [{ role: "user", content: "ping", timestamp: Date.now() }] },
          {
            ...(thinkingLevel === "off" ? {} : { reasoning: thinkingLevel }),
            maxTokens: TEST_PROMPT_MAX_TOKENS,
            signal: controller.signal,
          },
        ),
        timeoutPromise,
      ]);
      return { ok: true, data: { latencyMs: Date.now() - startedAt } };
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : String(err);
      const secrets = await collectKnownSecrets(credentials, provider);
      const hint = sanitizeAuthError(rawMessage, secrets);
      if (timedOut) {
        console.error(`settings: /ai/test timed out for ${provider}/${modelId}: ${hint}`);
        reply.status(504);
        return { ok: false, error: "timeout", hint };
      }
      console.error(`settings: /ai/test failed for ${provider}/${modelId}: ${hint}`);
      reply.status(502);
      return { ok: false, error: categorizeTestError(rawMessage), hint };
    } finally {
      clearTimeout(timer);
    }
  });

  app.post("/ai/reset-credentials", async () => {
    db.transaction(() => {
      credentials.wipeAll();
    });
    secretBox.resetKey();
    return { ok: true, data: { reset: true } };
  });
};

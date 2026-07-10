import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MutableModels } from "@earendil-works/pi-ai";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCredentialStore, type AppCredentialStore } from "../src/ai/credentialStore.js";
import { SINGLE_KEY_PROVIDERS } from "../src/ai/modelsRuntime.js";
import { createSecretBox, type SecretBox } from "../src/ai/secretBox.js";
import { createSettingsStore, type SettingsStore } from "../src/ai/settingsStore.js";
import { createDb, type Db } from "../src/db/index.js";
import { providerCredentials } from "../src/db/schema.js";
import { ClientError } from "../src/errors.js";
import { settingsRoute, type SettingsRouteOptions } from "../src/routes/settings.js";

const catalog = builtinModels();
const ANALYST_PROVIDER = "anthropic";
const ANALYST_MODEL_ID = "claude-sonnet-4-5";
const analystModel = catalog.getModel(ANALYST_PROVIDER, ANALYST_MODEL_ID);
if (!analystModel) throw new Error("fixture model anthropic/claude-sonnet-4-5 not in catalog");
const analystThinkingLevel = getSupportedThinkingLevels(analystModel)[0];

function stubModels(completeSimple: MutableModels["completeSimple"], credentials: AppCredentialStore): MutableModels {
  const base = builtinModels({ credentials });
  return {
    getProviders: base.getProviders.bind(base),
    getProvider: base.getProvider.bind(base),
    getModels: base.getModels.bind(base),
    getModel: base.getModel.bind(base),
    refresh: base.refresh.bind(base),
    getAuth: base.getAuth.bind(base),
    stream: base.stream.bind(base),
    complete: base.complete.bind(base),
    streamSimple: base.streamSimple.bind(base),
    completeSimple,
    setProvider: base.setProvider.bind(base),
    deleteProvider: base.deleteProvider.bind(base),
    clearProviders: base.clearProviders.bind(base),
  };
}

interface TestCtx {
  dir: string;
  db: Db;
  secretBox: SecretBox;
  credentials: AppCredentialStore;
  settingsStore: SettingsStore;
  models: MutableModels;
}

function makeCtx(): TestCtx {
  const dir = mkdtempSync(join(tmpdir(), "settings-routes-"));
  const db = createDb(join(dir, "app.db"));
  const secretBox = createSecretBox(join(dir, "master.key"));
  const codexAuthPath = join(dir, "codex-auth.json");
  const credentials = createCredentialStore(db, secretBox, { codexAuthPath });
  const settingsStore = createSettingsStore(db);
  const models = builtinModels({ credentials });
  return { dir, db, secretBox, credentials, settingsStore, models };
}

async function buildApp(ctx: TestCtx, overrides: Partial<SettingsRouteOptions> = {}): Promise<FastifyInstance> {
  const app = Fastify();
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ClientError) {
      return reply.status(err.status).send({ ok: false, error: err.message, hint: err.hint });
    }
    return reply.status(500).send({ ok: false, error: err instanceof Error ? err.message : String(err) });
  });
  await app.register(settingsRoute, {
    settingsStore: ctx.settingsStore,
    credentials: ctx.credentials,
    secretBox: ctx.secretBox,
    models: ctx.models,
    db: ctx.db,
    testTimeoutMs: 5_000,
    ...overrides,
  });
  return app;
}

let ctx: TestCtx;

beforeEach(() => {
  ctx = makeCtx();
});

afterEach(() => {
  rmSync(ctx.dir, { recursive: true, force: true });
});

describe("envelope", () => {
  it("GET /ai returns default roles, empty credentials, and a masterKey status, wrapped in {ok, data}", async () => {
    const app = await buildApp(ctx);
    const res = await app.inject({ method: "GET", url: "/ai" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.credentials).toEqual([]);
    expect(typeof body.data.masterKey).toBe("string");
    expect(body.data.roles.chat).toMatchObject({ mode: "inherit", stale: false });
    expect(body.data.roles.comment).toMatchObject({ mode: "disabled", stale: false });
    expect(body.data.roles.analyst).toMatchObject({ mode: "disabled", stale: false });
    expect(body.data.roles.deepDive).toMatchObject({ mode: "disabled", stale: false });
  });
});

describe("PUT/DELETE /ai/roles/:role", () => {
  it("rejects an unknown role", async () => {
    const app = await buildApp(ctx);
    const res = await app.inject({ method: "PUT", url: "/ai/roles/bogus", payload: { mode: "disabled" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().ok).toBe(false);
  });

  it("rejects inherit mode outside the chat role", async () => {
    const app = await buildApp(ctx);
    const res = await app.inject({ method: "PUT", url: "/ai/roles/comment", payload: { mode: "inherit" } });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an unknown provider", async () => {
    const app = await buildApp(ctx);
    const res = await app.inject({
      method: "PUT",
      url: "/ai/roles/analyst",
      payload: { mode: "custom", provider: "not-a-provider", modelId: "x", thinkingLevel: "off" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a model not in the catalog", async () => {
    const app = await buildApp(ctx);
    const res = await app.inject({
      method: "PUT",
      url: "/ai/roles/analyst",
      payload: { mode: "custom", provider: ANALYST_PROVIDER, modelId: "no-such-model", thinkingLevel: "off" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a thinkingLevel the model does not support", async () => {
    const app = await buildApp(ctx);
    const res = await app.inject({
      method: "PUT",
      url: "/ai/roles/analyst",
      payload: {
        mode: "custom",
        provider: ANALYST_PROVIDER,
        modelId: ANALYST_MODEL_ID,
        thinkingLevel: "not-a-level",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("persists a valid custom setting and returns it", async () => {
    const app = await buildApp(ctx);
    const res = await app.inject({
      method: "PUT",
      url: "/ai/roles/analyst",
      payload: {
        mode: "custom",
        provider: ANALYST_PROVIDER,
        modelId: ANALYST_MODEL_ID,
        thinkingLevel: analystThinkingLevel,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toEqual({
      role: "analyst",
      mode: "custom",
      provider: ANALYST_PROVIDER,
      modelId: ANALYST_MODEL_ID,
      thinkingLevel: analystThinkingLevel,
    });
    expect(ctx.settingsStore.getRole("analyst")).toMatchObject({
      mode: "custom",
      provider: ANALYST_PROVIDER,
      modelId: ANALYST_MODEL_ID,
    });
  });

  it("DELETE sets the role to disabled", async () => {
    ctx.settingsStore.setRole("analyst", {
      mode: "custom",
      provider: ANALYST_PROVIDER,
      modelId: ANALYST_MODEL_ID,
      thinkingLevel: analystThinkingLevel,
    });
    const app = await buildApp(ctx);
    const res = await app.inject({ method: "DELETE", url: "/ai/roles/analyst" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, data: { role: "analyst", mode: "disabled" } });
    expect(ctx.settingsStore.getRole("analyst")).toMatchObject({ mode: "disabled", provider: null });
  });
});

describe("PUT/DELETE /ai/credentials/:provider", () => {
  it("rejects setting an api key for openai-codex", async () => {
    const app = await buildApp(ctx);
    const res = await app.inject({ method: "PUT", url: "/ai/credentials/openai-codex", payload: { key: "x" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().hint).toMatch(/codex/i);
  });

  it("rejects an empty key", async () => {
    const app = await buildApp(ctx);
    const res = await app.inject({ method: "PUT", url: "/ai/credentials/deepseek", payload: { key: "" } });
    expect(res.statusCode).toBe(400);
  });

  it("sets an api key, encrypts it in the DB, and returns a masked tail", async () => {
    const app = await buildApp(ctx);
    const res = await app.inject({
      method: "PUT",
      url: "/ai/credentials/deepseek",
      payload: { key: "sk-real-secret-9876" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.provider).toBe("deepseek");
    expect(body.data.masked.endsWith("9876")).toBe(true);

    const row = ctx.db.select().from(providerCredentials).where(eq(providerCredentials.provider, "deepseek")).get();
    expect(row?.secret.startsWith("v1:")).toBe(true);
  });

  it("DELETE removes a credential", async () => {
    ctx.credentials.setApiKey("deepseek", "sk-real-secret-9876");
    const app = await buildApp(ctx);
    const res = await app.inject({ method: "DELETE", url: "/ai/credentials/deepseek" });
    expect(res.statusCode).toBe(200);
    await expect(ctx.credentials.read("deepseek")).resolves.toBeUndefined();
  });

  it("DELETE openai-codex is rejected", async () => {
    const app = await buildApp(ctx);
    const res = await app.inject({ method: "DELETE", url: "/ai/credentials/openai-codex" });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /ai/catalog", () => {
  it("only lists the allowlisted providers plus openai-codex", async () => {
    const app = await buildApp(ctx);
    const res = await app.inject({ method: "GET", url: "/ai/catalog" });
    expect(res.statusCode).toBe(200);
    const ids = res.json().data.providers.map((p: { id: string }) => p.id).sort();
    const expected = [...SINGLE_KEY_PROVIDERS, "openai-codex"].sort();
    expect(ids).toEqual(expected);
  });

  it("shows configured for a provider with a stored key, missing for codex with no auth file", async () => {
    ctx.credentials.setApiKey(ANALYST_PROVIDER, "sk-real-secret-9876");
    const app = await buildApp(ctx);
    const res = await app.inject({ method: "GET", url: "/ai/catalog" });
    const providers = res.json().data.providers as { id: string; auth: { kind: string; status: string } }[];
    const anthropic = providers.find((p) => p.id === ANALYST_PROVIDER);
    expect(anthropic?.auth).toEqual({ kind: "api_key", status: "configured" });
    const codex = providers.find((p) => p.id === "openai-codex");
    expect(codex?.auth).toEqual({ kind: "oauth", status: "missing" });
  });

  it("carries a non-empty thinkingLevels array for each catalog model", async () => {
    const app = await buildApp(ctx);
    const res = await app.inject({ method: "GET", url: "/ai/catalog" });
    const providers = res.json().data.providers as { id: string; models: { thinkingLevels: string[] }[] }[];
    const anthropic = providers.find((p) => p.id === ANALYST_PROVIDER);
    expect(anthropic?.models.length).toBeGreaterThan(0);
    for (const model of anthropic?.models ?? []) {
      expect(model.thinkingLevels.length).toBeGreaterThan(0);
    }
  });
});

describe("POST /ai/test", () => {
  it("returns a latencyMs on success", async () => {
    const models = stubModels(async () => ({ role: "assistant" }) as never, ctx.credentials);
    const app = await buildApp(ctx, { models });
    const res = await app.inject({
      method: "POST",
      url: "/ai/test",
      payload: { provider: ANALYST_PROVIDER, modelId: ANALYST_MODEL_ID, thinkingLevel: analystThinkingLevel },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.data.latencyMs).toBe("number");
  });

  it("redacts a plaintext key that leaks into the upstream error message", async () => {
    ctx.credentials.setApiKey(ANALYST_PROVIDER, "sk-real-secret-9876");
    const models = stubModels(async () => {
      throw new Error("upstream rejected key sk-real-secret-9876");
    }, ctx.credentials);
    const app = await buildApp(ctx, { models });
    const res = await app.inject({
      method: "POST",
      url: "/ai/test",
      payload: { provider: ANALYST_PROVIDER, modelId: ANALYST_MODEL_ID, thinkingLevel: analystThinkingLevel },
    });
    expect(res.statusCode).toBe(502);
    const body = res.json();
    expect(body.ok).toBe(false);
    expect(body.hint).toContain("[redacted]");
    expect(body.hint).not.toContain("sk-real-secret-9876");
  });

  it("times out with a 504 and a stable timeout category", async () => {
    const models = stubModels(() => new Promise(() => {}), ctx.credentials);
    const app = await buildApp(ctx, { models, testTimeoutMs: 50 });
    const res = await app.inject({
      method: "POST",
      url: "/ai/test",
      payload: { provider: ANALYST_PROVIDER, modelId: ANALYST_MODEL_ID, thinkingLevel: analystThinkingLevel },
    });
    expect(res.statusCode).toBe(504);
    expect(res.json().error).toBe("timeout");
  });
});

describe("POST /ai/reset-credentials", () => {
  it("wipes all credentials and rotates the master key", async () => {
    ctx.credentials.setApiKey("deepseek", "sk-one-secret-1111");
    ctx.credentials.setApiKey("openai", "sk-two-secret-2222");
    const oldRow = ctx.db.select().from(providerCredentials).where(eq(providerCredentials.provider, "deepseek")).get();
    if (!oldRow) throw new Error("unreachable");

    const app = await buildApp(ctx);
    const res = await app.inject({ method: "POST", url: "/ai/reset-credentials" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, data: { reset: true } });

    expect(ctx.credentials.list()).toEqual([]);
    expect(() => ctx.secretBox.decrypt("deepseek", oldRow.secret)).toThrow();
  });
});

describe("no-plaintext sweep", () => {
  it("never echoes a stored plaintext key across GET /ai, GET /ai/catalog, or a failed /ai/test", async () => {
    const canary = "sk-plaintext-canary-1234";
    ctx.credentials.setApiKey(ANALYST_PROVIDER, canary);

    const models = stubModels(async () => {
      throw new Error(`upstream said: ${canary}`);
    }, ctx.credentials);
    const app = await buildApp(ctx, { models });

    const getAi = await app.inject({ method: "GET", url: "/ai" });
    const getCatalog = await app.inject({ method: "GET", url: "/ai/catalog" });
    const testRes = await app.inject({
      method: "POST",
      url: "/ai/test",
      payload: { provider: ANALYST_PROVIDER, modelId: ANALYST_MODEL_ID, thinkingLevel: analystThinkingLevel },
    });

    for (const res of [getAi, getCatalog, testRes]) {
      expect(JSON.stringify(res.json())).not.toContain(canary);
    }
  });
});

import type { AssistantMessage, Context, Model, StreamOptions, Usage } from '@earendil-works/pi-ai';
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai';
import type { AppCredentialStore } from '../../settings/credentialStore.js';
import {
  LOBEHUB_API,
  LOBEHUB_PROVIDER,
  LobeHubCloudError,
  type LobeHubAccount,
  type LobeHubCloudGateway,
  type LobeHubCredits,
  type LobeHubDeviceLogin,
  type LobeHubDevicePollResult,
} from '../types.js';
import { runChatStream } from './chatStream.js';
import { decodeJwtClaims, tokenCredential } from './credentials.js';
import { modelFromCloud } from './models.js';
import { number, object, text, type JsonObject } from './json.js';
import { availableCredits, jsonResponse, mapHttpError, trpcData } from './transport.js';

const CREDIT_UNIT = 1_000_000;
const REFRESH_BUFFER_MS = 60_000;
const EMPTY_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

interface GatewayOptions {
  baseUrl: string;
  clientId?: string;
  credentials: AppCredentialStore;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
}

interface PendingDeviceLogin {
  deviceCode: string;
  expiresAt: number;
  intervalSeconds: number;
}

interface OidcDiscovery {
  userinfo_endpoint?: string;
  revocation_endpoint?: string;
}

export class WebApiLobeHubCloudGateway implements LobeHubCloudGateway {
  readonly baseUrl: string;
  private readonly clientId?: string;
  private readonly credentials: AppCredentialStore;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly now: () => number;
  private pending: PendingDeviceLogin | null = null;
  private discovery: Promise<OidcDiscovery> | null = null;

  constructor(options: GatewayOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.clientId = options.clientId?.trim() || undefined;
    this.credentials = options.credentials;
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
  }

  get available(): boolean {
    return Boolean(this.clientId);
  }

  private requireClientId(): string {
    if (!this.clientId)
      throw new LobeHubCloudError('cloud_unavailable', '尚未配置 LobeHub Cloud Client ID');
    return this.clientId;
  }

  private discover(): Promise<OidcDiscovery> {
    this.discovery ??= this.fetcher(`${this.baseUrl}/.well-known/openid-configuration`)
      .then(async (response) =>
        response.ok ? ((object(await response.json()) as OidcDiscovery) ?? {}) : {},
      )
      .catch(() => ({}));
    return this.discovery;
  }

  private async postForm(path: string, form: Record<string, string>): Promise<JsonObject> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(form),
      });
    } catch (error) {
      throw new LobeHubCloudError(
        'network_error',
        error instanceof Error ? error.message : String(error),
      );
    }
    const raw = await response.text();
    let body: JsonObject;
    try {
      body = object(raw ? JSON.parse(raw) : null) ?? {};
    } catch {
      throw new LobeHubCloudError('protocol_incompatible', 'LobeHub Cloud 返回了无法解析的数据');
    }
    if (!response.ok && !text(body.error)) throw mapHttpError(response.status, raw.slice(0, 500));
    return body;
  }

  async startDeviceLogin(): Promise<LobeHubDeviceLogin> {
    const body = await this.postForm('/oidc/device/auth', {
      client_id: this.requireClientId(),
      resource: 'urn:lobehub:chat',
      scope: 'openid profile email offline_access',
    });
    const deviceCode = text(body.device_code);
    const userCode = text(body.user_code);
    const verificationUri = text(body.verification_uri);
    if (!deviceCode || !userCode || !verificationUri) {
      throw new LobeHubCloudError('protocol_incompatible', 'LobeHub Cloud 设备登录响应不完整');
    }
    const intervalSeconds = Math.max(1, number(body.interval, 5));
    const expiresAt = this.now() + number(body.expires_in, 600) * 1000;
    this.pending = { deviceCode, intervalSeconds, expiresAt };
    return {
      userCode,
      verificationUri,
      verificationUriComplete: text(body.verification_uri_complete) ?? undefined,
      expiresAt: new Date(expiresAt).toISOString(),
      intervalSeconds,
    };
  }

  async pollDeviceLogin(): Promise<LobeHubDevicePollResult> {
    const pending = this.pending;
    if (!pending || this.now() >= pending.expiresAt) {
      this.pending = null;
      return { status: 'expired' };
    }
    const body = await this.postForm('/oidc/token', {
      client_id: this.requireClientId(),
      device_code: pending.deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });
    const error = text(body.error);
    if (error === 'authorization_pending')
      return { status: 'pending', intervalSeconds: pending.intervalSeconds };
    if (error === 'slow_down') {
      pending.intervalSeconds += 5;
      return { status: 'pending', intervalSeconds: pending.intervalSeconds };
    }
    if (error === 'access_denied') {
      this.pending = null;
      return { status: 'denied' };
    }
    if (error === 'expired_token') {
      this.pending = null;
      return { status: 'expired' };
    }
    if (error)
      throw new LobeHubCloudError('protocol_incompatible', `LobeHub Cloud 授权失败：${error}`);
    const credential = tokenCredential(body, '', this.now());
    await this.credentials.modify(LOBEHUB_PROVIDER, async () => credential);
    this.pending = null;
    return { status: 'connected' };
  }

  async refreshCredential(credential: { access: string; refresh: string; expires: number }) {
    if (!credential.refresh)
      throw new LobeHubCloudError('refresh_required', 'LobeHub Cloud 登录缺少 refresh token');
    const body = await this.postForm('/oidc/token', {
      client_id: this.requireClientId(),
      grant_type: 'refresh_token',
      refresh_token: credential.refresh,
    });
    const error = text(body.error);
    if (error)
      throw new LobeHubCloudError('refresh_required', `LobeHub Cloud 登录刷新失败：${error}`);
    const next = tokenCredential(body, credential.refresh, this.now());
    if (next.type !== 'oauth')
      throw new LobeHubCloudError('protocol_incompatible', '无效的 OAuth 凭据');
    return next;
  }

  private async accessToken(): Promise<string> {
    const next = await this.credentials.modify(LOBEHUB_PROVIDER, async (current) => {
      if (!current || current.type !== 'oauth')
        throw new LobeHubCloudError('not_authenticated', '尚未登录 LobeHub Cloud');
      if (current.expires > this.now() + REFRESH_BUFFER_MS) return undefined;
      return this.refreshCredential(current);
    });
    if (!next || next.type !== 'oauth')
      throw new LobeHubCloudError('not_authenticated', '尚未登录 LobeHub Cloud');
    return next.access;
  }

  async getAccount(): Promise<LobeHubAccount> {
    if (!this.available)
      return {
        status: 'unavailable',
        email: null,
        name: null,
        userId: null,
        updatedAt: null,
        baseUrl: this.baseUrl,
      };
    const credential = await this.credentials.read(LOBEHUB_PROVIDER);
    if (!credential || credential.type !== 'oauth') {
      return {
        status: 'disconnected',
        email: null,
        name: null,
        userId: null,
        updatedAt: null,
        baseUrl: this.baseUrl,
      };
    }
    try {
      const token = await this.accessToken();
      let claims = decodeJwtClaims(token);
      const discovery = await this.discover();
      if (discovery.userinfo_endpoint) {
        const response = await this.fetcher(discovery.userinfo_endpoint, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) claims = object(await response.json()) ?? claims;
      }
      const entry = this.credentials
        .listEntries()
        .find((item) => item.provider === LOBEHUB_PROVIDER);
      return {
        status: 'connected',
        email: text(claims.email),
        name: text(claims.name) ?? text(claims.preferred_username),
        userId: text(claims.sub),
        updatedAt: entry?.updatedAt ?? null,
        baseUrl: this.baseUrl,
      };
    } catch (error) {
      if (error instanceof LobeHubCloudError && error.code === 'refresh_required') {
        return {
          status: 'refresh_required',
          email: null,
          name: null,
          userId: null,
          updatedAt: null,
          baseUrl: this.baseUrl,
        };
      }
      throw error;
    }
  }

  private async trpcQuery(path: string, input: unknown): Promise<unknown> {
    const token = await this.accessToken();
    const url = new URL(`${this.baseUrl}/trpc/lambda/${path}`);
    url.searchParams.set('input', JSON.stringify({ json: input }));
    const response = await this.fetcher(url, { headers: { 'Oidc-Auth': token } });
    return trpcData(await jsonResponse(response));
  }

  private async currentMonthSpend(startTime: string, endTime: string): Promise<number> {
    const pageSize = 200;
    let current = 1;
    let total = Number.POSITIVE_INFINITY;
    let spend = 0;
    while ((current - 1) * pageSize < total) {
      const page = object(
        await this.trpcQuery('spend.getList', {
          params: { startTime, endTime, current, pageSize },
          sorts: {},
        }),
      );
      const rows = Array.isArray(page?.data) ? page.data : [];
      spend += rows.reduce((sum, row) => sum + number(object(row)?.spend), 0);
      total = number(page?.total, rows.length);
      if (rows.length < pageSize || current >= 100) break;
      current += 1;
    }
    return spend;
  }

  async getCredits(): Promise<LobeHubCredits> {
    const credential = await this.credentials.read(LOBEHUB_PROVIDER);
    if (!this.available || !credential || credential.type !== 'oauth') {
      return {
        availableCredits: 0,
        availableUsd: 0,
        currentMonthCredits: 0,
        currentMonthUsd: 0,
        plan: null,
        updatedAt: new Date(this.now()).toISOString(),
      };
    }
    const now = new Date(this.now());
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [subscription, currentMonthCredits] = await Promise.all([
      this.trpcQuery('subscription.getSubscription', null),
      this.currentMonthSpend(monthStart.toISOString(), now.toISOString()),
    ]);
    const available = availableCredits(subscription);
    return {
      availableCredits: available.credits,
      availableUsd: available.credits / CREDIT_UNIT,
      currentMonthCredits,
      currentMonthUsd: currentMonthCredits / CREDIT_UNIT,
      plan: available.plan,
      updatedAt: new Date(this.now()).toISOString(),
    };
  }

  async logout(): Promise<void> {
    this.pending = null;
    const credential = await this.credentials.read(LOBEHUB_PROVIDER);
    if (credential?.type === 'oauth' && credential.refresh) {
      try {
        const discovery = await this.discover();
        if (discovery.revocation_endpoint) {
          await this.fetcher(discovery.revocation_endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: this.requireClientId(),
              token: credential.refresh,
              token_type_hint: 'refresh_token',
            }),
          });
        }
      } catch {
        // Local logout must still succeed if Cloud revocation is unavailable.
      }
    }
    await this.credentials.delete(LOBEHUB_PROVIDER);
  }

  async listModels(): Promise<readonly Model<typeof LOBEHUB_API>[]> {
    const headers: Record<string, string> = {};
    const credential = await this.credentials.read(LOBEHUB_PROVIDER);
    if (credential?.type === 'oauth') {
      try {
        headers['Oidc-Auth'] = await this.accessToken();
      } catch (error) {
        if (!(error instanceof LobeHubCloudError) || error.code !== 'not_authenticated')
          throw error;
      }
    }
    const response = await this.fetcher(`${this.baseUrl}/webapi/lobehub-model-config`, { headers });
    const body = object(await jsonResponse(response));
    const models = Array.isArray(body?.models) ? body.models : [];
    return models.flatMap((item) => {
      const model = modelFromCloud(item, this.baseUrl);
      return model ? [model] : [];
    });
  }

  stream(model: Model<typeof LOBEHUB_API>, context: Context, options?: StreamOptions) {
    const output: AssistantMessage = {
      role: 'assistant',
      content: [],
      api: LOBEHUB_API,
      provider: LOBEHUB_PROVIDER,
      model: model.id,
      usage: structuredClone(EMPTY_USAGE),
      stopReason: 'stop',
      timestamp: this.now(),
    };
    const stream = createAssistantMessageEventStream();
    queueMicrotask(
      () =>
        void runChatStream(
          {
            baseUrl: this.baseUrl,
            fetcher: this.fetcher,
            accessToken: () => this.accessToken(),
          },
          stream,
          output,
          model,
          context,
          options,
        ),
    );
    return stream;
  }
}

import type { Credential } from '@earendil-works/pi-ai';
import { LobeHubCloudError } from '../types.js';
import { number, object, text, type JsonObject } from './json.js';

export function tokenCredential(body: JsonObject, currentRefresh = '', now = Date.now()): Credential {
  const access = text(body.access_token);
  if (!access)
    throw new LobeHubCloudError(
      'protocol_incompatible',
      'LobeHub Cloud token 响应缺少 access_token',
    );
  return {
    type: 'oauth',
    access,
    refresh: text(body.refresh_token) ?? currentRefresh,
    expires: now + number(body.expires_in, 3600) * 1000,
  };
}

export function decodeJwtClaims(token: string): JsonObject {
  try {
    const payload = token.split('.')[1];
    return object(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))) ?? {};
  } catch {
    return {};
  }
}

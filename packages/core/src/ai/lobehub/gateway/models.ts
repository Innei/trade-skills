import type { Model } from '@earendil-works/pi-ai';
import { LOBEHUB_API, LOBEHUB_PROVIDER } from '../types.js';
import { number, object, text, type JsonObject } from './json.js';

// DeepSeek v4 upstream accepts effort low|medium|high|xhigh|max — "minimal" is
// rejected with a 471 ProviderBizError. Which effort knob a model uses is
// announced via settings.extendParams in /webapi/lobehub-model-config.
const DEFAULT_THINKING_MAP = {
  off: null,
  minimal: 'minimal',
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'high',
} as const;
const DEEPSEEK_V4_THINKING_MAP = {
  off: null,
  minimal: 'low',
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'max',
} as const;

function thinkingLevelMapFromSettings(settings: JsonObject | null) {
  const extendParams = Array.isArray(settings?.extendParams) ? settings.extendParams : [];
  return extendParams.includes('deepseekV4ReasoningEffort')
    ? DEEPSEEK_V4_THINKING_MAP
    : DEFAULT_THINKING_MAP;
}

export function modelFromCloud(raw: unknown, baseUrl: string): Model<typeof LOBEHUB_API> | null {
  const item = object(raw);
  if (!item || item.type !== 'chat' || item.enabled === false) return null;
  const id = text(item.id);
  if (!id) return null;
  const abilities = object(item.abilities);
  const reasoning = abilities?.reasoning === true;
  return {
    id,
    name: text(item.displayName) ?? id,
    api: LOBEHUB_API,
    provider: LOBEHUB_PROVIDER,
    baseUrl,
    reasoning,
    thinkingLevelMap: reasoning ? thinkingLevelMapFromSettings(object(item.settings)) : undefined,
    input: abilities?.vision === true ? ['text', 'image'] : ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: number(item.contextWindowTokens, 128_000),
    maxTokens: number(item.maxOutput, 8_192),
  };
}

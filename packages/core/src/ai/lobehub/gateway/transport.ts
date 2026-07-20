import { LobeHubCloudError } from '../types.js';
import { number, object, text } from './json.js';

export function mapHttpError(status: number, body: string): LobeHubCloudError {
  if (status === 401 || status === 403)
    return new LobeHubCloudError('refresh_required', 'LobeHub Cloud 登录已失效', status);
  if (status === 402)
    return new LobeHubCloudError('insufficient_credits', 'LobeHub Cloud 额度不足', status);
  if (status === 404)
    return new LobeHubCloudError('model_unavailable', 'LobeHub Cloud 模型不可用', status);
  if (status === 429)
    return new LobeHubCloudError('rate_limited', 'LobeHub Cloud 请求过于频繁', status);
  if (status >= 500)
    return new LobeHubCloudError('cloud_unavailable', `LobeHub Cloud 暂时不可用：${body}`, status);
  return new LobeHubCloudError(
    'protocol_incompatible',
    `LobeHub Cloud 请求失败：${status} ${body}`,
    status,
  );
}

export async function jsonResponse(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (!response.ok) throw mapHttpError(response.status, raw.slice(0, 500));
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    throw new LobeHubCloudError('protocol_incompatible', 'LobeHub Cloud 返回了无法解析的数据');
  }
}

export interface ParsedSseEvent {
  event: string | null;
  data: string;
}

export function parseSseChunk(buffer: string): { events: ParsedSseEvent[]; rest: string } {
  const normalized = buffer.replaceAll('\r\n', '\n');
  const blocks = normalized.split('\n\n');
  const rest = blocks.pop() ?? '';
  return {
    rest,
    events: blocks.flatMap((block) => {
      const event =
        block
          .split('\n')
          .find((line) => line.startsWith('event:'))
          ?.slice(6)
          .trim() ?? null;
      const data = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      return data ? [{ event, data }] : [];
    }),
  };
}

export function trpcData(value: unknown): unknown {
  const root = Array.isArray(value) ? value[0] : value;
  const result = object(root)?.result;
  const data = object(result)?.data;
  return object(data)?.json ?? data;
}

export function availableCredits(subscription: unknown): { credits: number; plan: string | null } {
  const root = object(subscription);
  const usage = object(root?.usage);
  const buckets = [
    usage?.free,
    usage?.subscription,
    usage?.referral,
    ...(Array.isArray(usage?.packages) ? usage.packages : []),
  ];
  const credits = buckets.reduce((sum, raw) => {
    const bucket = object(raw);
    return sum + Math.max(0, number(bucket?.limit) - number(bucket?.boundedSpend ?? bucket?.spend));
  }, 0);
  return { credits, plan: text(root?.plan) };
}

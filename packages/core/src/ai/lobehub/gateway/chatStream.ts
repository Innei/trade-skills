import { randomUUID } from 'node:crypto';
import type {
  AssistantMessage,
  AssistantMessageEventStream,
  Context,
  Model,
  StreamOptions,
  ToolCall,
} from '@earendil-works/pi-ai';
import type { LOBEHUB_API } from '../types.js';
import { LobeHubCloudError } from '../types.js';
import { number, object, text, type JsonObject } from './json.js';
import { mapHttpError, parseSseChunk } from './transport.js';

export interface RunChatStreamContext {
  baseUrl: string;
  fetcher: typeof globalThis.fetch;
  accessToken: () => Promise<string>;
}

export function cloudMessages(context: Context): JsonObject[] {
  const messages: JsonObject[] = [];
  if (context.systemPrompt) messages.push({ role: 'system', content: context.systemPrompt });
  for (const message of context.messages) {
    if (message.role === 'user') {
      const content =
        typeof message.content === 'string'
          ? message.content
          : message.content.map((part) =>
              part.type === 'text'
                ? { type: 'text', text: part.text }
                : {
                    type: 'image_url',
                    image_url: { url: `data:${part.mimeType};base64,${part.data}` },
                  },
            );
      messages.push({ role: 'user', content });
      continue;
    }
    if (message.role === 'toolResult') {
      messages.push({
        role: 'tool',
        tool_call_id: message.toolCallId,
        content: message.content
          .map((part) => (part.type === 'text' ? part.text : `[image:${part.mimeType}]`))
          .join('\n'),
      });
      continue;
    }
    const toolCalls = message.content.filter((part): part is ToolCall => part.type === 'toolCall');
    messages.push({
      role: 'assistant',
      content: message.content
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join(''),
      ...(toolCalls.length
        ? {
            tool_calls: toolCalls.map((call) => ({
              id: call.id,
              type: 'function',
              function: { name: call.name, arguments: JSON.stringify(call.arguments) },
            })),
          }
        : {}),
    });
  }
  return messages;
}

export async function runChatStream(
  gateway: RunChatStreamContext,
  stream: AssistantMessageEventStream,
  output: AssistantMessage,
  model: Model<typeof LOBEHUB_API>,
  context: Context,
  options?: StreamOptions,
): Promise<void> {
  let activeText: number | null = null;
  let activeThinking: number | null = null;
  const toolCalls = new Map<string, ToolCall>();
  let requestedStopReason: string | null = null;
  try {
    stream.push({ type: 'start', partial: structuredClone(output) });
    const token = options?.apiKey || (await gateway.accessToken());
    const traceId = randomUUID();
    const trace = Buffer.from(
      JSON.stringify({
        enabled: true,
        traceId,
        sessionId: options?.sessionId ? `trade:${options.sessionId}` : `trade:${traceId}`,
        topicId: `trade:${model.id}`,
        tags: ['client:trade'],
      }),
    ).toString('base64');
    const payload: JsonObject = {
      model: model.id,
      messages: cloudMessages(context),
      stream: true,
      ...(context.tools?.length
        ? { tools: context.tools.map((tool) => ({ type: 'function', function: tool })) }
        : {}),
      ...(options?.temperature === undefined ? {} : { temperature: options.temperature }),
      ...(options?.maxTokens === undefined ? {} : { max_tokens: options.maxTokens }),
      ...(() => {
        const requested = (options as Record<string, unknown> | undefined)?.reasoning;
        if (typeof requested !== 'string') return {};
        const mapped = model.thinkingLevelMap
          ? model.thinkingLevelMap[requested as keyof typeof model.thinkingLevelMap]
          : requested;
        return mapped ? { reasoning_effort: mapped } : {};
      })(),
    };
    const changed = await options?.onPayload?.(payload, model);
    const response = await gateway.fetcher(`${gateway.baseUrl}/webapi/chat/lobehub`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Oidc-Auth': token, 'X-lobe-trace': trace },
      body: JSON.stringify(changed ?? payload),
      signal: options?.signal,
    });
    await options?.onResponse?.(
      { status: response.status, headers: Object.fromEntries(response.headers.entries()) },
      model,
    );
    if (!response.ok) throw mapHttpError(response.status, (await response.text()).slice(0, 500));
    if (!response.body)
      throw new LobeHubCloudError('protocol_incompatible', 'LobeHub Cloud 流式响应为空');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const parsed = parseSseChunk(buffer);
      buffer = parsed.rest;
      for (const rawEvent of parsed.events) {
        if (rawEvent.data === '[DONE]') continue;
        const decoded = JSON.parse(rawEvent.data) as unknown;
        const event = object(decoded) ?? {};
        const type = rawEvent.event ?? text(event.type);
        const delta =
          text(decoded) ?? text(event.text) ?? text(event.content) ?? text(event.delta) ?? '';
        if ((type === 'text' || type === 'content_part') && delta) {
          if (activeText === null) {
            activeText = output.content.length;
            output.content.push({ type: 'text', text: '' });
            stream.push({
              type: 'text_start',
              contentIndex: activeText,
              partial: structuredClone(output),
            });
          }
          const block = output.content[activeText];
          if (block?.type === 'text') block.text += delta;
          stream.push({
            type: 'text_delta',
            contentIndex: activeText,
            delta,
            partial: structuredClone(output),
          });
        } else if ((type === 'reasoning' || type === 'reasoning_part') && delta) {
          if (activeThinking === null) {
            activeThinking = output.content.length;
            output.content.push({ type: 'thinking', thinking: '' });
            stream.push({
              type: 'thinking_start',
              contentIndex: activeThinking,
              partial: structuredClone(output),
            });
          }
          const block = output.content[activeThinking];
          if (block?.type === 'thinking') block.thinking += delta;
          stream.push({
            type: 'thinking_delta',
            contentIndex: activeThinking,
            delta,
            partial: structuredClone(output),
          });
        } else if (type === 'usage') {
          const usage = object(event.usage) ?? object(event.data) ?? event;
          output.usage = {
            input: number(usage.totalInputTokens ?? usage.inputTokens ?? usage.input),
            output: number(usage.totalOutputTokens ?? usage.outputTokens ?? usage.output),
            cacheRead: number(usage.inputCachedTokens ?? usage.cacheRead),
            cacheWrite: number(usage.cacheWrite),
            reasoning: number(usage.outputReasoningTokens ?? usage.reasoning),
            totalTokens: number(usage.totalTokens),
            cost: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              total: number(usage.cost ?? usage.totalCost),
            },
          };
        } else if (type === 'tool_calls') {
          const calls = Array.isArray(decoded)
            ? decoded
            : Array.isArray(event.tool_calls)
              ? event.tool_calls
              : [];
          for (const [position, rawCall] of calls.entries()) {
            const call = object(rawCall);
            const fn = object(call?.function);
            const index = number(call?.index, position);
            const key = String(index);
            const existing = toolCalls.get(key);
            const id = text(call?.id) ?? existing?.id ?? `tool-${index}`;
            const rawArgs = text(fn?.arguments);
            const combinedArgs =
              existing && rawArgs && '_raw' in existing.arguments
                ? String(existing.arguments._raw) + rawArgs
                : rawArgs;
            toolCalls.set(key, {
              type: 'toolCall',
              id,
              name: text(fn?.name) ?? existing?.name ?? 'unknown_tool',
              arguments: (() => {
                if (!combinedArgs) return existing?.arguments ?? {};
                try {
                  return JSON.parse(combinedArgs) as Record<string, unknown>;
                } catch {
                  return { _raw: combinedArgs };
                }
              })(),
            });
          }
        } else if (type === 'stop') {
          requestedStopReason = text(decoded) ?? text(event.reason);
        } else if (type === 'error') {
          throw new LobeHubCloudError(
            'cloud_unavailable',
            text(decoded) ??
              text(event.message) ??
              text(event.error) ??
              'LobeHub Cloud 流式调用失败',
          );
        }
      }
      if (done) break;
    }
    if (activeText !== null) {
      const block = output.content[activeText];
      stream.push({
        type: 'text_end',
        contentIndex: activeText,
        content: block?.type === 'text' ? block.text : '',
        partial: structuredClone(output),
      });
    }
    if (activeThinking !== null) {
      const block = output.content[activeThinking];
      stream.push({
        type: 'thinking_end',
        contentIndex: activeThinking,
        content: block?.type === 'thinking' ? block.thinking : '',
        partial: structuredClone(output),
      });
    }
    for (const toolCall of toolCalls.values()) {
      const contentIndex = output.content.length;
      output.content.push(toolCall);
      stream.push({ type: 'toolcall_start', contentIndex, partial: structuredClone(output) });
      stream.push({
        type: 'toolcall_delta',
        contentIndex,
        delta: JSON.stringify(toolCall.arguments),
        partial: structuredClone(output),
      });
      stream.push({
        type: 'toolcall_end',
        contentIndex,
        toolCall,
        partial: structuredClone(output),
      });
    }
    output.stopReason =
      toolCalls.size > 0 ? 'toolUse' : requestedStopReason === 'length' ? 'length' : 'stop';
    stream.push({ type: 'done', reason: output.stopReason, message: output });
    stream.end(output);
  } catch (error) {
    output.stopReason = options?.signal?.aborted ? 'aborted' : 'error';
    output.errorMessage = error instanceof Error ? error.message : String(error);
    stream.push({ type: 'error', reason: output.stopReason, error: output });
    stream.end(output);
  }
}

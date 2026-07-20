import type { AgentMessage } from '@earendil-works/pi-agent-core';
import type { ProAiCompletedTurn, ProAiExtension } from '@kansoku/pro-api';
import { describe, expect, it, vi } from 'vitest';
import { MessagesEngine } from '../src/ai/messages/messageEngine.js';
import { prepareProAiTurn } from '../src/pro/aiExtension.js';

const ZERO_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function assistantMessage(text: string): AgentMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: 'anthropic-messages',
    provider: 'anthropic',
    model: 'test-model',
    usage: ZERO_USAGE,
    stopReason: 'stop',
    timestamp: 1,
  };
}

describe('prepareProAiTurn', () => {
  it('adapts Pro prompt context, read mounts, and completed transcripts into Core', async () => {
    const completed: ProAiCompletedTurn[] = [];
    const extension: ProAiExtension = {
      prepareTurn: async () => ({
        promptContext: '<persistent_memory>偏好：控制回撤</persistent_memory>',
        readMounts: [{ name: 'memory', root: '/tmp/memory', include: ['**/*.md'] }],
      }),
      afterTurn: async (turn) => {
        completed.push(turn);
      },
    };

    const prepared = await prepareProAiTurn(
      {
        surface: 'assistant',
        sessionId: 'session-1',
      },
      extension,
    );
    expect(prepared.readMounts).toEqual([
      { name: 'memory', root: '/tmp/memory', include: ['**/*.md'] },
    ]);

    const viewed = await new MessagesEngine(prepared.processors).process([
      { role: 'user', content: '分析当前情况', timestamp: 0 },
    ]);
    expect(JSON.stringify(viewed.messages)).toContain('偏好：控制回撤');
    expect(JSON.stringify(viewed.messages)).toContain('SYSTEM CONTEXT');

    prepared.onTurnComplete?.([
      { role: 'user', content: '以后控制回撤', timestamp: 0 },
      assistantMessage('已了解'),
    ]);
    await vi.waitFor(() => expect(completed).toHaveLength(1));
    expect(completed[0]).toEqual({
      surface: 'assistant',
      sessionId: 'session-1',
      messages: [
        { role: 'user', text: '以后控制回撤' },
        { role: 'assistant', text: '已了解' },
      ],
    });
  });

  it('fails open when the optional Pro extension cannot prepare memory', async () => {
    const extension: ProAiExtension = {
      prepareTurn: async () => {
        throw new Error('disk unavailable');
      },
    };

    await expect(
      prepareProAiTurn({ surface: 'chart-chat', sessionId: 'session-2' }, extension),
    ).resolves.toEqual({ readMounts: [], processors: [] });
  });
});

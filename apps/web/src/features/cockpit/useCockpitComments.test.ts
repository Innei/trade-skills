// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CockpitComment } from '@kansoku/shared/types';
import type { ChannelSpec } from '@web/lib/ws/wsHub';

const subscribeChannel = vi.fn();

vi.mock('@web/lib/client', () => ({
  client: { symbols: { comments: vi.fn() } },
}));
vi.mock('@web/lib/apiHooks', () => ({
  useQuery: () => ({ data: null, error: null, loading: false }),
}));
vi.mock('@web/lib/ws/wsHub', () => ({
  subscribeChannel: (...args: unknown[]) => subscribeChannel(...args),
}));

const { useCockpitComments } = await import('./useCockpitComments');

interface Sub {
  spec: ChannelSpec;
  onPayload: (payload: unknown) => void;
}

describe('useCockpitComments live delivery', () => {
  let subs: Sub[];

  beforeEach(() => {
    subs = [];
    subscribeChannel.mockReset();
    subscribeChannel.mockImplementation((spec: ChannelSpec, onPayload: (payload: unknown) => void) => {
      subs.push({ spec, onPayload });
      return vi.fn();
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('merges a live-broadcast explainer comment without any manual insertion', () => {
    const { result } = renderHook(() => useCockpitComments('MU.US'));
    expect(subs[0].spec).toEqual({ kind: 'comments', symbol: 'MU.US' });

    const explainerComment: CockpitComment = {
      ts: '2026-07-24T15:00:00.000Z',
      symbol: 'MU.US',
      level: 'info',
      source: 'explainer',
      trigger: 'manual: 解读请求',
      stance: 'no_action',
      text: '## 图上有什么\n...',
    };

    act(() => {
      subs[0].onPayload({ type: 'comment', comment: explainerComment });
    });

    expect(result.current.comments).toEqual([explainerComment]);
  });
});

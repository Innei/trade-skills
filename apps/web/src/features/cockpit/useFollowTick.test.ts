// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChannelSpec } from '@web/lib/ws/wsHub';

const subscribeChannel = vi.fn();

vi.mock('@web/lib/ws/wsHub', () => ({
  subscribeChannel: (...args: unknown[]) => subscribeChannel(...args),
}));

const { useFollowTick } = await import('./useFollowTick');

interface Sub {
  spec: ChannelSpec;
  onPayload: (payload: unknown) => void;
  unsub: ReturnType<typeof vi.fn>;
}

describe('useFollowTick', () => {
  let subs: Sub[];

  beforeEach(() => {
    subs = [];
    subscribeChannel.mockReset();
    subscribeChannel.mockImplementation(
      (spec: ChannelSpec, onPayload: (payload: unknown) => void) => {
        const unsub = vi.fn();
        subs.push({ spec, onPayload, unsub });
        return unsub;
      },
    );
  });

  afterEach(() => {
    cleanup();
  });

  it('does not subscribe when disabled', () => {
    renderHook(() => useFollowTick('MU.US', false));
    expect(subscribeChannel).not.toHaveBeenCalled();
  });

  it('subscribes to the notifications channel when enabled', () => {
    renderHook(() => useFollowTick('MU.US', true));
    expect(subscribeChannel).toHaveBeenCalledTimes(1);
    expect(subs[0].spec).toEqual({ kind: 'notifications' });
  });

  it('keeps the latest tick for a matching symbol', () => {
    const { result } = renderHook(() => useFollowTick('MU.US', true));
    act(() => {
      subs[0].onPayload({ type: 'follow_tick', tick: { symbol: 'MU.US', at: '2026-07-24T14:05:00.000Z' } });
    });
    expect(result.current?.at).toBe('2026-07-24T14:05:00.000Z');

    act(() => {
      subs[0].onPayload({ type: 'follow_tick', tick: { symbol: 'MU.US', at: '2026-07-24T14:10:00.000Z' } });
    });
    expect(result.current?.at).toBe('2026-07-24T14:10:00.000Z');
  });

  it('ignores ticks for a different symbol', () => {
    const { result } = renderHook(() => useFollowTick('MU.US', true));
    act(() => {
      subs[0].onPayload({ type: 'follow_tick', tick: { symbol: 'NVDA.US', at: '2026-07-24T14:05:00.000Z' } });
    });
    expect(result.current).toBeNull();
  });

  it('ignores non follow_tick envelopes', () => {
    const { result } = renderHook(() => useFollowTick('MU.US', true));
    act(() => {
      subs[0].onPayload({ type: 'comment', comment: {} });
    });
    expect(result.current).toBeNull();
  });

  it('resets the tick when the symbol changes', () => {
    const { result, rerender } = renderHook(({ sym }) => useFollowTick(sym, true), {
      initialProps: { sym: 'MU.US' },
    });
    act(() => {
      subs[0].onPayload({ type: 'follow_tick', tick: { symbol: 'MU.US', at: '2026-07-24T14:05:00.000Z' } });
    });
    expect(result.current).not.toBeNull();

    rerender({ sym: 'NVDA.US' });
    expect(result.current).toBeNull();
  });
});

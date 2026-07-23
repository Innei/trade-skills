// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatClockInZone, localTimeZone } from '@kansoku/shared/time';
import type { ChannelSpec } from '@web/lib/ws/wsHub';

let featureActive = true;
let following: boolean | null = true;
const subscribeChannel = vi.fn();

vi.mock('@web/features/edition/useFeature', () => ({
  useFeature: () => ({ active: featureActive, state: featureActive ? 'active' : 'absent' }),
}));
vi.mock('@web/features/quotes/useSymbolFollow', () => ({
  useSymbolFollow: () => ({ following, busy: false, statusError: null, change: vi.fn() }),
}));
vi.mock('@web/lib/ws/wsHub', () => ({
  subscribeChannel: (...args: unknown[]) => subscribeChannel(...args),
}));

const { AliveLine } = await import('./AliveLine');

interface Sub {
  spec: ChannelSpec;
  onPayload: (payload: unknown) => void;
}

describe('AliveLine', () => {
  let subs: Sub[];

  beforeEach(() => {
    featureActive = true;
    following = true;
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

  function push(payload: unknown) {
    act(() => {
      subs[0].onPayload(payload);
    });
  }

  it('renders nothing before any follow_tick arrives', () => {
    const { container } = render(<AliveLine symbol="MU.US" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the alive line once a matching follow_tick arrives, in local time', () => {
    const { container } = render(<AliveLine symbol="MU.US" />);
    push({ type: 'follow_tick', tick: { symbol: 'MU.US', at: '2026-07-24T14:32:00.000Z' } });

    const expectedClock = formatClockInZone('2026-07-24T14:32:00.000Z', localTimeZone());
    expect(screen.getByText(`跟进中 · 上次检测 ${expectedClock}`)).toBeTruthy();
    expect(container.querySelector('.ai-alive-line')).toBeTruthy();
  });

  it('stays hidden when the symbol-follow feature is not entitled', () => {
    featureActive = false;
    const { container } = render(<AliveLine symbol="MU.US" />);
    expect(container.firstChild).toBeNull();
  });

  it('stays hidden when the follow toggle is off for this symbol', () => {
    following = false;
    const { container } = render(<AliveLine symbol="MU.US" />);
    expect(container.firstChild).toBeNull();
  });

  it('does not subscribe to ticks at all when not entitled or not following', () => {
    featureActive = false;
    render(<AliveLine symbol="MU.US" />);
    expect(subscribeChannel).not.toHaveBeenCalled();
  });
});

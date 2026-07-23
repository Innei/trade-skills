import { describe, expect, it } from 'vitest';
import type { FollowTick } from '@kansoku/shared/types';
import {
  emitFollowTick,
  onAnyFollowTick,
  onFollowTick,
} from '../src/ai/personas/followTicks.js';
import { coreAiChannels } from '../src/realtime/aiChannels.js';

describe('follow tick hub', () => {
  it('delivers an emitted tick to a symbol listener', () => {
    const received: FollowTick[] = [];
    const unsub = onFollowTick('FT1.US', (t) => received.push(t));
    emitFollowTick({ symbol: 'FT1.US', at: '2026-07-07T15:00:00.000Z' });
    expect(received).toHaveLength(1);
    expect(received[0].at).toBe('2026-07-07T15:00:00.000Z');
    unsub();
  });

  it('delivers to an application-wide listener', () => {
    const received: FollowTick[] = [];
    const unsub = onAnyFollowTick((t) => received.push(t));
    emitFollowTick({ symbol: 'FT2.US', at: '2026-07-07T15:01:00.000Z' });
    expect(received.map((t) => t.symbol)).toEqual(['FT2.US']);
    unsub();
  });

  it('normalizes a bare symbol to the .US suffix like the comment path', () => {
    const received: FollowTick[] = [];
    const unsub = onFollowTick('FT3.US', (t) => received.push(t));
    emitFollowTick({ symbol: 'FT3', at: '2026-07-07T15:02:00.000Z' });
    expect(received).toHaveLength(1);
    expect(received[0].symbol).toBe('FT3.US');
    unsub();
  });

  it('does not replay a past tick to a listener that subscribes afterward', () => {
    emitFollowTick({ symbol: 'FT4.US', at: '2026-07-07T15:03:00.000Z' });
    const received: FollowTick[] = [];
    const unsub = onFollowTick('FT4.US', (t) => received.push(t));
    expect(received).toHaveLength(0);
    unsub();
  });

  it('stops delivery after unsubscribe', () => {
    const received: FollowTick[] = [];
    const unsub = onFollowTick('FT5.US', (t) => received.push(t));
    unsub();
    emitFollowTick({ symbol: 'FT5.US', at: '2026-07-07T15:04:00.000Z' });
    expect(received).toHaveLength(0);
  });
});

describe('follow tick forwarding', () => {
  it('pushes a follow_tick envelope through the notifications channel, the path comments use', async () => {
    const channel = coreAiChannels.find((c) => c.kind === 'notifications');
    expect(channel).toBeDefined();
    const envelopes: string[] = [];
    const detach = await channel!.attach({}, (envelope) => envelopes.push(envelope));
    emitFollowTick({ symbol: 'FT6.US', at: '2026-07-07T15:05:00.000Z' });
    detach();

    const ticks = envelopes
      .map((e) => JSON.parse(e))
      .filter((m) => m.type === 'follow_tick');
    expect(ticks).toHaveLength(1);
    expect(ticks[0].tick.symbol).toBe('FT6.US');
    expect(ticks[0].tick.at).toBe('2026-07-07T15:05:00.000Z');
  });
});

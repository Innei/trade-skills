import { useEffect, useState } from 'react';
import type { FollowTick } from '@kansoku/shared/types';
import { subscribeChannel } from '@web/lib/ws/wsHub';

interface FollowTickEnvelope {
  type: string;
  tick?: FollowTick;
}

const sameSymbol = (a: string, b: string): boolean => a.trim().toUpperCase() === b.trim().toUpperCase();

export function useFollowTick(symbol: string, enabled: boolean): FollowTick | null {
  const [tick, setTick] = useState<FollowTick | null>(null);

  useEffect(() => {
    setTick(null);
    if (!enabled) return;
    return subscribeChannel(
      { kind: 'notifications' },
      (payload) => {
        const env = payload as FollowTickEnvelope;
        if (env.type === 'follow_tick' && env.tick && sameSymbol(env.tick.symbol, symbol)) {
          setTick(env.tick);
        }
      },
      () => {},
    );
  }, [symbol, enabled]);

  return tick;
}

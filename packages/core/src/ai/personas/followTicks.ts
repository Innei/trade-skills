import type { FollowTick } from '@kansoku/shared/types';

type Listener = (tick: FollowTick) => void;

const listeners = new Map<string, Set<Listener>>();
const anyListeners = new Set<Listener>();

function key(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();
  return normalized.includes('.') ? normalized : `${normalized}.US`;
}

export function onFollowTick(symbol: string, listener: Listener): () => void {
  const k = key(symbol);
  let set = listeners.get(k);
  if (!set) {
    set = new Set();
    listeners.set(k, set);
  }
  set.add(listener);
  return () => {
    const current = listeners.get(k);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listeners.delete(k);
  };
}

export function onAnyFollowTick(listener: Listener): () => void {
  anyListeners.add(listener);
  return () => anyListeners.delete(listener);
}

export function emitFollowTick(tick: FollowTick): void {
  const k = key(tick.symbol);
  const normalized: FollowTick = { ...tick, symbol: k };
  const set = listeners.get(k);
  for (const listener of [...(set ?? []), ...anyListeners]) {
    try {
      listener(normalized);
    } catch {
      continue;
    }
  }
}

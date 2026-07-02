export interface PollerHandle {
  subscribe(listener: (envelope: string) => void): () => void;
  subscriberCount(): number;
}

export interface PollerOptions {
  intervalMs: number;
  task: () => Promise<unknown>;
  failThreshold?: number;
  backoffMs?: number;
  onStop?: () => void;
}

export function createPoller(opts: PollerOptions): PollerHandle {
  const failThreshold = opts.failThreshold ?? 5;
  const backoffMs = opts.backoffMs ?? 300_000;
  const listeners = new Set<(envelope: string) => void>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let stopped = false;
  let lastData: string | null = null;
  let failStreak = 0;
  let degraded = false;

  const emit = (envelope: string) => {
    for (const l of listeners) l(envelope);
  };

  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const data = await opts.task();
      const serialized = JSON.stringify({ type: "data", data });
      failStreak = 0;
      if (degraded) {
        degraded = false;
        emit(JSON.stringify({ type: "status", degraded: false }));
      }
      if (serialized !== lastData) {
        lastData = serialized;
        emit(serialized);
      }
    } catch (err) {
      failStreak += 1;
      degraded = true;
      emit(
        JSON.stringify({
          type: "status",
          degraded: true,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      running = false;
      if (!stopped && listeners.size > 0) {
        const interval = failStreak >= failThreshold ? backoffMs : opts.intervalMs;
        timer = setTimeout(tick, interval);
      }
    }
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (lastData !== null) listener(lastData);
      if (listeners.size === 1) {
        stopped = false;
        void tick();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          stopped = true;
          if (timer) clearTimeout(timer);
          timer = null;
          opts.onStop?.();
        }
      };
    },
    subscriberCount() {
      return listeners.size;
    },
  };
}

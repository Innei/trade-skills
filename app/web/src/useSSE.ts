import { useEffect, useRef, useState } from "react";
import { subscribeChannel, type ChannelSpec } from "./wsHub";

interface Envelope {
  type: "data" | "status";
  data?: unknown;
  degraded?: boolean;
}

export interface SSEState {
  degraded: boolean;
  connected: boolean;
}

// Historical name — live data now rides the shared /api/ws multiplexed socket.
export function useSSE<T>(spec: ChannelSpec | null, onData: (data: T) => void): SSEState {
  const [degraded, setDegraded] = useState(false);
  const [connected, setConnected] = useState(false);
  const handler = useRef(onData);
  handler.current = onData;
  const specKey = spec ? JSON.stringify(spec) : null;

  useEffect(() => {
    if (!specKey) return;
    const off = subscribeChannel(
      JSON.parse(specKey) as ChannelSpec,
      (payload) => {
        const env = payload as Envelope;
        if (env?.type === "data") {
          setDegraded(false);
          handler.current(env.data as T);
        } else if (env?.type === "status") {
          setDegraded(Boolean(env.degraded));
        }
      },
      setConnected,
    );
    return () => {
      off();
      setConnected(false);
      setDegraded(false);
    };
  }, [specKey]);

  return { degraded, connected };
}

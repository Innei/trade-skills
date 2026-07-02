import { useEffect, useRef, useState } from "react";

interface Envelope {
  type: "data" | "status";
  data?: unknown;
  degraded?: boolean;
}

export interface SSEState {
  degraded: boolean;
  connected: boolean;
}

export function useSSE<T>(url: string | null, onData: (data: T) => void): SSEState {
  const [degraded, setDegraded] = useState(false);
  const [connected, setConnected] = useState(false);
  const handler = useRef(onData);
  handler.current = onData;

  useEffect(() => {
    if (!url) return;
    const es = new EventSource(url);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => {
      let env: Envelope;
      try {
        env = JSON.parse(e.data) as Envelope;
      } catch {
        return;
      }
      if (env.type === "data") {
        setDegraded(false);
        handler.current(env.data as T);
      } else if (env.type === "status") {
        setDegraded(Boolean(env.degraded));
      }
    };
    return () => {
      es.close();
      setConnected(false);
      setDegraded(false);
    };
  }, [url]);

  return { degraded, connected };
}

import { useCallback, useEffect, useState } from "react";
import { errorMessage, isAbortError } from "../../api";

export interface NoteResponse {
  markdown: string | null;
  mtime?: string;
}

export function useNote(symbol: string) {
  const [note, setNote] = useState<NoteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setError(null);

    fetch(`/api/symbols/${encodeURIComponent(symbol)}/note`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as NoteResponse;
      })
      .then((data) => {
        if (active) setNote(data);
      })
      .catch((err: unknown) => {
        if (!active || isAbortError(err)) return;
        setError(errorMessage(err));
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [symbol, version]);

  return { note, error, reload };
}

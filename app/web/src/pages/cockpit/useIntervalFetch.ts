import { useQuery, usePollingQuery } from "../../apiHooks";

interface IntervalFetchState<T> {
  data: T | null;
  error: string | null;
}

export function useIntervalFetch<T>(url: string | null, ms: number | null): IntervalFetchState<T> {
  const oneShot = useQuery<T>(ms === null ? url : null);
  const polling = usePollingQuery<T>(ms === null ? null : url, ms ?? 0);
  return ms === null ? { data: oneShot.data, error: oneShot.error } : { data: polling.data, error: polling.error };
}

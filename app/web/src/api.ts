import type { ApiResult } from "../../shared/types";

export async function api<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const json = (await res.json()) as ApiResult<T>;
  if (!json.ok) throw new Error(json.hint ? `${json.error} (${json.hint})` : json.error);
  return json.data;
}

import type { IndustryPanorama } from '@kansoku/shared/types';
import { getProvider } from '../marketdata/registry.js';

const TTL_MS = 10 * 60_000;

let cache: IndustryPanorama | null = null;

export function resetIndustryPanoramaForTests(): void {
  cache = null;
}

export async function getIndustryPanorama(): Promise<IndustryPanorama> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  const provider = getProvider();
  const rows = provider.getIndustryRank ? await provider.getIndustryRank('US') : [];
  const items = rows
    .filter((r) => r.chg != null)
    .sort((a, b) => (b.chg ?? 0) - (a.chg ?? 0));
  const value: IndustryPanorama = { at: Date.now(), items };
  if (items.length) cache = value;
  return value;
}

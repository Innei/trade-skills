import type { HomeEventItem, HomeEvents } from '@kansoku/shared/types';
import { nextEarnings } from '../marketdata/events.js';
import { getProvider } from '../marketdata/registry.js';
import { easternDate } from '../marketdata/session.js';
import { getWatchedMarketsOrDefault } from '../marketdata/watchedMarketsStore.js';
import { getWatchSymbols } from './homeExtras.js';

const EVENTS_TTL_MS = 5 * 60_000;
const EARNINGS_WINDOW_DAYS = 14;
const MACRO_WINDOW_DAYS = 7;
const MACRO_MIN_STAR = 3;
const EARNINGS_CONCURRENCY = 3;

let eventsCache: { at: number; date: string; value: HomeEvents } | null = null;

export function resetHomeEventsForTests(): void {
  eventsCache = null;
}

async function ownedSymbols(): Promise<Set<string>> {
  try {
    const positions = (await getProvider().getPositions?.()) ?? [];
    return new Set(positions.map((p) => p.symbol));
  } catch {
    return new Set();
  }
}

async function earningsItems(
  symbols: string[],
  owned: Set<string>,
  now: Date,
): Promise<HomeEventItem[]> {
  const cutoff = easternDate(new Date(now.getTime() + EARNINGS_WINDOW_DAYS * 86_400_000));
  const items: HomeEventItem[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(EARNINGS_CONCURRENCY, symbols.length) }, async () => {
      while (next < symbols.length) {
        const symbol = symbols[next++];
        const entry = await nextEarnings(symbol, now);
        if (!entry || entry.date > cutoff) continue;
        items.push({
          date: entry.date,
          ts: null,
          kind: 'earnings',
          symbol,
          title: entry.title,
          estimate: null,
          previous: null,
          actual: null,
          owned: owned.has(symbol),
        });
      }
    }),
  );
  return items;
}

async function macroItems(now: Date): Promise<HomeEventItem[]> {
  const provider = getProvider();
  if (!provider.getMacroCalendar) return [];
  const start = easternDate(now);
  const end = easternDate(new Date(now.getTime() + MACRO_WINDOW_DAYS * 86_400_000));
  const items: HomeEventItem[] = [];
  for (const market of getWatchedMarketsOrDefault()) {
    try {
      const result = await provider.getMacroCalendar(market, start, end, MACRO_MIN_STAR);
      if (!result.supported) continue;
      for (const item of result.items) {
        items.push({
          date: easternDate(new Date(item.ts)),
          ts: item.ts,
          kind: 'macro',
          symbol: null,
          title: item.title,
          estimate: item.estimate,
          previous: item.previous,
          actual: item.actual ?? null,
          owned: false,
        });
      }
    } catch {
      continue;
    }
  }
  return items;
}

function sortKey(item: HomeEventItem): string {
  return `${item.date}|${item.ts ?? ''}|${item.kind}|${item.symbol ?? ''}`;
}

export async function buildHomeEvents(now = new Date()): Promise<HomeEvents> {
  const date = easternDate(now);
  if (eventsCache && eventsCache.date === date && Date.now() - eventsCache.at < EVENTS_TTL_MS) {
    return eventsCache.value;
  }
  const [symbols, owned] = await Promise.all([
    getWatchSymbols().catch(() => [] as string[]),
    ownedSymbols(),
  ]);
  const [earnings, macro] = await Promise.all([
    earningsItems(symbols, owned, now),
    macroItems(now),
  ]);
  const items = [...earnings, ...macro].sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1));
  const value: HomeEvents = { date, items };
  eventsCache = { at: Date.now(), date, value };
  return value;
}

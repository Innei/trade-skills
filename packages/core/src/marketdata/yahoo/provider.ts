import type { NewsItem, RawBar } from '@kansoku/shared/types';
import { ClientError } from '../../platform/errors.js';
import { getYahooClient, type YahooClient } from './client.js';
import { toYahooSymbol } from './symbolMap.js';
import type { EarningsCalendarEntry, MarketDataProvider, RawQuote } from '../types.js';

const CHART_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const QUOTE_BASE = 'https://query1.finance.yahoo.com/v7/finance/quote';
const SEARCH_BASE = 'https://query1.finance.yahoo.com/v1/finance/search';
const QUOTE_SUMMARY_BASE = 'https://query1.finance.yahoo.com/v10/finance/quoteSummary';

const YAHOO_INTERVALS: Record<string, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '60m', day: '1d', week: '1wk', month: '1mo',
};
const PERIOD_ALIASES: Record<string, string> = { '60m': '1h' };
const HISTORY_LIMIT_DAYS: Record<string, number> = { '1m': 7, '5m': 60, '15m': 60, '30m': 60, '60m': 730 };
const INTRADAY_MINUTES: Record<string, number> = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '60m': 60 };
const MINUTES_PER_TRADING_DAY = 390;

function toYahooInterval(period: string): string {
  const normalized = PERIOD_ALIASES[period] ?? period;
  if (normalized === 'year') {
    throw new ClientError(
      `getKline: unsupported period "${period}"`,
      'yahoo has no yearly interval; use "month" instead',
    );
  }
  const interval = YAHOO_INTERVALS[normalized];
  if (!interval) {
    throw new ClientError(
      `getKline: unsupported period "${period}"`,
      `supported periods: ${Object.keys(YAHOO_INTERVALS).join(', ')} (aliases: ${Object.keys(PERIOD_ALIASES).join(', ')})`,
    );
  }
  return interval;
}

function calendarSecondsFor(interval: string, count: number): number {
  const minutes = INTRADAY_MINUTES[interval];
  if (minutes) {
    const barsPerTradingDay = Math.max(1, Math.floor(MINUTES_PER_TRADING_DAY / minutes));
    const tradingDays = Math.ceil(count / barsPerTradingDay) + 5;
    return (Math.ceil((tradingDays * 7) / 5) + 10) * 86400;
  }
  if (interval === '1d') return (Math.ceil((count * 7) / 5) + 15) * 86400;
  if (interval === '1wk') return (count * 7 + 21) * 86400;
  return (count * 31 + 31) * 86400;
}

function clampPeriod1(interval: string, period1: number, period2: number): number {
  const limitDays = HISTORY_LIMIT_DAYS[interval];
  if (!limitDays) return period1;
  return Math.max(period1, period2 - limitDays * 86400);
}

interface YahooChartQuote {
  open?: Array<number | null>;
  high?: Array<number | null>;
  low?: Array<number | null>;
  close?: Array<number | null>;
  volume?: Array<number | null>;
}

interface YahooChartResponse {
  chart?: {
    error?: unknown;
    result?: Array<{ timestamp?: number[]; indicators?: { quote?: YahooChartQuote[] } }> | null;
  };
}

function parseChartBars(payload: YahooChartResponse, symbol: string, count: number): RawBar[] {
  const result = payload.chart?.result?.[0];
  if (payload.chart?.error || !result) {
    throw new ClientError(
      `yahoo getKline: malformed or empty chart response for ${symbol}`,
      'yahoo may not carry history for this symbol/period combination',
    );
  }
  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const bars: RawBar[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const close = quote.close?.[i];
    if (open == null || high == null || low == null || close == null) continue;
    bars.push({
      time: new Date(timestamps[i] * 1000).toISOString(),
      open,
      high,
      low,
      close,
      volume: quote.volume?.[i] ?? 0,
    });
  }
  return bars.slice(-count);
}

interface YahooQuoteRow {
  symbol?: string;
  regularMarketPrice?: number;
  regularMarketPreviousClose?: number;
  regularMarketChangePercent?: number;
  marketCap?: number;
  longName?: string;
  shortName?: string;
  preMarketPrice?: number;
  preMarketTime?: number;
  postMarketPrice?: number;
  postMarketTime?: number;
}

interface QuoteRowEntry {
  canonical: string;
  row: YahooQuoteRow;
}

async function fetchQuoteRows(client: YahooClient, symbols: string[]): Promise<QuoteRowEntry[]> {
  const yahooToCanonical = new Map<string, string>();
  for (const canonical of symbols) {
    try {
      const yahooSymbol = toYahooSymbol(canonical);
      if (!yahooToCanonical.has(yahooSymbol)) yahooToCanonical.set(yahooSymbol, canonical);
    } catch {
      continue;
    }
  }
  if (!yahooToCanonical.size) return [];
  const url = `${QUOTE_BASE}?symbols=${encodeURIComponent([...yahooToCanonical.keys()].join(','))}`;
  const payload = (await client.getJson(url, { crumb: true })) as {
    quoteResponse?: { result?: YahooQuoteRow[] };
  };
  const entries: QuoteRowEntry[] = [];
  for (const row of payload.quoteResponse?.result ?? []) {
    const canonical = row.symbol ? yahooToCanonical.get(row.symbol) : undefined;
    if (canonical) entries.push({ canonical, row });
  }
  return entries;
}

function changePercentage(row: YahooQuoteRow): string {
  if (typeof row.regularMarketChangePercent === 'number') {
    return row.regularMarketChangePercent.toFixed(3);
  }
  const last = row.regularMarketPrice;
  const prev = row.regularMarketPreviousClose;
  if (!prev || !Number.isFinite(last ?? NaN) || !Number.isFinite(prev)) return '0';
  return (((last as number) / prev - 1) * 100).toFixed(3);
}

function toRawQuote(canonical: string, row: YahooQuoteRow): RawQuote {
  const quote: RawQuote = {
    symbol: canonical,
    last: String(row.regularMarketPrice ?? 0),
    prev_close: String(row.regularMarketPreviousClose ?? 0),
    change_percentage: changePercentage(row),
  };
  if (typeof row.preMarketPrice === 'number') {
    quote.pre_market = {
      last: String(row.preMarketPrice),
      prev_close: String(row.regularMarketPreviousClose ?? row.regularMarketPrice ?? 0),
      ...(typeof row.preMarketTime === 'number'
        ? { timestamp: new Date(row.preMarketTime * 1000).toISOString() }
        : {}),
    };
  }
  if (typeof row.postMarketPrice === 'number') {
    quote.post_market = {
      last: String(row.postMarketPrice),
      prev_close: String(row.regularMarketPrice ?? row.regularMarketPreviousClose ?? 0),
      ...(typeof row.postMarketTime === 'number'
        ? { timestamp: new Date(row.postMarketTime * 1000).toISOString() }
        : {}),
    };
  }
  return quote;
}

interface YahooSearchResponse {
  news?: Array<{ uuid?: string; title?: string; link?: string; providerPublishTime?: number }>;
}

interface YahooQuoteSummaryResponse {
  quoteSummary?: {
    result?: Array<{
      calendarEvents?: {
        earnings?: { earningsDate?: Array<{ raw?: number }>; isEarningsDateEstimate?: boolean };
      };
    }>;
  };
}

export function createYahooProvider(client: YahooClient): MarketDataProvider {
  return {
    name: 'yahoo',
    realtime: false,
    capabilities: new Set(['earnings-calendar', 'market-cap']),

    async getKline(symbol, period, count, session): Promise<RawBar[]> {
      const interval = toYahooInterval(period);
      const yahooSymbol = toYahooSymbol(symbol);
      const period2 = Math.floor(Date.now() / 1000);
      const rawPeriod1 = period2 - calendarSecondsFor(interval, count);
      const period1 = clampPeriod1(interval, rawPeriod1, period2);
      const includePrePost = session === 'all';
      const url = `${CHART_BASE}/${encodeURIComponent(yahooSymbol)}?period1=${period1}&period2=${period2}&interval=${interval}&includePrePost=${includePrePost}`;
      const payload = (await client.getJson(url)) as YahooChartResponse;
      return parseChartBars(payload, symbol, count);
    },

    async getQuotes(symbols): Promise<RawQuote[]> {
      if (!symbols.length) return [];
      const entries = await fetchQuoteRows(client, symbols);
      return entries.map(({ canonical, row }) => toRawQuote(canonical, row));
    },

    async getSecurityName(symbol): Promise<string | null> {
      try {
        const entries = await fetchQuoteRows(client, [symbol]);
        const row = entries[0]?.row;
        const name = row?.longName ?? row?.shortName;
        return name || null;
      } catch {
        return null;
      }
    },

    async getNews(symbol, limit = 10): Promise<NewsItem[]> {
      try {
        const yahooSymbol = toYahooSymbol(symbol);
        const url = `${SEARCH_BASE}?q=${encodeURIComponent(yahooSymbol)}&newsCount=${limit}&quotesCount=0`;
        const payload = (await client.getJson(url)) as YahooSearchResponse;
        const rows = payload.news ?? [];
        const items: NewsItem[] = [];
        for (const row of rows.slice(0, limit)) {
          if (!row.uuid || !row.title || !row.link || typeof row.providerPublishTime !== 'number') continue;
          items.push({
            id: row.uuid,
            title: row.title,
            published_at: new Date(row.providerPublishTime * 1000).toISOString(),
            url: row.link,
          });
        }
        return items;
      } catch {
        return [];
      }
    },

    async getMarketCaps(symbols): Promise<Record<string, number>> {
      if (!symbols.length) return {};
      const entries = await fetchQuoteRows(client, symbols);
      const caps: Record<string, number> = {};
      for (const { canonical, row } of entries) {
        if (typeof row.marketCap === 'number' && Number.isFinite(row.marketCap)) {
          caps[canonical] = row.marketCap;
        }
      }
      return caps;
    },

    async getEarningsCalendar(symbol, fromDate): Promise<EarningsCalendarEntry | null> {
      try {
        const yahooSymbol = toYahooSymbol(symbol);
        const url = `${QUOTE_SUMMARY_BASE}/${encodeURIComponent(yahooSymbol)}?modules=calendarEvents`;
        const payload = (await client.getJson(url, { crumb: true })) as YahooQuoteSummaryResponse;
        const earnings = payload.quoteSummary?.result?.[0]?.calendarEvents?.earnings;
        const candidates = (earnings?.earningsDate ?? [])
          .map((d) => d.raw)
          .filter((raw): raw is number => typeof raw === 'number')
          .map((raw) => new Date(raw * 1000).toISOString().slice(0, 10))
          .filter((date) => date >= fromDate)
          .sort();
        if (!candidates.length) return null;
        return {
          date: candidates[0],
          title: earnings?.isEarningsDateEstimate === false ? 'earnings date' : 'earnings date (estimated)',
        };
      } catch {
        return null;
      }
    },
  };
}

export const yahooProvider: MarketDataProvider = createYahooProvider(getYahooClient());

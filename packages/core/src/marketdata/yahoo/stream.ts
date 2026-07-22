import type { QuoteCell, SessionKind } from '@kansoku/shared/types';
import { CandleAggregator } from '../candleAggregator.js';
import { normalizeQuote } from '../quoteNormalize.js';
import type {
  CandleBar,
  CandleListener,
  CandlePeriod,
  QuoteListener,
  QuoteStream,
} from '../quoteStream.js';
import { classifySession } from '../session.js';
import type { Market } from '../../symbols/symbol.utils.js';
import type { MarketDataProvider, RawQuote } from '../types.js';
import { yahooProvider } from './provider.js';

const REGULAR_CADENCE_MS = 5_000;
const EXTENDED_CADENCE_MS = 30_000;
const IDLE_RECHECK_MS = 60_000;
const BACKOFF_CAP_MS = 300_000;

const CANDLE_PERIOD_MS: Record<CandlePeriod, number> = {
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '60m': 60 * 60_000,
};

function candleKey(symbol: string, period: CandlePeriod): string {
  return `${symbol}\0${period}`;
}

export interface YahooQuoteStreamDeps {
  provider?: Pick<MarketDataProvider, 'getQuotes'>;
  classify?: (ts: number, market?: Market) => SessionKind;
  now?: () => number;
}

export class YahooQuoteStream implements QuoteStream {
  private readonly provider: Pick<MarketDataProvider, 'getQuotes'>;
  private readonly classify: (ts: number, market?: Market) => SessionKind;
  private readonly now: () => number;
  private readonly aggregator: CandleAggregator;

  private refs = new Map<string, number>();
  private snapshots = new Map<string, QuoteCell>();
  private listeners = new Set<QuoteListener>();
  private candleRefs = new Map<string, number>();
  private candleListeners = new Map<string, Set<CandleListener>>();
  private candleSeeded = new Set<string>();

  private timer: ReturnType<typeof setTimeout> | null = null;
  private pollPromise: Promise<void> | null = null;
  private consecutiveFailures = 0;
  private tradeSequence = 0;

  constructor(deps: YahooQuoteStreamDeps = {}) {
    this.provider = deps.provider ?? yahooProvider;
    this.classify = deps.classify ?? classifySession;
    this.now = deps.now ?? Date.now;
    this.aggregator = new CandleAggregator((bar) => this.dispatchCandle(bar));
  }

  private hasQuoteRef(symbol: string): boolean {
    return (this.refs.get(symbol) ?? 0) > 0;
  }

  private hasCandleSubscription(symbol: string): boolean {
    for (const key of this.candleRefs.keys()) {
      if (key.startsWith(`${symbol}\0`)) return true;
    }
    return false;
  }

  private isActive(symbol: string): boolean {
    return this.hasQuoteRef(symbol) || this.hasCandleSubscription(symbol);
  }

  private symbolsToPoll(): string[] {
    const symbols = new Set(this.refs.keys());
    for (const key of this.candleRefs.keys()) symbols.add(key.split('\0')[0]);
    return [...symbols];
  }

  private periodsFor(symbol: string): CandlePeriod[] {
    const periods: CandlePeriod[] = [];
    for (const key of this.candleRefs.keys()) {
      const [sym, period] = key.split('\0') as [string, CandlePeriod];
      if (sym === symbol) periods.push(period);
    }
    return periods;
  }

  private scheduleNext(delayMs: number): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.runPoll();
    }, delayMs);
  }

  private runPoll(): Promise<void> {
    if (this.pollPromise) return this.pollPromise;
    this.pollPromise = this.doPoll().finally(() => {
      this.pollPromise = null;
    });
    return this.pollPromise;
  }

  private pokeNow(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    return this.runPoll();
  }

  private async doPoll(): Promise<void> {
    const symbols = this.symbolsToPoll();
    if (!symbols.length) {
      this.scheduleNext(IDLE_RECHECK_MS);
      return;
    }
    const session = this.classify(Math.floor(this.now() / 1000));
    if (session !== 'regular' && session !== 'pre' && session !== 'post') {
      this.scheduleNext(IDLE_RECHECK_MS);
      return;
    }
    const cadence = session === 'regular' ? REGULAR_CADENCE_MS : EXTENDED_CADENCE_MS;
    try {
      const rows = await this.provider.getQuotes(symbols);
      this.consecutiveFailures = 0;
      this.applyRows(rows);
    } catch {
      this.consecutiveFailures += 1;
    }
    if (!this.symbolsToPoll().length) {
      this.scheduleNext(IDLE_RECHECK_MS);
      return;
    }
    if (this.consecutiveFailures === 0) {
      this.scheduleNext(cadence);
    } else {
      this.scheduleNext(Math.min(cadence * 2 ** this.consecutiveFailures, BACKOFF_CAP_MS));
    }
  }

  private applyRows(rows: RawQuote[]): void {
    const nowMs = this.now();
    for (const row of rows) {
      const cell = normalizeQuote(row, nowMs);
      const prev = this.snapshots.get(cell.symbol);
      this.snapshots.set(cell.symbol, cell);
      if (
        !prev ||
        prev.last !== cell.last ||
        prev.pct !== cell.pct ||
        prev.session !== cell.session
      ) {
        for (const listener of this.listeners) listener(cell);
      }
      this.feedCandles(cell.symbol, cell.last, nowMs);
    }
  }

  private feedCandles(symbol: string, price: number, nowMs: number): void {
    for (const period of this.periodsFor(symbol)) {
      const key = candleKey(symbol, period);
      if (!this.candleSeeded.has(key)) {
        this.candleSeeded.add(key);
        const periodMs = CANDLE_PERIOD_MS[period];
        const alignedTs = Math.floor(nowMs / periodMs) * periodMs;
        this.aggregator.seed(symbol, period, {
          time: new Date(alignedTs).toISOString(),
          open: price,
          high: price,
          low: price,
          close: price,
          volume: 0,
        });
        continue;
      }
      this.aggregator.handleTrades({
        symbol,
        sequence: ++this.tradeSequence,
        trades: [
          { price, volume: 0, timestamp: Math.floor(nowMs / 1000), tradeSession: 0 },
        ],
      });
    }
  }

  private dispatchCandle(bar: CandleBar): void {
    for (const listener of this.candleListeners.get(candleKey(bar.symbol, bar.period)) ?? []) {
      listener(bar);
    }
  }

  async retain(symbols: string[]): Promise<void> {
    let becameActive = false;
    for (const symbol of symbols) {
      if (!this.isActive(symbol)) becameActive = true;
      this.refs.set(symbol, (this.refs.get(symbol) ?? 0) + 1);
    }
    if (becameActive) await this.pokeNow();
  }

  async release(symbols: string[]): Promise<void> {
    for (const symbol of symbols) {
      const count = (this.refs.get(symbol) ?? 0) - 1;
      if (count <= 0) {
        this.refs.delete(symbol);
        if (!this.hasCandleSubscription(symbol)) this.snapshots.delete(symbol);
      } else {
        this.refs.set(symbol, count);
      }
    }
  }

  subscribeCandlesticks(symbol: string, period: CandlePeriod, cb: CandleListener): () => void {
    const key = candleKey(symbol, period);
    const becameActive = !this.isActive(symbol);
    this.candleRefs.set(key, (this.candleRefs.get(key) ?? 0) + 1);
    const listeners = this.candleListeners.get(key) ?? new Set<CandleListener>();
    listeners.add(cb);
    this.candleListeners.set(key, listeners);
    if (becameActive) void this.pokeNow();

    let released = false;
    return () => {
      if (released) return;
      released = true;
      listeners.delete(cb);
      const next = (this.candleRefs.get(key) ?? 0) - 1;
      if (next <= 0) {
        this.candleRefs.delete(key);
        this.candleListeners.delete(key);
        this.candleSeeded.delete(key);
        this.aggregator.remove(symbol, period);
      } else {
        this.candleRefs.set(key, next);
      }
    };
  }

  onUpdate(listener: QuoteListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(symbol: string): QuoteCell | undefined {
    return this.snapshots.get(symbol);
  }

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

export function createYahooQuoteStream(deps: YahooQuoteStreamDeps = {}): YahooQuoteStream {
  return new YahooQuoteStream(deps);
}

let instance: YahooQuoteStream | null = null;

export function getYahooStream(): YahooQuoteStream {
  if (!instance) instance = createYahooQuoteStream();
  return instance;
}

export function resetYahooStream(): void {
  instance?.dispose();
  instance = null;
}

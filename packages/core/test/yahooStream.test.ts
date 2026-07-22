import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionKind } from '@kansoku/shared/types';
import type { RawQuote } from '../src/marketdata/types.js';
import {
  createYahooQuoteStream,
  getYahooStream,
  resetYahooStream,
} from '../src/marketdata/yahoo/stream.js';

function makeQuote(symbol: string, last: number, changePct = '0'): RawQuote {
  return { symbol, last: String(last), prev_close: '100', change_percentage: changePct };
}

function fixedClassify(kind: SessionKind) {
  return vi.fn().mockReturnValue(kind);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('YahooQuoteStream poll cadence', () => {
  it('polls immediately on first retain instead of waiting a full interval', async () => {
    const getQuotes = vi.fn().mockResolvedValue([makeQuote('AAA.US', 100)]);
    const classify = fixedClassify('regular');
    const stream = createYahooQuoteStream({ provider: { getQuotes }, classify, now: () => Date.now() });

    await stream.retain(['AAA.US']);

    expect(getQuotes).toHaveBeenCalledTimes(1);
    expect(getQuotes).toHaveBeenCalledWith(['AAA.US']);
    expect(stream.getSnapshot('AAA.US')?.last).toBe(100);
  });

  it('polls every 5s while the session is regular', async () => {
    const getQuotes = vi.fn().mockResolvedValue([makeQuote('AAA.US', 100)]);
    const classify = fixedClassify('regular');
    const stream = createYahooQuoteStream({ provider: { getQuotes }, classify, now: () => Date.now() });

    await stream.retain(['AAA.US']);
    expect(getQuotes).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(getQuotes).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(getQuotes).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(getQuotes).toHaveBeenCalledTimes(3);
  });

  it('polls every 30s while the session is pre or post', async () => {
    const getQuotes = vi.fn().mockResolvedValue([makeQuote('AAA.US', 100)]);
    const classify = fixedClassify('pre');
    const stream = createYahooQuoteStream({ provider: { getQuotes }, classify, now: () => Date.now() });

    await stream.retain(['AAA.US']);
    expect(getQuotes).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(29_999);
    expect(getQuotes).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(getQuotes).toHaveBeenCalledTimes(2);
  });

  it('does not fetch outside pre/regular/post and rechecks every 60s so a session change wakes it up', async () => {
    const getQuotes = vi.fn().mockResolvedValue([]);
    const classify = fixedClassify('overnight');
    const stream = createYahooQuoteStream({ provider: { getQuotes }, classify, now: () => Date.now() });

    await stream.retain(['AAA.US']);
    expect(getQuotes).not.toHaveBeenCalled();
    expect(classify).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(59_999);
    expect(classify).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(classify.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(getQuotes).not.toHaveBeenCalled();
  });
});

describe('YahooQuoteStream change detection', () => {
  it('emits onUpdate only for cells whose last/pct/session changed since the previous snapshot', async () => {
    const getQuotes = vi
      .fn()
      .mockResolvedValueOnce([makeQuote('AAA.US', 100, '0')])
      .mockResolvedValueOnce([makeQuote('AAA.US', 100, '0')])
      .mockResolvedValueOnce([makeQuote('AAA.US', 105, '5')]);
    const classify = fixedClassify('regular');
    const stream = createYahooQuoteStream({ provider: { getQuotes }, classify, now: () => Date.now() });
    const received: number[] = [];
    stream.onUpdate((cell) => received.push(cell.last));

    await stream.retain(['AAA.US']);
    expect(received).toEqual([100]);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(received).toEqual([100]);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(received).toEqual([100, 105]);
  });
});

describe('YahooQuoteStream refcounting', () => {
  it('keeps polling while any ref remains and stops fetching once the last ref is released', async () => {
    const getQuotes = vi.fn().mockResolvedValue([makeQuote('AAA.US', 100)]);
    const classify = fixedClassify('regular');
    const stream = createYahooQuoteStream({ provider: { getQuotes }, classify, now: () => Date.now() });

    await stream.retain(['AAA.US']);
    await stream.retain(['AAA.US']);
    expect(getQuotes).toHaveBeenCalledTimes(1);

    await stream.release(['AAA.US']);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(getQuotes).toHaveBeenCalledTimes(2);

    await stream.release(['AAA.US']);
    expect(stream.getSnapshot('AAA.US')).toBeUndefined();
    const callsBefore = getQuotes.mock.calls.length;

    await vi.advanceTimersByTimeAsync(120_000);
    expect(getQuotes.mock.calls.length).toBe(callsBefore);
  });
});

describe('YahooQuoteStream failure backoff', () => {
  it('doubles the delay on consecutive failures, resets to normal cadence on success, and keeps the loop alive', async () => {
    const getQuotes = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce([makeQuote('AAA.US', 100)])
      .mockResolvedValueOnce([makeQuote('AAA.US', 100)]);
    const classify = fixedClassify('regular');
    const stream = createYahooQuoteStream({ provider: { getQuotes }, classify, now: () => Date.now() });

    await stream.retain(['AAA.US']);
    expect(getQuotes).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(9_999);
    expect(getQuotes).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(getQuotes).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(19_999);
    expect(getQuotes).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(getQuotes).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(getQuotes).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(getQuotes).toHaveBeenCalledTimes(4);
  });

  it('caps the backoff delay at 300000ms and never throws an unhandled rejection', async () => {
    const getQuotes = vi.fn().mockRejectedValue(new Error('boom'));
    const classify = fixedClassify('regular');
    const stream = createYahooQuoteStream({ provider: { getQuotes }, classify, now: () => Date.now() });

    await stream.retain(['AAA.US']);
    for (let i = 0; i < 6; i++) {
      await vi.advanceTimersByTimeAsync(300_000);
    }
    const callsAfterManyFailures = getQuotes.mock.calls.length;
    expect(callsAfterManyFailures).toBeGreaterThan(1);

    await vi.advanceTimersByTimeAsync(300_000);
    expect(getQuotes.mock.calls.length).toBe(callsAfterManyFailures + 1);
  });
});

describe('YahooQuoteStream candlesticks', () => {
  it('aggregates polled quotes into a candle bar and stops after unsubscribe', async () => {
    const getQuotes = vi
      .fn()
      .mockResolvedValueOnce([makeQuote('AAA.US', 100)])
      .mockResolvedValueOnce([makeQuote('AAA.US', 101)])
      .mockResolvedValue([makeQuote('AAA.US', 999)]);
    const classify = fixedClassify('regular');
    const stream = createYahooQuoteStream({ provider: { getQuotes }, classify, now: () => Date.now() });

    const bars: number[] = [];
    const unsub = stream.subscribeCandlesticks('AAA.US', '5m', (bar) => bars.push(bar.close));

    await vi.advanceTimersByTimeAsync(0);
    expect(getQuotes).toHaveBeenCalledTimes(1);
    expect(bars).toEqual([]);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(getQuotes).toHaveBeenCalledTimes(2);
    expect(bars).toEqual([101]);

    unsub();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(bars).toEqual([101]);
  });
});

describe('YahooQuoteStream snapshot', () => {
  it('is undefined for an unknown symbol and holds the latest normalized cell after a poll', async () => {
    const getQuotes = vi.fn().mockResolvedValue([makeQuote('AAA.US', 123, '5')]);
    const classify = fixedClassify('regular');
    const stream = createYahooQuoteStream({ provider: { getQuotes }, classify, now: () => Date.now() });

    expect(stream.getSnapshot('AAA.US')).toBeUndefined();

    await stream.retain(['AAA.US']);

    const cell = stream.getSnapshot('AAA.US');
    expect(cell?.symbol).toBe('AAA.US');
    expect(cell?.last).toBe(123);
    expect(cell?.session).toBe('日盘');
  });
});

describe('getYahooStream/resetYahooStream singleton', () => {
  afterEach(() => {
    resetYahooStream();
  });

  it('returns the same instance until reset', () => {
    const a = getYahooStream();
    const b = getYahooStream();
    expect(a).toBe(b);

    resetYahooStream();
    const c = getYahooStream();
    expect(c).not.toBe(a);
  });
});

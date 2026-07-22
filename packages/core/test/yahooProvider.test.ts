import { describe, expect, it } from 'vitest';
import { ClientError } from '../src/platform/errors.js';
import { createYahooProvider } from '../src/marketdata/yahoo/provider.js';
import type { YahooClient } from '../src/marketdata/yahoo/client.js';

interface RecordedCall {
  url: string;
  crumb: boolean;
}

function fakeClient(handler: (url: string, crumb: boolean) => unknown): {
  client: YahooClient;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const client: YahooClient = {
    async getJson(url: string, opts?: { crumb?: boolean }) {
      const crumb = opts?.crumb === true;
      calls.push({ url, crumb });
      const result = handler(url, crumb);
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return { client, calls };
}

function chartPayload(rows: Array<{ ts: number; o: number | null; h: number | null; l: number | null; c: number | null; v: number | null }>) {
  return {
    chart: {
      error: null,
      result: [
        {
          timestamp: rows.map((r) => r.ts),
          indicators: {
            quote: [
              {
                open: rows.map((r) => r.o),
                high: rows.map((r) => r.h),
                low: rows.map((r) => r.l),
                close: rows.map((r) => r.c),
                volume: rows.map((r) => r.v),
              },
            ],
          },
        },
      ],
    },
  };
}

describe('createYahooProvider: getKline', () => {
  it('maps chart bars, skips null-OHLC rows, and keeps only the last `count` bars in ascending order', async () => {
    const payload = chartPayload([
      { ts: 1_000, o: 1, h: 2, l: 0.5, c: 1.5, v: 100 },
      { ts: 2_000, o: null, h: 2, l: 0.5, c: 1.5, v: 100 },
      { ts: 3_000, o: 2, h: 3, l: 1.5, c: 2.5, v: 200 },
      { ts: 4_000, o: 3, h: 4, l: 2.5, c: 3.5, v: 300 },
    ]);
    const { client } = fakeClient(() => payload);
    const provider = createYahooProvider(client);

    const bars = await provider.getKline('MU.US', 'day', 2);

    expect(bars).toEqual([
      { time: new Date(3_000 * 1000).toISOString(), open: 2, high: 3, low: 1.5, close: 2.5, volume: 200 },
      { time: new Date(4_000 * 1000).toISOString(), open: 3, high: 4, low: 2.5, close: 3.5, volume: 300 },
    ]);
  });

  it('requests the mapped yahoo interval for the symbol', async () => {
    const payload = chartPayload([{ ts: 1, o: 1, h: 1, l: 1, c: 1, v: 1 }]);
    const { client, calls } = fakeClient(() => payload);
    const provider = createYahooProvider(client);

    await provider.getKline('MU.US', '1h', 1);

    expect(calls[0].url).toContain('/v8/finance/chart/MU');
    expect(calls[0].url).toContain('interval=60m');
  });

  it('accepts the 60m alias like longbridge and maps it to the 1h->60m interval', async () => {
    const payload = chartPayload([{ ts: 1, o: 1, h: 1, l: 1, c: 1, v: 1 }]);
    const { client, calls } = fakeClient(() => payload);
    const provider = createYahooProvider(client);

    await provider.getKline('MU.US', '60m', 1);

    expect(calls[0].url).toContain('interval=60m');
  });

  it('sets includePrePost=true only when session is "all"', async () => {
    const payload = chartPayload([{ ts: 1, o: 1, h: 1, l: 1, c: 1, v: 1 }]);
    const { client, calls } = fakeClient(() => payload);
    const provider = createYahooProvider(client);

    await provider.getKline('MU.US', 'day', 1, 'all');
    await provider.getKline('MU.US', 'day', 1, 'intraday');
    await provider.getKline('MU.US', 'day', 1);

    expect(calls[0].url).toContain('includePrePost=true');
    expect(calls[1].url).toContain('includePrePost=false');
    expect(calls[2].url).toContain('includePrePost=false');
  });

  it('clamps period1 for 1m history to the 7-day limit regardless of the requested count', async () => {
    const payload = chartPayload([{ ts: 1, o: 1, h: 1, l: 1, c: 1, v: 1 }]);
    const { client, calls } = fakeClient(() => payload);
    const provider = createYahooProvider(client);

    await provider.getKline('MU.US', '1m', 100_000);

    const url = new URL(calls[0].url);
    const period1 = Number(url.searchParams.get('period1'));
    const period2 = Number(url.searchParams.get('period2'));
    expect(period2 - period1).toBe(7 * 86400);
  });

  it('clamps period1 for 60m history to the 730-day limit', async () => {
    const payload = chartPayload([{ ts: 1, o: 1, h: 1, l: 1, c: 1, v: 1 }]);
    const { client, calls } = fakeClient(() => payload);
    const provider = createYahooProvider(client);

    await provider.getKline('MU.US', '1h', 100_000);

    const url = new URL(calls[0].url);
    const period1 = Number(url.searchParams.get('period1'));
    const period2 = Number(url.searchParams.get('period2'));
    expect(period2 - period1).toBe(730 * 86400);
  });

  it('does not clamp day-period history', async () => {
    const payload = chartPayload([{ ts: 1, o: 1, h: 1, l: 1, c: 1, v: 1 }]);
    const { client, calls } = fakeClient(() => payload);
    const provider = createYahooProvider(client);

    await provider.getKline('MU.US', 'day', 1000);

    const url = new URL(calls[0].url);
    const period1 = Number(url.searchParams.get('period1'));
    const period2 = Number(url.searchParams.get('period2'));
    expect(period2 - period1).toBeGreaterThan(730 * 86400);
  });

  it('rejects the year period since yahoo has no yearly interval', async () => {
    const { client } = fakeClient(() => ({}));
    const provider = createYahooProvider(client);

    try {
      await provider.getKline('MU.US', 'year', 10);
      throw new Error('expected getKline to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ClientError);
      expect((error as ClientError).hint).toMatch(/month/);
    }
  });

  it('rejects an unsupported period', async () => {
    const { client } = fakeClient(() => ({}));
    const provider = createYahooProvider(client);

    await expect(provider.getKline('MU.US', '3m', 10)).rejects.toThrow(ClientError);
  });

  it('throws ClientError naming the symbol when chart.error is set', async () => {
    const { client } = fakeClient(() => ({ chart: { error: { code: 'Not Found' }, result: null } }));
    const provider = createYahooProvider(client);

    await expect(provider.getKline('BADSYM.US', 'day', 10)).rejects.toThrow(/BADSYM\.US/);
  });

  it('throws ClientError naming the symbol when the result array is empty', async () => {
    const { client } = fakeClient(() => ({ chart: { error: null, result: [] } }));
    const provider = createYahooProvider(client);

    await expect(provider.getKline('BADSYM.US', 'day', 10)).rejects.toThrow(ClientError);
  });
});

describe('createYahooProvider: getQuotes', () => {
  it('serializes numeric fields as strings and keys results by the original requested symbol', async () => {
    const { client, calls } = fakeClient(() => ({
      quoteResponse: {
        result: [
          {
            symbol: 'MU',
            regularMarketPrice: 110,
            regularMarketPreviousClose: 100,
            regularMarketChangePercent: 10,
          },
        ],
      },
    }));
    const provider = createYahooProvider(client);

    const quotes = await provider.getQuotes(['mu']);

    expect(quotes).toEqual([
      { symbol: 'mu', last: '110', prev_close: '100', change_percentage: '10.000' },
    ]);
    expect(calls[0].crumb).toBe(true);
    expect(calls[0].url).toContain('symbols=MU');
  });

  it('includes pre_market/post_market only when yahoo returns the corresponding fields, and omits overnight', async () => {
    const { client } = fakeClient(() => ({
      quoteResponse: {
        result: [
          {
            symbol: 'MU',
            regularMarketPrice: 110,
            regularMarketPreviousClose: 100,
            regularMarketChangePercent: 10,
            preMarketPrice: 108,
            preMarketTime: 2_000,
          },
        ],
      },
    }));
    const provider = createYahooProvider(client);

    const [quote] = await provider.getQuotes(['MU.US']);

    expect(quote.pre_market).toEqual({
      last: '108',
      prev_close: '100',
      timestamp: new Date(2_000 * 1000).toISOString(),
    });
    expect(quote.post_market).toBeUndefined();
    expect(quote.overnight).toBeUndefined();
  });

  it('omits pre_market and post_market when yahoo does not return them', async () => {
    const { client } = fakeClient(() => ({
      quoteResponse: {
        result: [{ symbol: 'MU', regularMarketPrice: 110, regularMarketPreviousClose: 100 }],
      },
    }));
    const provider = createYahooProvider(client);

    const [quote] = await provider.getQuotes(['MU.US']);

    expect(quote.pre_market).toBeUndefined();
    expect(quote.post_market).toBeUndefined();
  });

  it('skips symbols whose mapping is not US-supported without failing the batch', async () => {
    const { client } = fakeClient(() => ({
      quoteResponse: {
        result: [{ symbol: 'MU', regularMarketPrice: 110, regularMarketPreviousClose: 100 }],
      },
    }));
    const provider = createYahooProvider(client);

    const quotes = await provider.getQuotes(['MU.US', '700.HK']);

    expect(quotes).toHaveLength(1);
    expect(quotes[0].symbol).toBe('MU.US');
  });

  it('returns an empty array for an empty symbol list without calling the client', async () => {
    const { client, calls } = fakeClient(() => {
      throw new Error('should not be called');
    });
    const provider = createYahooProvider(client);

    await expect(provider.getQuotes([])).resolves.toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe('createYahooProvider: getMarketCaps', () => {
  it('maps marketCap keyed by the original requested symbol, omitting missing values', async () => {
    const { client } = fakeClient(() => ({
      quoteResponse: {
        result: [
          { symbol: 'MU', marketCap: 123_000 },
          { symbol: 'AAPL', regularMarketPrice: 200 },
        ],
      },
    }));
    const provider = createYahooProvider(client);

    const caps = await provider.getMarketCaps!(['mu', 'aapl']);

    expect(caps).toEqual({ mu: 123_000 });
  });
});

describe('createYahooProvider: getSecurityName', () => {
  it('prefers longName over shortName', async () => {
    const { client } = fakeClient(() => ({
      quoteResponse: { result: [{ symbol: 'MU', longName: 'Micron Technology, Inc.', shortName: 'Micron' }] },
    }));
    const provider = createYahooProvider(client);

    await expect(provider.getSecurityName!('MU.US')).resolves.toBe('Micron Technology, Inc.');
  });

  it('falls back to shortName when longName is absent', async () => {
    const { client } = fakeClient(() => ({
      quoteResponse: { result: [{ symbol: 'MU', shortName: 'Micron' }] },
    }));
    const provider = createYahooProvider(client);

    await expect(provider.getSecurityName!('MU.US')).resolves.toBe('Micron');
  });

  it('returns null on any failure', async () => {
    const { client } = fakeClient(() => new Error('boom'));
    const provider = createYahooProvider(client);

    await expect(provider.getSecurityName!('MU.US')).resolves.toBeNull();
  });

  it('returns null for a non-US symbol', async () => {
    const { client } = fakeClient(() => {
      throw new Error('should not be called');
    });
    const provider = createYahooProvider(client);

    await expect(provider.getSecurityName!('700.HK')).resolves.toBeNull();
  });
});

describe('createYahooProvider: getNews', () => {
  it('maps news rows to NewsItem with ISO published_at', async () => {
    const { client, calls } = fakeClient(() => ({
      news: [
        { uuid: 'abc-1', title: 'Micron beats estimates', link: 'https://example.com/a', providerPublishTime: 5_000 },
      ],
    }));
    const provider = createYahooProvider(client);

    const news = await provider.getNews('MU.US', 5);

    expect(news).toEqual([
      {
        id: 'abc-1',
        title: 'Micron beats estimates',
        published_at: new Date(5_000 * 1000).toISOString(),
        url: 'https://example.com/a',
      },
    ]);
    expect(calls[0].url).toContain('newsCount=5');
    expect(calls[0].url).toContain('quotesCount=0');
  });

  it('returns [] when the client throws', async () => {
    const { client } = fakeClient(() => new Error('boom'));
    const provider = createYahooProvider(client);

    await expect(provider.getNews('MU.US')).resolves.toEqual([]);
  });

  it('returns [] when the payload is malformed (no news array)', async () => {
    const { client } = fakeClient(() => ({}));
    const provider = createYahooProvider(client);

    await expect(provider.getNews('MU.US')).resolves.toEqual([]);
  });
});

describe('createYahooProvider: getEarningsCalendar', () => {
  it('picks the earliest earningsDate on/after fromDate', async () => {
    const { client, calls } = fakeClient(() => ({
      quoteSummary: {
        result: [
          {
            calendarEvents: {
              earnings: {
                earningsDate: [{ raw: Date.parse('2026-08-10T00:00:00Z') / 1000 }, { raw: Date.parse('2026-08-05T00:00:00Z') / 1000 }],
                isEarningsDateEstimate: true,
              },
            },
          },
        ],
      },
    }));
    const provider = createYahooProvider(client);

    const entry = await provider.getEarningsCalendar!('MU.US', '2026-07-22');

    expect(entry).toEqual({ date: '2026-08-05', title: 'earnings date (estimated)' });
    expect(calls[0].crumb).toBe(true);
  });

  it('returns null when no earningsDate is on/after fromDate', async () => {
    const { client } = fakeClient(() => ({
      quoteSummary: {
        result: [
          {
            calendarEvents: {
              earnings: { earningsDate: [{ raw: Date.parse('2026-01-01T00:00:00Z') / 1000 }] },
            },
          },
        ],
      },
    }));
    const provider = createYahooProvider(client);

    await expect(provider.getEarningsCalendar!('MU.US', '2026-07-22')).resolves.toBeNull();
  });

  it('returns null on any failure', async () => {
    const { client } = fakeClient(() => new Error('boom'));
    const provider = createYahooProvider(client);

    await expect(provider.getEarningsCalendar!('MU.US', '2026-07-22')).resolves.toBeNull();
  });
});

describe('createYahooProvider: contract', () => {
  it('declares name, realtime, and capabilities', () => {
    const { client } = fakeClient(() => ({}));
    const provider = createYahooProvider(client);

    expect(provider.name).toBe('yahoo');
    expect(provider.realtime).toBe(false);
    expect([...provider.capabilities]).toEqual(['earnings-calendar', 'market-cap']);
  });
});

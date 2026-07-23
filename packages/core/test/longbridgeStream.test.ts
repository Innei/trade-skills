import { describe, expect, it, vi } from 'vitest';
import type { ProtocolQuote } from '../src/marketdata/longbridgeProtocol.js';
import { LongbridgeStream } from '../src/marketdata/longbridgeStream.js';
import type { LongbridgeQuoteSocket } from '../src/marketdata/longbridgeSocket.js';

describe('LongbridgeStream quote timestamps', () => {
  it('advances the quote as-of time with each broker push', () => {
    let emitQuote: (quote: ProtocolQuote) => void = (_quote) => {
      throw new Error('quote listener was not registered');
    };
    const socket = {
      onQuote(listener: (quote: ProtocolQuote) => void) {
        emitQuote = listener;
        return () => {};
      },
      onTrade() {
        return () => {};
      },
    } as unknown as LongbridgeQuoteSocket;
    const stream = new LongbridgeStream({ socket });

    const push = (timestamp: number, lastDone: number) =>
      emitQuote({
        symbol: 'NOW.US',
        sequence: timestamp,
        lastDone,
        timestamp,
        volume: 1,
        currentVolume: 1,
        turnover: lastDone,
        currentTurnover: lastDone,
        tradeSession: 0,
        tag: 0,
      });

    push(1_784_000_000, 111.2);
    expect(stream.getSnapshot('NOW.US')).toMatchObject({
      last: 111.2,
      asOf: new Date(1_784_000_000_000).toISOString(),
    });

    push(1_784_000_007, 111.35);
    expect(stream.getSnapshot('NOW.US')).toMatchObject({
      last: 111.35,
      asOf: new Date(1_784_000_007_000).toISOString(),
    });
  });

  it('uses the chart snapshot as the candle seed instead of fetching it again', async () => {
    let emitQuote: (quote: ProtocolQuote) => void = () => {};
    const subscribe = vi.fn().mockResolvedValue(undefined);
    const socket = {
      onQuote(listener: (quote: ProtocolQuote) => void) {
        emitQuote = listener;
        return () => {};
      },
      onTrade() {
        return () => {};
      },
      subscribe,
    } as unknown as LongbridgeQuoteSocket;
    const stream = new LongbridgeStream({ socket });
    const onCandle = vi.fn();

    stream.subscribeCandlesticks('NOW.US', '5m', onCandle, {
      time: new Date(1_000_000).toISOString(),
      open: 10,
      high: 11,
      low: 9,
      close: 10,
      volume: 100,
    });
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledWith(['NOW.US'], [1, 4]));

    emitQuote({
      symbol: 'NOW.US',
      sequence: 1,
      lastDone: 10.5,
      timestamp: 1_001,
      volume: 101,
      currentVolume: 1,
      turnover: 1_060.5,
      currentTurnover: 10.5,
      tradeSession: 0,
      tag: 0,
    });
    expect(onCandle).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: 'NOW.US', period: '5m', close: 10.5 }),
    );
  });
});

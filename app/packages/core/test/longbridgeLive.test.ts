import { expect, it } from "vitest";
import { LongbridgeQuoteSocket } from "../src/services/marketdata/longbridgeSocket.js";

it.runIf(process.env.LONGBRIDGE_LIVE === "1")(
  "authenticates and subscribes through the real Longbridge quote gateway",
  async () => {
    const socket = new LongbridgeQuoteSocket();
    await expect(socket.subscribe(["AAPL.US"], [1])).resolves.toBeUndefined();
    socket.close();
  },
  15_000,
);

it.runIf(process.env.LONGBRIDGE_LIVE === "1")(
  "answers quote and candlestick queries through the real Longbridge quote gateway",
  async () => {
    const socket = new LongbridgeQuoteSocket();

    const quotes = await socket.queryQuotes(["SMH.US", "NVDA.US"]);
    expect(quotes.map((q) => q.symbol).sort()).toEqual(["NVDA.US", "SMH.US"]);
    for (const quote of quotes) {
      expect(Number(quote.last)).toBeGreaterThan(0);
      expect(Number(quote.prev_close)).toBeGreaterThan(0);
    }

    const bars = await socket.queryCandlesticks("SMH.US", "5m", 3, "all");
    expect(bars.length).toBeGreaterThan(0);
    for (const bar of bars) {
      expect(Number(bar.close)).toBeGreaterThan(0);
      expect(Number.isNaN(Date.parse(bar.time))).toBe(false);
    }

    const days = await socket.queryCandlesticks("SMH.US", "day", 2, "intraday");
    expect(days.length).toBe(2);
    socket.close();
  },
  20_000,
);


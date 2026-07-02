import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { subscribeChart } from "../realtime/charts.js";
import { subscribeQuotes } from "../realtime/quotes.js";

const KEEPALIVE_MS = 15_000;

type Attach = (push: (envelope: string) => void) => (() => void) | Promise<() => void>;

function sseEndpoint(attach: Attach) {
  return (c: Parameters<typeof streamSSE>[0]) =>
    streamSSE(c, async (stream) => {
      const queue: string[] = [];
      let aborted = false;
      let notify: (() => void) | null = null;
      const push = (envelope: string) => {
        queue.push(envelope);
        notify?.();
      };
      const unsub = await attach(push);
      stream.onAbort(() => {
        aborted = true;
        unsub();
        notify?.();
      });
      while (!aborted) {
        if (!queue.length) {
          await Promise.race([
            new Promise<void>((resolve) => {
              notify = resolve;
            }),
            new Promise<void>((resolve) => setTimeout(resolve, KEEPALIVE_MS)),
          ]);
          notify = null;
        }
        if (aborted) break;
        const next = queue.shift();
        if (next !== undefined) {
          await stream.writeSSE({ event: "message", data: next });
        } else {
          await stream.writeSSE({ event: "ping", data: String(Date.now()) });
        }
      }
    });
}

export const streamsRoute = new Hono();

streamsRoute.get("/quotes", (c) => {
  const extra = (c.req.query("extra") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return sseEndpoint((push) => subscribeQuotes(push, extra))(c);
});

streamsRoute.get("/charts/:id", (c) => {
  const id = c.req.param("id");
  return sseEndpoint((push) => subscribeChart(id, push))(c);
});

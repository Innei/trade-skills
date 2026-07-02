import { ClientError } from "../errors.js";
import { buildChart, refreshBody } from "../services/build.js";
import { loadChart } from "../services/store.js";
import { createPoller, type PollerHandle } from "./poller.js";

const CHART_INTERVAL_MS = 60_000;
const LIVE_TYPES = new Set(["flow", "kline", "intraday"]);

const chartPollers = new Map<string, PollerHandle>();

export async function subscribeChart(id: string, push: (envelope: string) => void): Promise<() => void> {
  const doc = await loadChart(id);
  if (!doc) throw new ClientError(`chart not found: ${id}`, undefined, 404);

  push(JSON.stringify({ type: "data", data: { built: doc.built } }));

  const body = LIVE_TYPES.has(doc.type) ? refreshBody(doc.type, doc.input) : null;
  if (!body) return () => {};

  let handle = chartPollers.get(id);
  if (!handle) {
    handle = createPoller({
      intervalMs: CHART_INTERVAL_MS,
      task: async () => {
        const result = await buildChart(body);
        return { built: result.built };
      },
      onStop: () => {
        chartPollers.delete(id);
      },
    });
    chartPollers.set(id, handle);
  }
  return handle.subscribe(push);
}

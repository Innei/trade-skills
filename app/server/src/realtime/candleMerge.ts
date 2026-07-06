import type { RawBar } from "../../../shared/types.js";

export interface PushBar {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function mergeCandleBar(bars: RawBar[], bar: PushBar): RawBar[] {
  const rawBar: RawBar = {
    time: new Date(bar.ts).toISOString(),
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
  };
  if (bars.length === 0) return [rawBar];
  const lastTs = Date.parse(bars[bars.length - 1].time);
  if (bar.ts === lastTs) return [...bars.slice(0, -1), rawBar];
  if (bar.ts > lastTs) return [...bars, rawBar];
  return bars;
}

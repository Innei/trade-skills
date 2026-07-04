import type { BenchmarkSeries, RawBar } from "../../../../shared/types.js";

export function buildBenchmark(series: { symbol: string; bars: RawBar[] }[]): BenchmarkSeries[] {
  const result: BenchmarkSeries[] = [];
  for (const { symbol, bars } of series) {
    if (bars.length === 0) continue;
    const firstClose = Number(bars[0].close);
    result.push({
      symbol,
      points: bars.map((bar) => ({
        time: Date.parse(bar.time),
        pct: (Number(bar.close) / firstClose - 1) * 100,
      })),
    });
  }
  return result;
}

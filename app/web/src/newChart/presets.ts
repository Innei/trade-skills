export type PresetId = "daily" | "intraday" | "flow";

export interface ChartPreset {
  id: PresetId;
  label: string;
  description: string;
}

export const CHART_PRESETS: ChartPreset[] = [
  { id: "daily", label: "日K + 常用指标", description: "260 日日K，趋势模板/均线/支撑压力自动计算" },
  { id: "intraday", label: "盘中多周期", description: "5分钟/15分钟/1小时三周期，MACD 与自动信号" },
  { id: "flow", label: "资金流", description: "当日主力资金净流入曲线" },
];

export function buildChartPayload(presetId: PresetId, symbol: string): Record<string, unknown> {
  switch (presetId) {
    case "daily":
      return { type: "sepa", symbol };
    case "intraday":
      return { type: "intraday", symbol };
    case "flow":
      return { type: "flow", symbol };
  }
}

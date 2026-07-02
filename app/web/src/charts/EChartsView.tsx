import * as echarts from "echarts";
import { useEffect, useRef, useState } from "react";
import type { EChartsBuilt } from "../../../shared/types";

export function EChartsView({ built }: { built: EChartsBuilt }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const chart = echarts.init(el, null, { renderer: "canvas" });
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    try {
      chart.setOption(built.option);
      setRenderError(null);
    } catch (err) {
      setRenderError(err instanceof Error ? err.message : String(err));
    }
  }, [built]);

  return (
    <div className="echarts-page">
      {built.subtitle && <div className="subtitle">{built.subtitle}</div>}
      {renderError && <div className="error-box">渲染失败：{renderError}</div>}
      <div ref={hostRef} className="echarts-host" />
    </div>
  );
}

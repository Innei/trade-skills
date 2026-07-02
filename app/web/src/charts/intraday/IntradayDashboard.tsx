import { useRef, useState } from "react";
import type { IntradayBuilt, TimeframeKey } from "../../../../shared/types";
import { fmt } from "../../format";
import { IntradaySidebar } from "./IntradaySidebar";
import { EMA_COLORS, useIntradayCharts } from "./useIntradayCharts";

export const TF_LABELS: Record<TimeframeKey, string> = { m5: "5分钟", m15: "15分钟", h1: "1小时" };
const TF_ORDER: TimeframeKey[] = ["m5", "m15", "h1"];

export function IntradayDashboard({ built }: { built: IntradayBuilt }) {
  const [tf, setTf] = useState<TimeframeKey>(built.defaultTf in built.timeframes ? built.defaultTf : "m15");
  const mainRef = useRef<HTMLDivElement>(null);
  const macdRef = useRef<HTMLDivElement>(null);
  useIntradayCharts(built, tf, mainRef, macdRef);

  return (
    <div className="layout">
      <div className="charts-col">
        <div className="tf-tabs">
          {TF_ORDER.map((k) => (
            <button key={k} className={`tf-tab${k === tf ? " active" : ""}`} onClick={() => setTf(k)}>
              {TF_LABELS[k]}
            </button>
          ))}
        </div>
        <div className="chart-block intraday-main">
          <div className="chart-label">K 线 + 成交量</div>
          <div className="chart-legend">
            {(built.sidebar.technicals[tf]?.emas ?? []).map((e, i) => (
              <span key={e.period}>
                <span className="swatch" style={{ background: EMA_COLORS[i % EMA_COLORS.length] }} />
                EMA{e.period}
                {e.last !== null && ` $${fmt(e.last)}`}
              </span>
            ))}
          </div>
          <div ref={mainRef} className="chart-host" />
        </div>
        <div className="chart-block macd">
          <div className="chart-label">MACD (12,26,9)</div>
          <div ref={macdRef} className="chart-host" />
        </div>
      </div>
      <IntradaySidebar built={built} activeTf={tf} />
    </div>
  );
}

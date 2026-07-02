import type { CSSProperties } from "react";
import type { SepaBuilt } from "../../../../shared/types";
import { fmt, signed, upDown } from "../../format";
import { NewsSection } from "../NewsSection";

const CHECK_ICON: Record<string, string> = { pass: "✅", fail: "❌", unknown: "⚠" };

export function SepaSidebar({ built }: { built: SepaBuilt }) {
  const s = built.sidebar;
  const ep = built.chart.entryPlan;
  const zones = built.chart.supportZones;
  const kv = s.keyValues;

  return (
    <div className="sidebar">
      <div className="header">
        <div className="symbol">{s.symbol}</div>
        <div className="name">{s.name}</div>
        <div className="price">
          ${fmt(s.last)}
          <span className={`price-change ${upDown(s.chgPct)}`}>{signed(s.chgPct)}%</span>
        </div>
        <div className="price-date">{s.asOf} · 长桥证券</div>
      </div>

      <div className="verdict" style={{ "--vc": s.verdict.color } as CSSProperties}>
        <div className="verdict-label">SEPA 结论</div>
        <div className="verdict-text">{s.verdict.label}</div>
        <div className="verdict-reason">{s.verdict.reason}</div>
      </div>

      {s.stage.length > 0 && (
        <>
          <div className="section-title">阶段判断</div>
          <div className="grid2">
            {s.stage.map((row) => (
              <StageRow key={row.k} k={row.k} v={row.v} />
            ))}
          </div>
        </>
      )}

      <div className="section-title">趋势模板 8 条</div>
      {s.checks.map((c) => (
        <div key={c.label} className={`check-item ${c.status}`}>
          <div className="check-icon">{CHECK_ICON[c.status] ?? "⚠"}</div>
          <div>
            <div className="check-label">{c.label}</div>
            <div className="check-val">{c.val}</div>
          </div>
        </div>
      ))}

      <div className="section-title">关键数值</div>
      <div className="grid2">
        <div className="k">距 52w 高 ${fmt(kv.high52w)}</div>
        <div className="v down">{signed(kv.h52Pct)}%</div>
        <div className="k">距 52w 低 ${fmt(kv.low52w)}</div>
        <div className="v up">{signed(kv.l52Pct, 0)}%</div>
        <div className="k">距 MA50</div>
        <div className={`v ${upDown(kv.ma50Pct)}`}>{signed(kv.ma50Pct)}%</div>
        <div className="k">距 MA200</div>
        <div className={`v ${upDown(kv.ma200Pct)}`}>{signed(kv.ma200Pct)}%</div>
        {kv.rs21d !== null && (
          <>
            <div className="k">RS 21d (vs SPY)</div>
            <div className={`v ${upDown(kv.rs21d)}`}>{signed(kv.rs21d, 1)} pp</div>
          </>
        )}
        {kv.rs126d !== null && (
          <>
            <div className="k">RS 126d (vs SPY)</div>
            <div className={`v ${upDown(kv.rs126d)}`}>{signed(kv.rs126d, 1)} pp</div>
          </>
        )}
      </div>

      {zones.length > 0 && (
        <>
          <div className="section-title">支撑区</div>
          {zones.map((z, i) => (
            <div key={i} className="zone-item" style={{ "--zc": z.axis_color } as CSSProperties}>
              <div className="zone-head">
                <span className="zone-label">{z.label}</span>
                <span className="zone-range">
                  ${fmt(z.low)} – ${fmt(z.high)} ({signed(((z.high + z.low) / 2 / s.last) * 100 - 100, 1)}%)
                </span>
              </div>
              <div className="zone-meta">
                {z.note}
                {z.sources.length > 0 && <span style={{ color: "#6e7681" }}> · {z.sources.join(" / ")}</span>}
              </div>
            </div>
          ))}
        </>
      )}

      {ep && (
        <>
          <div className="section-title">
            入场计划
            {ep.hypothetical && <span className="hypo-badge">假设性</span>}
          </div>
          <div className="grid2">
            <div className="k">买入区间 (pivot+5%)</div>
            <div className="v">
              ${fmt(ep.pivot)} – ${fmt(ep.buy_zone_high)}
            </div>
            <div className="k">止损</div>
            <div className="v down">
              ${fmt(ep.stop)} ({signed(ep.stop_pct, 1)}%)
            </div>
            <div className="k">第一目标 (+{fmt(ep.target1_pct, 0)}%)</div>
            <div className="v up">${fmt(ep.target1)}</div>
            <div className="k">第二目标 (+{fmt(ep.target2_pct, 0)}%)</div>
            <div className="v up">${fmt(ep.target2)}</div>
            <div className="k">R/R 比例 (基于 T2)</div>
            <div className={`v ${ep.rr_great ? "up" : ep.rr_ok ? "" : "down"}`}>
              {fmt(ep.rr)} : 1{!ep.rr_ok && <span className="warn-red"> ⚠ &lt;2:1 SEPA 不入场</span>}
            </div>
          </div>
          {ep.note && <div className="note-block">{ep.note}</div>}
          <div className="rule-block">
            <b>三阶段止损（SEPA 规则）</b>
            <br />① 入场后硬止损 −7~8%，绝不下移
            <br />② 涨 +8%：卖一半，止损上移到本钱（不再亏）
            <br />③ 涨 +15%：再卖 25%，剩仓沿 20MA 跟踪；跌破 20MA 全清
          </div>
        </>
      )}

      {s.position && (
        <>
          <div className="section-title">持仓视角</div>
          <div className="grid2">
            <div className="k">持仓</div>
            <div className="v">{s.position.shares} sh</div>
            <div className="k">成本</div>
            <div className="v">${fmt(s.position.cost)}</div>
            <div className="k">浮{s.position.unrealized >= 0 ? "盈" : "亏"}</div>
            <div className={`v ${upDown(s.position.unrealized)}`}>
              {signed(s.position.unrealized)} ({signed(s.position.unrealizedPct)}%)
            </div>
            <div className="k">守仓边界 (50MA)</div>
            <div className="v">${fmt(s.ma50Now)}</div>
          </div>
        </>
      )}

      <NewsSection news={s.news ?? []} />

      <div className="disclaimer">
        ⚠️ 仅供学习参考，不构成投资建议。数据来源：长桥证券。
        <br />
        SEPA 框架基于 Mark Minervini 方法。Verdict 自动检测 trend template + extended 警戒；形态（VCP / 杯柄 / 平台 / 旗形）需人工目视确认。
      </div>
    </div>
  );
}

function StageRow({ k, v }: { k: string; v: string }) {
  return (
    <>
      <div className="k">{k}</div>
      <div className="v left">{v}</div>
    </>
  );
}

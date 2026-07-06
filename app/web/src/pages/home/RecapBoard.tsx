import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { OverviewRecap, PredictionStats, StatsBucket } from "../../../../shared/types";
import { signed } from "../../format";
import { Badge, Card, ErrorBox, MarketTime, Num, SectionTitle } from "../../ui";
import { symbolUrl } from "../cockpit/analysisMode";
import { useIntervalFetch } from "../cockpit/useIntervalFetch";

const DIRECTION_LABEL: Record<string, string> = { long: "做多", short: "做空", neutral: "观望" };
const OUTCOME_LABEL: Record<string, string> = { hit_target: "命中目标", hit_stop: "打到止损", open: "未了结" };
const OUTCOME_TONE: Record<string, "up" | "down"> = { hit_target: "up", hit_stop: "down" };

function BucketLine({ label, bucket }: { label: string; bucket: StatsBucket }) {
  const resolved = bucket.hit_target + bucket.hit_stop;
  return (
    <div className="stats-line">
      <span className="k">{label}</span>
      <span className="v">
        {bucket.total} 次 · 命中率 {bucket.win_rate == null ? "—" : `${(bucket.win_rate * 100).toFixed(0)}%`}
        {resolved > 0 && `（目标 ${bucket.hit_target} / 止损 ${bucket.hit_stop}）`}
        {bucket.open > 0 && ` · 未了结 ${bucket.open}`}
        {bucket.avg_pct != null && ` · 了结均值 ${signed(bucket.avg_pct)}%`}
      </span>
    </div>
  );
}

function StatsBlock({ stats }: { stats: PredictionStats | null }) {
  if (!stats) return <div className="note-block">统计加载中…</div>;
  if (stats.total === 0) return <div className="note-block">还没有可统计的预测。</div>;
  return (
    <div className="overview-stats">
      <BucketLine label="全部预测" bucket={stats.overall} />
      <BucketLine label="做多" bucket={stats.by_direction.long} />
      <BucketLine label="做空" bucket={stats.by_direction.short} />
      <BucketLine label="AI 生成" bucket={stats.by_origin.analyst} />
      <BucketLine label="手动分析" bucket={stats.by_origin.manual} />
    </div>
  );
}

function SettlementTable({ recap }: { recap: OverviewRecap }) {
  if (recap.settlements.length === 0) return <div className="note-block">今天没有跟踪中的标的。</div>;
  return (
    <div className="recap-settlements">
      {recap.settlements.map((s) => (
        <Card link key={s.symbol} className="recap-row" href={symbolUrl(s.symbol, s.chart_id)}>
          <span className="sym">{s.symbol.replace(/\.US$/, "")}</span>
          <span className="dir">{s.direction ? DIRECTION_LABEL[s.direction] : "—"}</span>
          {s.day_pct != null ? <Num value={s.day_pct} diff suffix="%" /> : <span>—</span>}
          {s.outcome ? (
            <Badge tone={OUTCOME_TONE[s.outcome.status]}>{OUTCOME_LABEL[s.outcome.status]}</Badge>
          ) : (
            <Badge>无法判定</Badge>
          )}
        </Card>
      ))}
    </div>
  );
}

function AiActivity({ recap }: { recap: OverviewRecap }) {
  const usage = recap.usage;
  return (
    <div className="recap-ai">
      {recap.alerts.length === 0 && <div className="note-block">今天没有 alert 级提醒。</div>}
      {recap.alerts.map((a, i) => (
        <div key={i} className="recap-alert">
          <MarketTime className="ts" value={a.ts} format="clock" />
          <span className="sym">{a.symbol.replace(/\.US$/, "")}</span>
          <span className="text">{a.text}</span>
        </div>
      ))}
      <div className="stats-line stats-line--spaced">
        <span className="k">今日 AI 花费</span>
        <span className="v">
          {usage.runs === 0
            ? "还没有记录"
            : `$${usage.cost_total.toFixed(4)} · ${usage.runs} 次运行 · ${usage.total_tokens.toLocaleString()} tokens`}
        </span>
      </div>
    </div>
  );
}

export function RecapBoard({ defaultExpanded }: { defaultExpanded: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { data: recap, error } = useIntervalFetch<OverviewRecap>(expanded ? "/api/overview/recap" : null, 5 * 60_000);
  const { data: stats } = useIntervalFetch<PredictionStats>(expanded ? "/api/overview/stats" : null, 5 * 60_000);

  return (
    <div className="recap-board">
      <SectionTitle className="recap-toggle" onClick={() => setExpanded(!expanded)}>
        今日复盘 {expanded ? <ChevronDown className="icon" size={13} /> : <ChevronRight className="icon" size={13} />}
      </SectionTitle>
      {expanded && (
        <>
          {error && <ErrorBox>{error}</ErrorBox>}
          {!recap && !error && <div className="note-block">复盘加载中…</div>}
          {recap && (
            <>
              <SettlementTable recap={recap} />
              <SectionTitle className="recap-subhead">预测战绩（全部历史）</SectionTitle>
              <StatsBlock stats={stats} />
              <SectionTitle className="recap-subhead">AI 活动</SectionTitle>
              <AiActivity recap={recap} />
            </>
          )}
        </>
      )}
    </div>
  );
}

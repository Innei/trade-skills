import { useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
import type { ChartMeta, LegacyChart } from "../../../shared/types";
import { useQuery } from "../apiHooks";
import { QuoteBar } from "../QuoteBar";
import { Badge, Card, Chip, Dot, Empty, ErrorBox, Input, MarketTime, SectionTitle } from "../ui";
import { useTitle } from "../useTitle";

interface MetaWithUrl extends ChartMeta {
  url: string;
  prediction_stale: boolean;
}

const TYPES = ["sepa", "intraday", "flow", "cohort"] as const;
const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];

function dateLabel(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? date : `${date} 周${WEEKDAY[d.getUTCDay()]}`;
}

function groupLabel(view: "date" | "symbol", key: string): string {
  if (view === "date") return dateLabel(key);
  return key ? key.replace(/\.US$/, "") : "无标的";
}

function groupBy(charts: MetaWithUrl[], key: (m: MetaWithUrl) => string): [string, MetaWithUrl[]][] {
  const groups = new Map<string, MetaWithUrl[]>();
  for (const m of charts) {
    const k = key(m);
    const list = groups.get(k);
    if (list) list.push(m);
    else groups.set(k, [m]);
  }
  return [...groups.entries()];
}

function ChartCard({ meta }: { meta: MetaWithUrl }) {
  return (
    <Card link className="charts-card" href={`/charts/${encodeURIComponent(meta.id)}`}>
      <div className="charts-card-head">
        <Badge>{meta.type}</Badge>
        {meta.symbol && <span className="sym">{meta.symbol.replace(/\.US$/, "")}</span>}
        {meta.prediction_stale && <Dot tone="accent" title="预测已过期" />}
        <MarketTime className="time" value={meta.created_at} format="clock" includeZone />
      </div>
      <div className="charts-card-title">{meta.title}</div>
    </Card>
  );
}

export function ChartList() {
  useTitle("图表");
  const [type, setType] = useState("");
  const [symbol, setSymbol] = useState("");
  const [view, setView] = useState<"date" | "symbol">("date");
  const [showLegacy, setShowLegacy] = useState(false);

  const chartsUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    const query = params.toString();
    return `/api/charts${query ? `?${query}` : ""}`;
  }, [type]);

  const { data: charts, error } = useQuery<MetaWithUrl[]>(chartsUrl);
  const { data: legacyData } = useQuery<LegacyChart[]>("/api/legacy");
  const legacy = legacyData ?? [];

  const filtered = useMemo(() => {
    if (!charts) return null;
    const needle = symbol.trim().toUpperCase();
    if (!needle) return charts;
    return charts.filter((m) => m.symbol?.toUpperCase().includes(needle));
  }, [charts, symbol]);

  const groups = useMemo(() => {
    if (!filtered) return [];
    if (view === "date") return groupBy(filtered, (m) => m.id.slice(0, 10)).sort((a, b) => (a[0] < b[0] ? 1 : -1));
    const latest = (metas: MetaWithUrl[]) => metas.reduce((mx, m) => (m.created_at > mx ? m.created_at : mx), "");
    return groupBy(filtered, (m) => m.symbol ?? "").sort((a, b) => {
      if (!a[0] !== !b[0]) return a[0] ? -1 : 1;
      return latest(a[1]) < latest(b[1]) ? 1 : -1;
    });
  }, [filtered, view]);

  return (
    <div className="page home-page">
      <h1>图表库</h1>
      <div className="sub">
        图表数据存于 journal/charts/data · 渲染永远是最新版 ·{" "}
        <a href="/">
          <ArrowLeft className="icon" size={13} /> 首页
        </a>
      </div>
      <QuoteBar />
      <div className="chartlist-toolbar">
        <Chip active={type === ""} onClick={() => setType("")}>
          全部
        </Chip>
        {TYPES.map((t) => (
          <Chip key={t} active={type === t} onClick={() => setType(t)}>
            {t}
          </Chip>
        ))}
        <Input placeholder="按 symbol 过滤，如 MRVL" value={symbol} onChange={(e) => setSymbol(e.target.value)} />
        <span className="toolbar-spacer" />
        <Chip active={view === "date"} onClick={() => setView("date")}>
          按日期
        </Chip>
        <Chip active={view === "symbol"} onClick={() => setView("symbol")}>
          按标的
        </Chip>
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      {filtered && filtered.length === 0 && <Empty>没有匹配的图表 —— 让 Claude 出一张即可出现在这里</Empty>}
      {groups.map(([key, metas]) => (
        <div key={key} className="chart-group">
          <div className="chart-group-head">
            <span className="label">{groupLabel(view, key)}</span>
            <span className="count">{metas.length} 张</span>
          </div>
          <div className="chart-grid">
            {metas.map((m) => (
              <ChartCard key={m.id} meta={m} />
            ))}
          </div>
        </div>
      ))}
      {legacy.length > 0 && (
        <>
          <SectionTitle className="legacy-toggle" onClick={() => setShowLegacy(!showLegacy)}>
            旧版单文件 HTML 存档（{legacy.length}）{" "}
            {showLegacy ? <ChevronDown className="icon" size={13} /> : <ChevronRight className="icon" size={13} />}
          </SectionTitle>
          {showLegacy &&
            legacy.map((f) => (
              <a key={f.file} className="chart-row" href={f.url} target="_blank" rel="noreferrer">
                <span className="date">{f.date}</span>
                <Badge>html</Badge>
                <span className="title">{f.file}</span>
              </a>
            ))}
        </>
      )}
    </div>
  );
}

import { useEffect } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import type { SymbolAnalysisRow } from "../../../shared/types";
import { marketDate } from "../../../shared/time";
import { useQuery } from "../apiHooks";
import { SimpleChartView } from "../charts/simple/SimpleChartView";
import { IntradayDashboard, IntradayTimeframeSwitch } from "../charts/intraday/IntradayDashboard";
import { resolveIntradayTf, useIntradayDoc } from "../charts/intraday/useIntradayDoc";
import type { SidebarTab } from "../charts/SidebarTabs";
import { SepaDashboard } from "../charts/sepa/SepaDashboard";
import { AiTab } from "./cockpit/AiTab";
import { HistoryTab } from "./cockpit/HistoryTab";
import { useCockpitComments } from "./cockpit/useCockpitComments";
import { TopbarQuote } from "../QuoteBar";
import { recordRecentChart } from "../recentCharts";
import { Dot, Empty, ErrorBox, MarketTime } from "../ui";
import { useTitle } from "../useTitle";

export function ChartDetail({ id }: { id: string }) {
  const { doc, error, degraded, live, intradayTf, setIntradayTf, loadHistory } = useIntradayDoc(id);

  useTitle(doc?.title ?? "图表");

  const commentSymbol = doc?.symbol ?? "";
  const commentDate = doc?.created_at ? marketDate(doc.created_at) : undefined;
  const { comments, error: commentsError } = useCockpitComments(commentSymbol, commentDate);

  const { data: analyses } = useQuery<SymbolAnalysisRow[]>(
    doc?.symbol ? `/api/symbols/${encodeURIComponent(doc.symbol)}/analyses` : null,
  );

  useEffect(() => {
    if (doc) recordRecentChart({ id: doc.id, title: doc.title, type: doc.type });
  }, [doc?.id]);

  if (error) {
    return (
      <div className="page">
        <ErrorBox>{error}</ErrorBox>
        <p>
          <a href="/charts">
            <ArrowLeft className="icon" size={13} /> 返回列表
          </a>
        </p>
      </div>
    );
  }
  if (!doc)
    return (
      <div className="page">
        <Empty>加载中…</Empty>
      </div>
    );

  const activeIntradayTf = doc.built.kind === "intraday" ? resolveIntradayTf(doc.built, intradayTf) : null;

  return (
    <div className="fullpage">
      <div className="detail-topbar">
        <a href="/charts">
          <ArrowLeft className="icon" size={13} /> 列表
        </a>
        <span className="title">{doc.title}</span>
        <span className="meta">
          {doc.id} · 更新 <MarketTime value={doc.updated_at} />
        </span>
        {live && degraded && <Dot tone="accent" pulse title="数据延迟：行情拉取失败，正在重试" />}
        <span className="topbar-actions">
          {activeIntradayTf && <IntradayTimeframeSwitch activeTf={activeIntradayTf} onChange={setIntradayTf} />}
          {doc.type === "intraday" && doc.symbol && (
            <a href={`/symbol/${encodeURIComponent(doc.symbol)}`}>
              驾驶舱 <ArrowUpRight className="icon" size={13} />
            </a>
          )}
          {doc.symbol && <TopbarQuote symbol={doc.symbol} />}
        </span>
      </div>
      <div className="detail-body">
        {doc.built.kind === "simple" && <SimpleChartView built={doc.built} />}
        {!["simple", "sepa", "intraday"].includes(doc.built.kind) && (
          <ErrorBox>该图表格式已不再支持，请重新生成（旧格式重建失败）</ErrorBox>
        )}
        {doc.built.kind === "sepa" && <SepaDashboard built={doc.built} />}
        {doc.built.kind === "intraday" && activeIntradayTf && (
          <IntradayDashboard
            built={doc.built}
            activeTf={activeIntradayTf}
            predictionUpdatedAt={doc.prediction_updated_at}
            predictionStale={doc.prediction_stale}
            onLoadHistory={loadHistory}
            extraTabs={
              doc.symbol
                ? ([
                    {
                      key: "ai",
                      label: "AI 点评",
                      content: <AiTab symbol={doc.symbol} comments={comments} error={commentsError} readOnly />,
                    },
                    {
                      key: "history",
                      label: "历史",
                      hidden: !analyses?.length,
                      content: <HistoryTab rows={analyses ?? []} currentId={doc.id} />,
                    },
                  ] satisfies SidebarTab[])
                : undefined
            }
          />
        )}
      </div>
    </div>
  );
}

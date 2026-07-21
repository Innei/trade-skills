import { useState } from 'react';
import type {
  EpisodeReportActionRecordView,
  EpisodeReportCaseDetailView,
  EpisodeReportChartPayload,
  EpisodeReportChartTimeframe,
} from '../types';
import { ChartPanel } from './ChartPanel';
import { Sidebar } from './Sidebar';
import type { ChartSelection } from './chart/scene';
import { fmtSigned } from './format';

type SelectionState =
  | { kind: 'trade'; tradeId: number }
  | { kind: 'action'; step: number; times: Record<EpisodeReportChartTimeframe, number | string> }
  | null;

export function CaseDetail({
  detail,
  payload,
  hidden,
}: {
  detail: EpisodeReportCaseDetailView;
  payload: EpisodeReportChartPayload | undefined;
  hidden: boolean;
}) {
  const finalBarIndex = payload?.finalBarIndex ?? 0;
  const [timeframe, setTimeframe] = useState<EpisodeReportChartTimeframe>(detail.defaultTimeframe);
  const [barIndex, setBarIndex] = useState(finalBarIndex);
  const [activeNodeSeq, setActiveNodeSeq] = useState<number | null>(null);
  const [selection, setSelection] = useState<SelectionState>(null);

  const restoreDefault = () => {
    setBarIndex(finalBarIndex);
    setActiveNodeSeq(null);
    setSelection(null);
  };

  const onNodeClick = (
    tf: EpisodeReportChartTimeframe,
    bar: number,
    sequence: number,
  ) => {
    setTimeframe(tf);
    setBarIndex(bar);
    setActiveNodeSeq(sequence);
  };

  const onToggleTrade = (tradeId: number) => {
    if (selection?.kind === 'trade' && selection.tradeId === tradeId) {
      restoreDefault();
      return;
    }
    setSelection({ kind: 'trade', tradeId });
    setBarIndex(finalBarIndex);
    setActiveNodeSeq(null);
  };

  const onToggleAction = (record: EpisodeReportActionRecordView) => {
    if (!record.chartTimes) return;
    if (selection?.kind === 'action' && selection.step === record.step) {
      restoreDefault();
      return;
    }
    setSelection({ kind: 'action', step: record.step, times: record.chartTimes });
    setBarIndex(finalBarIndex);
    setActiveNodeSeq(null);
  };

  let sceneSelection: ChartSelection = null;
  if (selection?.kind === 'trade') {
    const trade = payload?.trades.find((item) => item.tradeId === selection.tradeId);
    sceneSelection = trade ? { kind: 'trade', tradeId: trade.tradeId, trade } : null;
  } else if (selection?.kind === 'action') {
    sceneSelection = { kind: 'action', step: selection.step, times: selection.times };
  }

  const activeTradeId = selection?.kind === 'trade' ? selection.tradeId : null;
  const activeActionStep = selection?.kind === 'action' ? selection.step : null;

  return (
    <article
      className="trade-case"
      id={detail.anchorId}
      hidden={hidden}
      data-model={detail.model}
      data-outcome={detail.outcome}
    >
      <header className="case-head">
        <div>
          <h3>
            {detail.symbol}
            {detail.provenanceSymbol ? (
              <span className="provenance-alias"> → {detail.provenanceSymbol}</span>
            ) : null}
          </h3>
          <span>
            {detail.questionId} · {detail.model} · {detail.modeLabel}
          </span>
          {detail.provenanceLine ? (
            <small className="provenance-line">{detail.provenanceLine}</small>
          ) : null}
        </div>
        <div className="case-result">
          <span className={`status ${detail.tone}`}>{detail.outcomeLabel}</span>
          <strong className={detail.tone}>{fmtSigned(detail.netR, 3)} R</strong>
        </div>
      </header>
      <div className="case-layout">
        <ChartPanel
          detail={detail}
          payload={payload}
          timeframe={timeframe}
          barIndex={barIndex}
          selection={sceneSelection}
          activeNodeSeq={activeNodeSeq}
          onSelectTimeframe={setTimeframe}
          onNodeClick={onNodeClick}
          onReset={restoreDefault}
        />
        <Sidebar
          detail={detail}
          activeTradeId={activeTradeId}
          activeActionStep={activeActionStep}
          onToggleTrade={onToggleTrade}
          onToggleAction={onToggleAction}
        />
      </div>
    </article>
  );
}
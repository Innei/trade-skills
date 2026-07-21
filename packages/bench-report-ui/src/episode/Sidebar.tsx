import type { EpisodeReportActionRecordView, EpisodeReportCaseDetailView, EpisodeReportFactItem } from '../types';
import { ActionsList } from './ActionsList';
import { TradeLedger } from './TradeLedger';

function factClass(tone: EpisodeReportFactItem['tone']): string | undefined {
  if (tone === 'entry') return 'entry-text';
  return tone || undefined;
}

function Facts({ facts }: { facts: EpisodeReportFactItem[] }) {
  return (
    <dl className="facts">
      {facts.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd className={factClass(item.tone)}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Sidebar({
  detail,
  activeTradeId,
  activeActionStep,
  onToggleTrade,
  onToggleAction,
}: {
  detail: EpisodeReportCaseDetailView;
  activeTradeId: number | null;
  activeActionStep: number | null;
  onToggleTrade: (tradeId: number) => void;
  onToggleAction: (record: EpisodeReportActionRecordView) => void;
}) {
  return (
    <aside className="trade-sidebar">
      <div className="trade-sidebar-scroll">
        <section>
          <h4>首次计划</h4>
          <Facts facts={detail.planFacts} />
          {detail.planReasonCategoryLabel ? (
            <p className="decision-reason">
              <b>{detail.planReasonCategoryLabel}</b>
              {detail.planReasonSummary}
            </p>
          ) : detail.planRationale ? (
            <p className="rationale">{detail.planRationale}</p>
          ) : null}
        </section>
        <section>
          <h4>Episode 结果</h4>
          <Facts facts={detail.resultFacts} />
        </section>
        <TradeLedger trades={detail.trades} activeTradeId={activeTradeId} onToggle={onToggleTrade} />
        <ActionsList
          actions={detail.actions}
          activeStep={activeActionStep}
          onToggle={onToggleAction}
        />
      </div>
    </aside>
  );
}
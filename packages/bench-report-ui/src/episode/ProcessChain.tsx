import type { EpisodeReportCaseDetailView, EpisodeReportChartTimeframe } from '../types';

export function ProcessChain({
  detail,
  activeNodeSeq,
  onNodeClick,
  onReset,
}: {
  detail: EpisodeReportCaseDetailView;
  activeNodeSeq: number | null;
  onNodeClick: (timeframe: EpisodeReportChartTimeframe, barIndex: number, sequence: number) => void;
  onReset: () => void;
}) {
  const { process, availableTimeframes, defaultTimeframe } = detail;
  if (!process.hasTrace) {
    return (
      <section className="process-panel">
        <div className="process-head">
          <div>
            <strong>可观察决策链</strong>
            <span>{process.timingLabel}</span>
          </div>
        </div>
        <p className="process-empty">
          该结果未附加工具 trace；K 线仍显示可验证的 case 起点、决策与成交结果。
        </p>
      </section>
    );
  }
  const passed = process.checks.filter((check) => check.pass).length;
  return (
    <section className="process-panel">
      <div className="process-head">
        <div>
          <strong>可观察决策链</strong>
          <span>{process.timingLabel}</span>
        </div>
        <div>
          <span className={`process-score ${passed === process.checks.length ? 'pass' : 'fail'}`}>
            过程检查 {passed}/{process.checks.length}
          </span>
          <button type="button" className="process-reset" onClick={onReset}>
            查看终局
          </button>
        </div>
      </div>
      <div className="process-rail" role="list" aria-label="工具调用链">
        {process.events.map((event) => {
          const rawTimeframe = event.timeframe ?? defaultTimeframe;
          const timeframe = availableTimeframes.includes(rawTimeframe)
            ? rawTimeframe
            : defaultTimeframe;
          return (
            <button
              type="button"
              role="listitem"
              className={`process-node ${event.kind}${event.isError ? ' error' : ''}${
                activeNodeSeq === event.sequence ? ' active' : ''
              }`}
              key={event.sequence}
              title={event.tool}
              onClick={() => onNodeClick(timeframe, event.snapshotBar, event.sequence)}
            >
              <span className="process-index">{String(event.sequence).padStart(2, '0')}</span>
              <span className="process-bar">{event.barLabel}</span>
              <strong>{event.label}</strong>
              <small>{event.detail}</small>
              <em>
                {event.transitionLabel}
                {event.durationLabel ? ` · ${event.durationLabel}` : ''}
              </em>
            </button>
          );
        })}
      </div>
      <div className="process-checks">
        {process.checks.map((check) => (
          <span className={check.pass ? 'pass' : 'fail'} title={check.detail} key={check.label}>
            <i>{check.pass ? '✓' : '!'}</i>
            {check.label} <small>{check.detail}</small>
          </span>
        ))}
      </div>
    </section>
  );
}
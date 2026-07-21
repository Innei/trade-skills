import type { EpisodeReportViewData } from '../types';

export function AuditPanel({ audit }: { audit: EpisodeReportViewData['audit'] }) {
  if (!audit.attached) {
    return (
      <details className="panel audit-panel">
        <summary>
          <span>长桥数据审计</span>
          <strong>未附加</strong>
        </summary>
      </details>
    );
  }
  const allPass = audit.passed === audit.total;
  return (
    <details className="panel audit-panel" open={!allPass}>
      <summary>
        <span>
          长桥数据审计 <small>逐字段校验 K 线、cutoff、时区与未来数据边界</small>
        </span>
        <strong className={allPass ? 'positive' : 'negative'}>
          {audit.passed}/{audit.total} 通过
        </strong>
      </summary>
      <div className="audit-grid">
        {audit.checks.map((check) => (
          <div className={`audit-check ${check.status}`} key={`${check.questionId}-${check.checkId}`}>
            <i>{check.status === 'pass' ? '✓' : '!'}</i>
            <span>
              <strong>{check.label}</strong>
              <small>
                {check.questionId} · {check.checkId}
              </small>
              {check.detail ? <em>{check.detail}</em> : null}
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}
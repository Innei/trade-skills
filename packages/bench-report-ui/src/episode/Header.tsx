import type { EpisodeReportViewData } from '../types';

export function Header({ data }: { data: EpisodeReportViewData }) {
  const { header } = data;
  const auditClass =
    header.auditChip.tone === 'pass' ? 'pass' : header.auditChip.tone === 'fail' ? 'fail' : '';
  return (
    <header className="report-header">
      <div className="report-title">
        <h1>Episode Bench Report</h1>
        <p>{data.runId}</p>
      </div>
      <div className="header-meta">
        <span className="chip">{header.datasetChip}</span>
        <span className="chip">{header.modelsChip}</span>
        <span className="chip">{header.modesChip}</span>
        <span className="chip">{header.costChip}</span>
        <span className={`chip audit-state ${auditClass}`}>{header.auditChip.label}</span>
        <span className="generated">{data.generatedAt}</span>
      </div>
    </header>
  );
}
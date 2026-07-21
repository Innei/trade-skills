import type { EpisodeReportViewData } from '../types';
import { fmt, fmtSigned, fmtUsd } from './format';
import type { CaseFiltersState } from './useCaseFilters';

export function CasesTable({
  data,
  filters,
}: {
  data: EpisodeReportViewData;
  filters: CaseFiltersState;
}) {
  return (
    <section className="panel cases-panel">
      <div className="panel-title">
        <h2>Case 列表</h2>
        <span>选择记录查看三周期 K 线和交易标注</span>
      </div>
      <div className="filters">
        <select
          id="model-filter"
          aria-label="模型"
          value={filters.model}
          onChange={(event) => filters.setModel(event.target.value)}
        >
          <option value="">全部模型</option>
          {data.filters.models.map((value) => (
            <option value={value} key={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          id="mode-filter"
          aria-label="模式"
          value={filters.mode}
          onChange={(event) => filters.setMode(event.target.value)}
        >
          <option value="">全部模式</option>
          {data.filters.modes.map((item) => (
            <option value={item.value} key={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <select
          id="outcome-filter"
          aria-label="结果"
          value={filters.outcome}
          onChange={(event) => filters.setOutcome(event.target.value)}
        >
          <option value="">全部结果</option>
          {data.filters.outcomes.map((item) => (
            <option value={item.value} key={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <input
          id="case-search"
          type="search"
          placeholder="搜索 symbol / case id"
          value={filters.search}
          onChange={(event) => filters.setSearch(event.target.value)}
        />
        <span id="visible-count">
          {filters.visibleCount} / {filters.total}
        </span>
      </div>
      <div className="table-scroll">
        <table className="compact-table case-table">
          <thead>
            <tr>
              <th>CASE</th>
              <th>模型 / 模式</th>
              <th>方向 / 决策</th>
              <th>计划 E / S / T</th>
              <th>实际 E / X</th>
              <th>结果</th>
              <th>NET R</th>
              <th>MFE / MAE</th>
              <th>成本 / 耗时</th>
            </tr>
          </thead>
          <tbody>
            {data.cases.map((row) => (
              <tr
                className="case-row"
                key={row.index}
                hidden={!filters.isVisible(row.index)}
                data-model={row.model}
                data-mode={row.mode}
                data-outcome={row.outcome}
              >
                <td>
                  <a href={`#${row.anchorId}`}>
                    <strong>
                      {row.symbol}
                      {row.provenanceSymbol ? (
                        <span className="provenance-alias"> → {row.provenanceSymbol}</span>
                      ) : null}
                    </strong>
                    <small>
                      {row.questionId}
                      {row.provenanceDate ? ` · ${row.provenanceDate}` : ''}
                    </small>
                  </a>
                </td>
                <td>
                  <strong>{row.model}</strong>
                  <small>
                    {row.modeLabel} · REP {row.rep}
                  </small>
                </td>
                <td>
                  <strong>{row.directionLabel}</strong>
                  <small>{row.firstDecisionLabel}</small>
                </td>
                <td className="mono">
                  {fmt(row.planEntry)} / <span className="negative">{fmt(row.planStop)}</span> /{' '}
                  <span className="positive">{fmt(row.planTarget)}</span>
                </td>
                <td className="mono">
                  <span>
                    {fmt(row.actualEntry)} / {fmt(row.actualExit)}
                  </span>
                  <small>{row.tradeCount} 笔完整交易</small>
                </td>
                <td>
                  <span className={`status ${row.tone}`}>{row.outcomeLabel}</span>
                </td>
                <td className={`mono ${row.tone}`}>{fmtSigned(row.netR, 3)}</td>
                <td className="mono">
                  {fmt(row.mfeR)} / {fmt(row.maeR)}
                </td>
                <td>
                  <span>{fmtUsd(row.costUsd)}</span>
                  <small>{row.durationLabel}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
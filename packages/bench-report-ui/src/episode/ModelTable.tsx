import type { EpisodeReportViewData } from '../types';
import { fmtPercent, fmtSigned, fmtUsd } from './format';

export function ModelTable({ data }: { data: EpisodeReportViewData }) {
  return (
    <section className="panel model-panel">
      <div className="panel-title">
        <h2>模型汇总</h2>
        <span>按平均净 R / case 排序</span>
      </div>
      <div className="table-scroll">
        <table className="compact-table">
          <thead>
            <tr>
              <th>#</th>
              <th>模型</th>
              <th>CASE / TRADE</th>
              <th>AVG NET R</th>
              <th>EPISODE / 交易胜率</th>
              <th>方向命中</th>
              <th>成交率</th>
              <th>成本</th>
            </tr>
          </thead>
          <tbody>
            {data.modelTable.map((entry) => (
              <tr key={entry.model}>
                <td>{entry.rank}</td>
                <td>
                  <strong>{entry.model}</strong>
                </td>
                <td>
                  {entry.cases} / {entry.trades}
                </td>
                <td className={`mono ${entry.tone}`}>{fmtSigned(entry.avgNetRPerCase, 3)}</td>
                <td>
                  {fmtPercent(entry.winRate)} / {fmtPercent(entry.tradeWinRate)}
                </td>
                <td>{fmtPercent(entry.directionAccuracy)}</td>
                <td>{fmtPercent(entry.fillRate)}</td>
                <td>{fmtUsd(entry.avgCostUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
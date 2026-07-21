import type { KeyboardEvent } from 'react';
import type { EpisodeReportTradeLedgerItem } from '../types';
import { fmt, fmtSigned } from './format';

function activateOnKey(event: KeyboardEvent, handler: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    handler();
  }
}

export function TradeLedger({
  trades,
  activeTradeId,
  onToggle,
}: {
  trades: EpisodeReportTradeLedgerItem[];
  activeTradeId: number | null;
  onToggle: (tradeId: number) => void;
}) {
  if (trades.length === 0) {
    return (
      <section className="trade-ledger">
        <h4>交易明细</h4>
        <p>该 Episode 全程没有成交。</p>
      </section>
    );
  }
  return (
    <details className="trade-ledger" open>
      <summary>
        交易明细 <span>{trades.length}</span>
      </summary>
      <p className="ledger-hint">点击任意一笔，在图表高亮该次决策 K 线并显示该笔实际价位</p>
      <ol>
        {trades.map((trade) => {
          const select = () => onToggle(trade.tradeId);
          return (
            <li
              key={trade.tradeId}
              data-trade-select=""
              data-trade-id={trade.tradeId}
              role="button"
              tabIndex={0}
              className={activeTradeId === trade.tradeId ? 'active' : undefined}
              onClick={select}
              onKeyDown={(event) => activateOnKey(event, select)}
            >
              <div>
                <strong>
                  T{trade.tradeId} · {trade.directionLabel}
                </strong>
                <small>
                  B{trade.decisionBar} 决策 · {trade.entryBar == null ? '—' : `B${trade.entryBar}`} →{' '}
                  {trade.exitBar == null ? '—' : `B${trade.exitBar}`} · {trade.exitLabel}
                </small>
                {trade.entryReasonCategoryLabel ? (
                  <small className="trade-reason">
                    <b>{trade.entryReasonCategoryLabel}</b>
                    {trade.entryReasonSummary}
                  </small>
                ) : null}
              </div>
              <div className="trade-prices">
                <span>E {fmt(trade.entryPrice)}</span>
                <span>
                  S {fmt(trade.initialStop)}
                  {trade.finalStop === trade.initialStop ? '' : ` → ${fmt(trade.finalStop)}`}
                </span>
                <span>T {fmt(trade.target)}</span>
                <span>X {fmt(trade.exitPrice)}</span>
              </div>
              <strong className={trade.tone}>{fmtSigned(trade.netR, 3)} R</strong>
            </li>
          );
        })}
      </ol>
    </details>
  );
}
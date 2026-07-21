import type { MarketTemp, QuoteCell } from '@kansoku/shared/types';
import { signed, upDown } from '@web/lib/format';
import { Badge, DataAgeBadge, Dot } from '@web/ui';
import { RecapCell } from './RecapCell';

export const INDEX_SYMBOLS = ['SPY.US', 'QQQ.US', '.DJI.US', '.VIX.US'];

interface HomeTopStripProps {
  sessionLabel: string | null;
  date: string;
  isToday: boolean;
  quotes: QuoteCell[];
  market: MarketTemp | null | undefined;
  degraded: boolean;
  snapshotAt: number | null;
  recapDate: string | null;
}

function IndexCell({ q }: { q: QuoteCell }) {
  const tone = q.pct == null ? '' : upDown(q.pct);
  return (
    <a className="index-cell" href={`/symbol/${encodeURIComponent(q.symbol)}`}>
      <span className="idx-sym">{q.symbol.replace(/\.US$/, '')}</span>
      <span className={`num idx-pct ${tone}`}>{q.pct == null ? '—' : `${signed(q.pct)}%`}</span>
      {q.session !== '日盘' && <Badge className="qc-session">{q.session}</Badge>}
    </a>
  );
}

export function HomeTopStrip({
  sessionLabel,
  date,
  isToday,
  quotes,
  market,
  degraded,
  snapshotAt,
  recapDate,
}: HomeTopStripProps) {
  const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));
  const cells = INDEX_SYMBOLS.map((s) => bySymbol.get(s)).filter(
    (q): q is QuoteCell => q != null,
  );
  return (
    <div className="home-top-strip">
      <div className="hts-id">
        <h1>盘面</h1>
        {isToday && sessionLabel && <Badge className="session-tag">{sessionLabel}</Badge>}
        <span className="hts-date num">{isToday ? date : `${date} · 历史复盘`}</span>
      </div>
      <div className="hts-cluster">
        <DataAgeBadge at={snapshotAt} />
        {degraded && (
          <Dot tone="accent" pulse title="数据延迟：行情拉取失败，正在重试" />
        )}
        {cells.length === 0 ? (
          <span className="index-placeholder">指数行情连接中…</span>
        ) : (
          cells.map((q) => <IndexCell key={q.symbol} q={q} />)
        )}
        {isToday && recapDate && <RecapCell date={recapDate} />}
      </div>
      {market && (
        <span
          className="market-temp"
          title={`市场温度 ${market.temperature}/100${market.description ? ` · ${market.description}` : ''}`}
        >
          <span className="temp-label">温度 {market.temperature}</span>
          <span className="temp-gauge">
            <i style={{ left: `${Math.min(100, Math.max(0, market.temperature))}%` }} />
          </span>
          {market.valuation != null && market.sentiment != null && (
            <span className="temp-sub">
              估值 {market.valuation} / 情绪 {market.sentiment}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

import type { QuoteCell } from '@kansoku/shared/types';
import { classifySession, sessionLabel } from './session.js';
import { marketOf } from '../symbols/symbol.utils.js';
import type { ExtendedQuote, RawQuote } from './types.js';

const EXTENDED_FRESH_MS = 15 * 60_000;

export function normalizeQuote(q: RawQuote, nowMs: number): QuoteCell {
  const regularLast = Number(q.last);
  const regularPct = Number(q.change_percentage);
  const market = marketOf(q.symbol);
  const clock = classifySession(Math.floor(nowMs / 1000), market);
  const turnoverNum = Number(q.turnover);
  const turnover = Number.isFinite(turnoverNum) && turnoverNum > 0 ? { turnover: turnoverNum } : {};
  if (clock === 'regular') {
    return {
      symbol: q.symbol,
      session: '日盘',
      last: regularLast,
      pct: regularPct,
      regularLast,
      regularPct,
      ...turnover,
    };
  }
  const label = sessionLabel(clock, market);
  const preferred: ExtendedQuote | undefined =
    clock === 'pre' ? q.pre_market : clock === 'post' ? q.post_market : q.overnight;
  if (preferred?.last && preferred.prev_close && preferred.timestamp) {
    const ts = Date.parse(preferred.timestamp);
    if (nowMs - ts <= EXTENDED_FRESH_MS) {
      const last = Number(preferred.last);
      const prev = Number(preferred.prev_close);
      return {
        symbol: q.symbol,
        session: label,
        last,
        pct: prev ? (last / prev - 1) * 100 : null,
        regularLast,
        regularPct,
        ...turnover,
      };
    }
  }
  return {
    symbol: q.symbol,
    session: market === 'US' ? '日盘' : label,
    last: regularLast,
    pct: regularPct,
    regularLast,
    regularPct,
    ...turnover,
  };
}

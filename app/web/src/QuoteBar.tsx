import { useState } from "react";
import type { QuoteSnapshot } from "../../shared/types";
import { signed, upDown } from "./format";
import { useSSE } from "./useSSE";

export function QuoteBar() {
  const [snap, setSnap] = useState<QuoteSnapshot | null>(null);
  const { degraded } = useSSE<QuoteSnapshot>("/api/stream/quotes", setSnap);

  if (!snap) return null;

  return (
    <div className="quote-bar">
      {degraded && <span className="degraded-dot" title="数据延迟：行情拉取失败，正在重试" />}
      {snap.quotes.map((q) => (
        <div key={q.symbol} className="quote-cell">
          <span className="qc-symbol">{q.symbol.replace(/\.US$/, "")}</span>
          <span className={`qc-price ${upDown(q.pct)}`}>${q.last < 10 ? q.last.toFixed(3) : q.last.toFixed(2)}</span>
          <span className={`qc-pct ${upDown(q.pct)}`}>{signed(q.pct)}%</span>
          {q.session !== "日盘" && <span className="qc-session">{q.session}</span>}
        </div>
      ))}
    </div>
  );
}

export function TopbarQuote({ symbol }: { symbol: string }) {
  const [snap, setSnap] = useState<QuoteSnapshot | null>(null);
  useSSE<QuoteSnapshot>(`/api/stream/quotes?extra=${encodeURIComponent(symbol)}`, setSnap);
  const q = snap?.quotes.find((x) => x.symbol === symbol);
  if (!q) return null;

  return (
    <span className="topbar-quote">
      <span className={`qc-price ${upDown(q.pct)}`}>${q.last.toFixed(2)}</span>
      <span className={`qc-pct ${upDown(q.pct)}`}>{signed(q.pct)}%</span>
      <span className="qc-session">{q.session}</span>
    </span>
  );
}

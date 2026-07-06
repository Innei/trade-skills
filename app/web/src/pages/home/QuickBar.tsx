import { useState } from "react";
import { navigate } from "../../router";
import { listRecentSymbols } from "../../recentCharts";
import { Chip, Input } from "../../ui";

function normalizeSymbol(raw: string): string | null {
  let sym = raw.trim().toUpperCase();
  if (!sym) return null;
  if (!sym.includes(".")) sym += ".US";
  return /^[A-Z0-9.]+$/.test(sym) ? sym : null;
}

export function QuickBar({ shortcuts }: { shortcuts: string[] }) {
  const [input, setInput] = useState("");
  const shortcutSet = new Set(shortcuts);
  const recent = listRecentSymbols().filter((s) => !shortcutSet.has(s.symbol));

  const go = () => {
    const sym = normalizeSymbol(input);
    if (!sym) return;
    setInput("");
    navigate(`/symbol/${encodeURIComponent(sym)}`);
  };

  return (
    <div className="quickbar">
      <Input
        className="quickbar-input"
        placeholder="代码直达，如 MRVL"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") go();
        }}
      />
      {shortcuts.map((sym) => (
        <Chip key={sym} className="quickbar-shortcut" href={`/symbol/${encodeURIComponent(sym)}`}>
          {sym.replace(/\.US$/, "")}
        </Chip>
      ))}
      {recent.length > 0 && (
        <span className="quickbar-recent">
          最近：
          {recent.map((s) => (
            <a key={s.symbol} href={`/symbol/${encodeURIComponent(s.symbol)}`}>
              {s.symbol.replace(/\.US$/, "")}
            </a>
          ))}
        </span>
      )}
    </div>
  );
}

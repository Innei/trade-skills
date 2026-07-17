import { useState } from "react";
import { Library, Lock, MessageCircle, Settings } from "lucide-react";
import { useCapabilities } from "../../capabilitiesStore";
import { normalizeSymbol } from "../../lib/symbol";
import { navigate } from "../../router";
import { useLicenseGuard } from "../../useLicenseGuard";
import { listRecentSymbols } from "../../recentCharts";
import { Chip, Input, Tooltip } from "../../ui";

export function QuickBar({
  shortcuts,
  showGlobalActions = true,
}: {
  shortcuts: string[];
  showGlobalActions?: boolean;
}) {
  const [input, setInput] = useState("");
  const { pro } = useCapabilities();
  const { locked, guard } = useLicenseGuard();
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
      {showGlobalActions ? (
        <span className="quickbar-actions">
          {pro && (
            <Tooltip content={locked ? "订阅解锁 AI 功能" : undefined}>
              <button
                type="button"
                className={`icon-action${locked ? " icon-action--locked" : ""}`}
                aria-label={locked ? "研究库（需订阅授权）" : "研究库"}
                onClick={() => guard(() => navigate("/research?view=journal"))}
              >
                <Library size={16} />
                {locked && <Lock className="icon-action-lock-badge" size={9} />}
              </button>
            </Tooltip>
          )}
          {pro && (
            <Tooltip content={locked ? "订阅解锁 AI 功能" : undefined}>
              <button
                type="button"
                className={`icon-action${locked ? " icon-action--locked" : ""}`}
                aria-label={locked ? "AI 对话（需订阅授权）" : "AI 对话"}
                onClick={() => guard(() => navigate("/chat"))}
              >
                <MessageCircle size={16} />
                {locked && <Lock className="icon-action-lock-badge" size={9} />}
              </button>
            </Tooltip>
          )}
          <a className="icon-action" href="/settings" aria-label="设置" title="设置">
            <Settings size={16} />
          </a>
        </span>
      ) : null}
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Maximize2 } from "lucide-react";
import { Button, Empty, ErrorBox, MarketTime, Spinner } from "../../ui";
import { Markdown, openMarkdownModal } from "./markdown";
import { bareSymbol, useDeepDive } from "./useDeepDive";
import { useNote } from "./useNote";

function elapsedLabel(startedAt: string | null): string {
  if (!startedAt) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}分${s}秒` : `${s}秒`;
}

export function NoteTab({ symbol }: { symbol: string }) {
  const { note, error, reload } = useNote(symbol);
  const onNoteReady = useCallback(() => reload(), [reload]);
  const deepDive = useDeepDive(symbol, onNoteReady);
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!deepDive.running) return;
    const timer = window.setInterval(() => forceTick((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [deepDive.running]);

  const confirmAndStart = () => {
    const confirmed = window.confirm(
      "深度分析会跑数分钟，并消耗一次 AI 额度，确定要开始吗？",
    );
    if (confirmed) void deepDive.start();
  };

  if (error) return <ErrorBox>{error}</ErrorBox>;

  const runningElsewhere =
    deepDive.running && deepDive.runningSymbol && bareSymbol(deepDive.runningSymbol) !== bareSymbol(symbol);

  let buttonLabel = note?.markdown ? "重新深度分析" : "跑一次深度分析";
  if (deepDive.running) {
    buttonLabel = runningElsewhere
      ? `有分析进行中（${deepDive.runningSymbol}）`
      : `分析中…${elapsedLabel(deepDive.startedAt)}`;
  }

  const button = (
    <Button onClick={confirmAndStart} disabled={deepDive.pending || deepDive.running || deepDive.disabled}>
      {(deepDive.pending || deepDive.running) && <Spinner />}
      {buttonLabel}
    </Button>
  );

  const openFullscreen = () => {
    if (!note?.markdown) return;
    openMarkdownModal({ title: `${symbol} 研究笔记`, markdown: note.markdown });
  };

  return (
    <div className="note-tab">
      {note?.markdown ? (
        <>
          <div className="note-tab-header">
            <span className="note-tab-mtime">更新于 {note.mtime ? <MarketTime value={note.mtime} /> : "—"}</span>
            <div className="note-tab-actions">
              <button className="link-button" onClick={openFullscreen}>
                <Maximize2 className="icon" size={13} /> 全屏阅读
              </button>
              {button}
            </div>
          </div>
          {deepDive.inlineMessage && <span className="ai-hint">{deepDive.inlineMessage}</span>}
          {deepDive.successNote && <span className="ai-hint">{deepDive.successNote}</span>}
          <Markdown>{note.markdown}</Markdown>
        </>
      ) : (
        <>
          <Empty>还没有 {symbol} 的研究笔记</Empty>
          <div className="note-tab-header note-tab-header--center">
            {button}
          </div>
          {deepDive.inlineMessage && <span className="ai-hint">{deepDive.inlineMessage}</span>}
          {deepDive.successNote && <span className="ai-hint">{deepDive.successNote}</span>}
        </>
      )}
    </div>
  );
}

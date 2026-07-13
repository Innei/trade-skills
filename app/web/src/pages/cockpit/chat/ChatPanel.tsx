import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Maximize2, Minimize2 } from "lucide-react";
import { MarketTime, ScrollArea } from "../../../ui";
import { Markdown } from "../markdown";
import type { ChatMode } from "./ChatDock";
import type { ChatLiveTool, ChatRow, ChatSessionInfo } from "./useChatSession";

const SCROLL_STICK_THRESHOLD = 48;

interface ChatPanelProps {
  session: ChatSessionInfo | null;
  docCreatedAt: string;
  rows: ChatRow[];
  busy: boolean;
  streamText: string;
  liveTools: ChatLiveTool[];
  suggestions: string[];
  mode: ChatMode;
  onDragStart?: (e: React.PointerEvent) => void;
  onModeChange: (mode: ChatMode) => void;
  onPickSuggestion: (question: string) => void;
}

function ToolRow({ label, running, input, output }: { label: string; running: boolean; input?: string; output?: string }) {
  const [open, setOpen] = useState(false);
  const hasDetail = Boolean(input || output);

  return (
    <div className="chat-tool">
      <button
        className="chat-tool-head"
        onClick={() => setOpen((prev) => !prev)}
        disabled={!hasDetail}
        aria-expanded={open}
      >
        <span className={`chat-tool-dot${running ? " running" : ""}`} />
        <span>
          {running ? "正在" : "已调用 "}
          {label}
          {running ? "…" : ""}
        </span>
        {hasDetail && <ChevronRight size={12} className={`chat-tool-caret${open ? " open" : ""}`} />}
      </button>
      {open && hasDetail && (
        <div className="chat-tool-detail">
          {input && (
            <div>
              <div className="chat-tool-detail-label">查了什么</div>
              <pre>{input}</pre>
            </div>
          )}
          {output && (
            <div>
              <div className="chat-tool-detail-label">拿回什么</div>
              <pre>{output}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChatRowView({ row }: { row: ChatRow }) {
  if (row.kind === "user") {
    return (
      <div className="chat-row chat-row--user">
        <div className="chat-bubble chat-bubble--user">{row.text}</div>
      </div>
    );
  }
  if (row.kind === "assistant") {
    return (
      <div className="chat-row">
        <div className="chat-bubble chat-bubble--assistant">
          <Markdown variant="chat">{row.text ?? ""}</Markdown>
        </div>
      </div>
    );
  }
  if (row.kind === "tool") {
    return <ToolRow label={row.label ?? ""} running={false} input={row.input} output={row.output} />;
  }
  return <div className="chat-error-row">{row.text}</div>;
}

export function ChatPanel({
  session,
  docCreatedAt,
  rows,
  busy,
  streamText,
  liveTools,
  suggestions,
  mode,
  onDragStart,
  onModeChange,
  onPickSuggestion,
}: ChatPanelProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el || !stickRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [rows, streamText, liveTools]);

  const onScroll = () => {
    const el = bodyRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_STICK_THRESHOLD;
  };

  const isEmpty = rows.length === 0 && liveTools.length === 0 && !streamText;

  return (
    <div className="chat-panel">
      <div className={`chat-panel-head${onDragStart ? " draggable" : ""}`} onPointerDown={onDragStart}>
        <span className="chat-panel-title">{session?.title ?? "新的追问"}</span>
        <span className="chat-panel-subtitle">
          关于 <MarketTime value={docCreatedAt} format="clock" /> 的分析
        </span>
        <div className="chat-panel-actions">
          <button
            onClick={() => onModeChange(mode === "full" ? "float" : "full")}
            aria-label={mode === "full" ? "退出全屏" : "全屏"}
            title={mode === "full" ? "退出全屏（Esc）" : "全屏"}
          >
            {mode === "full" ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button onClick={() => onModeChange("dock")} aria-label="收起">
            <ChevronDown size={14} />
          </button>
        </div>
      </div>
      <ScrollArea
        className="chat-panel-body"
        contentClassName="chat-panel-body-content"
        viewportRef={bodyRef}
        onScroll={onScroll}
      >
        {isEmpty && !busy && (
          <div className="chat-empty">
            <div className="chat-empty-text">还没有对话，在下方输入你的问题</div>
            {suggestions.length > 0 && (
              <div className="chat-suggestions">
                {suggestions.map((question) => (
                  <button key={question} className="chat-suggestion" onClick={() => onPickSuggestion(question)}>
                    {question}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {rows.map((row) => (
          <ChatRowView key={row.id} row={row} />
        ))}
        {liveTools.map((tool) => (
          <ToolRow
            key={tool.id}
            label={tool.label}
            running={tool.status === "start"}
            input={tool.input}
            output={tool.output}
          />
        ))}
        {streamText && (
          <div className="chat-row">
            <div className="chat-bubble chat-bubble--assistant">
              <Markdown variant="chat">{streamText}</Markdown>
              <span className="chat-cursor" />
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

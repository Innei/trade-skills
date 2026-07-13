import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Square } from "lucide-react";
import { Button, Input } from "../../../ui";
import { ChatPanel } from "./ChatPanel";
import { useChatSession } from "./useChatSession";
import { useFloatingRect } from "./useFloatingRect";

export type ChatMode = "dock" | "float" | "full";

interface ChatDockProps {
  chartId: string;
  docCreatedAt: string;
}

export function ChatDock({ chartId, docCreatedAt }: ChatDockProps) {
  const { session, rows, busy, aborting, streamText, liveTools, hint, loaded, suggestions, send, abort, ensureSuggestions } =
    useChatSession(chartId);
  const [mode, setMode] = useState<ChatMode>("dock");
  const [text, setText] = useState("");
  const { rect, onDragStart, onResizeStart, dragging } = useFloatingRect();
  const hostRef = useRef<HTMLDivElement>(null);
  const [layoutEl, setLayoutEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setLayoutEl(hostRef.current?.closest(".layout") ?? null);
  }, []);

  useEffect(() => {
    setMode("dock");
    setText("");
  }, [chartId]);

  useEffect(() => {
    if (busy) setMode((prev) => (prev === "dock" ? "float" : prev));
  }, [busy]);

  useEffect(() => {
    if (mode !== "dock" && loaded && !session) ensureSuggestions();
  }, [mode, loaded, session, ensureSuggestions]);

  useEffect(() => {
    if (mode !== "full") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMode("float");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  const submit = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    setText("");
    setMode((prev) => (prev === "dock" ? "float" : prev));
    const result = await send(trimmed);
    if (!result.ok) setText(trimmed);
  };

  const composer = (
    <div className="chat-composer">
      <Input
        className="chat-composer-field"
        placeholder="就这份分析继续追问…"
        value={text}
        disabled={busy}
        autoFocus={mode !== "dock"}
        onFocus={() => setMode((prev) => (prev === "dock" ? "float" : prev))}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
          e.preventDefault();
          void submit(text);
        }}
      />
      {busy ? (
        <Button className="chat-composer-stop" onClick={() => void abort()} disabled={aborting}>
          <Square size={11} />
          {aborting ? "停止中…" : "停止"}
        </Button>
      ) : (
        <Button className="chat-composer-send" onClick={() => void submit(text)} disabled={!text.trim()}>
          发送
        </Button>
      )}
    </div>
  );

  const shell = (
    <div
      className={`chat-shell chat-shell--${mode}${dragging ? " dragging" : ""}`}
      style={mode === "float" ? { left: rect.x, top: rect.y, width: rect.w, height: rect.h } : undefined}
      role="dialog"
      aria-label="追问面板"
    >
      {mode === "float" && (
        <>
          <div className="chat-resize chat-resize--w" onPointerDown={onResizeStart("w")} />
          <div className="chat-resize chat-resize--n" onPointerDown={onResizeStart("n")} />
          <div className="chat-resize chat-resize--nw" onPointerDown={onResizeStart("nw")} />
        </>
      )}
      <ChatPanel
        session={session}
        docCreatedAt={docCreatedAt}
        rows={rows}
        busy={busy}
        streamText={streamText}
        liveTools={liveTools}
        suggestions={suggestions}
        mode={mode}
        onDragStart={mode === "float" ? onDragStart : undefined}
        onModeChange={setMode}
        onPickSuggestion={(question) => void submit(question)}
      />
      {composer}
      {hint && <div className="chat-hint">{hint}</div>}
    </div>
  );

  return (
    <div className="chat-dock" ref={hostRef}>
      {mode === "dock" && (
        <>
          {composer}
          {hint && <div className="chat-hint">{hint}</div>}
        </>
      )}
      {mode !== "dock" && layoutEl && createPortal(shell, layoutEl)}
    </div>
  );
}

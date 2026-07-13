import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../../../api";
import { client } from "../../../client";
import { subscribeChannel } from "../../../wsHub";

export interface ChatSessionInfo {
  id: string;
  chartId: string;
  symbol: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export type ChatRowKind = "user" | "assistant" | "tool" | "error";

export interface ChatRow {
  id: string;
  ts: string;
  kind: ChatRowKind;
  text?: string;
  label?: string;
  input?: string;
  output?: string;
}

export interface ChatLiveTool {
  id: string;
  label: string;
  status: "start" | "end";
  input?: string;
  output?: string;
}

interface ChatEnvelope {
  session: ChatSessionInfo | null;
  messages: ChatRow[];
  busy: boolean;
  partial: string;
}

type ChatWsEvent =
  | { event: "delta"; text: string }
  | { event: "tool"; label: string; status: "start" | "end"; input?: string; output?: string }
  | { event: "done" }
  | { event: "aborted" }
  | { event: "error"; message: string };

type ChatWsEnvelope = { type: "init"; busy: boolean; partial: string } | { type: "event"; event: ChatWsEvent };

const isErrorBody = (value: unknown): value is { error: string; hint?: string } =>
  typeof value === "object" && value !== null && typeof (value as { error?: unknown }).error === "string";

async function fetchChat(chartId: string): Promise<ChatEnvelope> {
  const state = await client.chat.get({ id: chartId });
  return state as unknown as ChatEnvelope;
}

export interface ChatSendResult {
  ok: boolean;
  error?: string;
}

export interface ChatSessionState {
  session: ChatSessionInfo | null;
  rows: ChatRow[];
  busy: boolean;
  aborting: boolean;
  streamText: string;
  liveTools: ChatLiveTool[];
  hint: string | null;
  loaded: boolean;
  suggestions: string[];
  send: (text: string) => Promise<ChatSendResult>;
  abort: () => Promise<void>;
  ensureSuggestions: () => void;
}

export function useChatSession(chartId: string): ChatSessionState {
  const [session, setSession] = useState<ChatSessionInfo | null>(null);
  const [rows, setRows] = useState<ChatRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [aborting, setAborting] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [liveTools, setLiveTools] = useState<ChatLiveTool[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const requestSeqRef = useRef(0);
  const toolSeqRef = useRef(0);
  const errorSeqRef = useRef(0);
  const sendPendingRef = useRef(false);
  const suggestionsRequestedRef = useRef(false);

  const reload = useCallback(
    (markError?: string) => {
      const seq = ++requestSeqRef.current;
      fetchChat(chartId)
        .then((env) => {
          if (requestSeqRef.current !== seq || sendPendingRef.current) return;
          setSession(env.session);
          setRows(
            markError
              ? [...env.messages, { id: `error-${chartId}-${errorSeqRef.current++}`, ts: new Date().toISOString(), kind: "error", text: markError }]
              : env.messages,
          );
          setBusy(env.busy);
          setStreamText(env.busy ? env.partial : "");
          setLoaded(true);
          setHint((prev) => (prev === "对话记录加载失败" ? null : prev));
        })
        .catch(() => {
          if (requestSeqRef.current !== seq || sendPendingRef.current) return;
          setLoaded(true);
          setHint("对话记录加载失败");
        });
    },
    [chartId],
  );

  useEffect(() => {
    sendPendingRef.current = false;
    suggestionsRequestedRef.current = false;
    setSession(null);
    setRows([]);
    setBusy(false);
    setAborting(false);
    setStreamText("");
    setLiveTools([]);
    setHint(null);
    setLoaded(false);
    setSuggestions([]);
    reload();
  }, [chartId, reload]);

  useEffect(() => {
    let connectedOnce = false;
    const off = subscribeChannel(
      { kind: "chat", id: chartId },
      (payload) => {
        const env = payload as ChatWsEnvelope;
        if (env.type !== "init" && env.type !== "event") return;
        if (env.type === "init") {
          setBusy(env.busy);
          setStreamText(env.busy ? env.partial : "");
          if (!env.busy) setLiveTools([]);
          return;
        }
        const evt = env.event;
        if (evt.event === "delta") {
          setBusy(true);
          setStreamText((prev) => prev + evt.text);
          return;
        }
        if (evt.event === "tool") {
          if (evt.status === "start") {
            setLiveTools((prev) => [
              ...prev,
              { id: `tool-${toolSeqRef.current++}`, label: evt.label, status: "start", input: evt.input },
            ]);
            return;
          }
          setLiveTools((prev) => {
            const idx = prev.map((t) => t.label === evt.label && t.status === "start").lastIndexOf(true);
            if (idx === -1) return prev;
            return prev.map((t, i) => (i === idx ? { ...t, status: "end", output: evt.output } : t));
          });
          return;
        }
        if (evt.event === "done" || evt.event === "aborted") {
          setBusy(false);
          setAborting(false);
          setStreamText("");
          setLiveTools([]);
          reload();
          return;
        }
        setBusy(false);
        setAborting(false);
        setStreamText("");
        setLiveTools([]);
        reload(evt.message);
      },
      (connected) => {
        if (!connected) return;
        if (connectedOnce) reload();
        connectedOnce = true;
      },
    );
    return off;
  }, [chartId, reload]);

  const send = useCallback(
    async (text: string): Promise<ChatSendResult> => {
      const trimmed = text.trim();
      if (!trimmed) return { ok: false, error: "内容不能为空" };
      const optimisticId = `optimistic-${Date.now()}`;
      sendPendingRef.current = true;
      setHint(null);
      setBusy(true);
      setSuggestions([]);
      setRows((prev) => [...prev, { id: optimisticId, ts: new Date().toISOString(), kind: "user", text: trimmed }]);
      try {
        const result = await client.chat.postMessage({ id: chartId, text: trimmed });
        if (result.status === 202) {
          sendPendingRef.current = false;
          return { ok: true };
        }
        const message = isErrorBody(result.body)
          ? result.body.hint
            ? `${result.body.error} (${result.body.hint})`
            : result.body.error
          : `HTTP ${result.status}`;
        setBusy(false);
        setHint(message);
        setRows((prev) => prev.filter((row) => row.id !== optimisticId));
        sendPendingRef.current = false;
        return { ok: false, error: message };
      } catch (err) {
        const message = errorMessage(err);
        setBusy(false);
        setHint(message);
        setRows((prev) => prev.filter((row) => row.id !== optimisticId));
        sendPendingRef.current = false;
        return { ok: false, error: message };
      }
    },
    [chartId],
  );

  const abort = useCallback(async (): Promise<void> => {
    setAborting(true);
    try {
      await client.chat.abort({ id: chartId });
    } catch {
      setAborting(false);
    }
  }, [chartId]);

  const ensureSuggestions = useCallback(() => {
    if (suggestionsRequestedRef.current) return;
    suggestionsRequestedRef.current = true;
    const seq = requestSeqRef.current;
    client.chat
      .suggestions({ id: chartId })
      .then((res) => {
        if (requestSeqRef.current !== seq) return;
        setSuggestions(res.suggestions);
      })
      .catch(() => {
        setSuggestions([]);
      });
  }, [chartId]);

  return {
    session,
    rows,
    busy,
    aborting,
    streamText,
    liveTools,
    hint,
    loaded,
    suggestions,
    send,
    abort,
    ensureSuggestions,
  };
}

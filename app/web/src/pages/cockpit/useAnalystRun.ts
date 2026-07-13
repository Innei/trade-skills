import { useCallback, useEffect, useState } from "react";
import type { ReassessStatus } from "../../../../packages/core/src/contract/symbols.js";
import { usePollingQuery } from "../../apiHooks";
import { client } from "../../client";
import { REASON_TEXT, useReassessSymbol } from "./useReassessSymbol";

const STATUS_POLL_MS = 5_000;

export type RunningReassessStatus = Extract<ReassessStatus, { running: true }>;

export interface AnalystRunController {
  checking: boolean;
  hint: string | null;
  pending: boolean;
  running: boolean;
  start: () => Promise<void>;
  status: RunningReassessStatus | null;
}

export function useAnalystRun(symbol: string, enabled = true): AnalystRunController {
  const [optimisticStartedAt, setOptimisticStartedAt] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const { pending, reassess } = useReassessSymbol(symbol);
  const statusKey = enabled ? `symbols.reassessStatus:${symbol}` : null;
  const { data: serverStatus, loading: statusLoading, reload: reloadStatus } = usePollingQuery<ReassessStatus>(
    statusKey,
    () => client.symbols.reassessStatus({ sym: symbol }),
    STATUS_POLL_MS,
    { cache: false },
  );

  useEffect(() => {
    setOptimisticStartedAt(null);
    setHint(null);
  }, [symbol, enabled]);

  useEffect(() => {
    if (!serverStatus) return;
    setOptimisticStartedAt(null);
    if (serverStatus.running) setHint(null);
  }, [serverStatus]);

  const start = useCallback(async () => {
    setHint(null);
    const result = await reassess();
    if (!result.ok) {
      if (!result.aborted) setHint(result.error);
      return;
    }

    if (result.data.started || result.data.reason === "already running") {
      setOptimisticStartedAt(Date.now());
      reloadStatus();
      return;
    }

    const reason = result.data.reason ?? "";
    setHint(REASON_TEXT[reason] ?? (reason || "未能启动分析"));
  }, [reassess, reloadStatus]);

  let status: RunningReassessStatus | null = serverStatus?.running ? serverStatus : null;
  if (!status && optimisticStartedAt !== null) {
    const startedAt = new Date(optimisticStartedAt).toISOString();
    status = {
      running: true,
      origin: "manual",
      phase: "preparing",
      activity: "正在等待服务端确认任务",
      startedAt,
      updatedAt: startedAt,
    };
  }

  const checking = enabled && statusLoading && !serverStatus && optimisticStartedAt === null;

  return {
    checking,
    hint,
    pending,
    running: status !== null,
    start,
    status,
  };
}

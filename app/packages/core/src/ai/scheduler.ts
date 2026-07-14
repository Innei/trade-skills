import type { CockpitComment, SessionKind } from "../../../../shared/types.js";
import { classifySession, easternDate } from "../services/session.js";
import { listCharts } from "../services/store.js";
import { runAnalyst as defaultRunAnalyst, escalationOnCooldown as defaultEscalationOnCooldown } from "./analyst.js";
import {
  appendComment as defaultAppendComment,
  latestCommentatorRunAt as defaultLatestCommentatorRunAt,
} from "./comments.js";
import { runCommentator as defaultRunCommentator } from "./commentator.js";
import { buildCommentPack as defaultBuildCommentPack, type CommentPack } from "./datapack.js";
import { listFollowedSymbols } from "./follows.js";
import { aiConfig as defaultAiConfig, type AiConfig, type AiModel } from "./models.js";
import { runDailyRecap } from "./recap.js";
import {
  detectTriggers as defaultDetectTriggers,
  shouldHeartbeat as defaultShouldHeartbeat,
  type NamedLevel,
  type Trigger,
  type TriggerInput,
} from "./triggers.js";

const TICK_MS = 60_000;
const PRE_TICK_MS = 5 * 60_000;
const PREMARKET_GAP_PCT = 2;
const PREMARKET_GAP_WARN_PCT = 3;

const HEARTBEAT_TRIGGER: Trigger = { kind: "heartbeat" as Trigger["kind"], detail: "定时心跳巡检，无显式触发" };
const RESUME_TRIGGER: Trigger = {
  kind: "heartbeat" as Trigger["kind"],
  detail: "重新开启 AI 跟进，最后点评已过期，立即巡检",
};

export interface SchedulerDeps {
  now: () => number;
  aiConfig: () => AiConfig;
  sessionKind: (nowMs: number) => SessionKind;
  discoverTargets: () => Promise<string[]>;
  discoverPreTargets: () => Promise<string[]>;
  buildCommentPack: (symbol: string) => Promise<CommentPack>;
  detectTriggers: (input: TriggerInput) => Trigger[];
  shouldHeartbeat: (lastRunAt: number | null, now: number) => boolean;
  latestCommentatorRunAt: (symbol: string, date: string) => Promise<number | null>;
  runCommentator: typeof defaultRunCommentator;
  runAnalyst: typeof defaultRunAnalyst;
  escalationOnCooldown: (symbol: string, now: number) => boolean;
  appendComment: (comment: CockpitComment) => Promise<void>;
  runRecap: (date: string) => Promise<unknown>;
}

export async function discoverIntradayTargets(
  followedSymbols: () => string[] | Promise<string[]> = listFollowedSymbols,
): Promise<string[]> {
  const [metas, followed] = await Promise.all([
    listCharts({ type: "intraday" }),
    Promise.resolve(followedSymbols()),
  ]);
  const chartSymbols = new Set(
    metas.flatMap((meta) => (meta.symbol ? [meta.symbol.trim().toUpperCase()] : [])),
  );
  return [...new Set(followed.map((symbol) => symbol.trim().toUpperCase()))].filter((symbol) =>
    chartSymbols.has(symbol),
  );
}

export const defaultSchedulerDeps: SchedulerDeps = {
  now: () => Date.now(),
  aiConfig: defaultAiConfig,
  sessionKind: (nowMs) => classifySession(Math.floor(nowMs / 1000)),
  discoverTargets: () => discoverIntradayTargets(),
  discoverPreTargets: () => discoverIntradayTargets(),
  buildCommentPack: (symbol) => defaultBuildCommentPack(symbol),
  detectTriggers: defaultDetectTriggers,
  shouldHeartbeat: defaultShouldHeartbeat,
  latestCommentatorRunAt: (symbol, date) => defaultLatestCommentatorRunAt(symbol, date),
  runCommentator: defaultRunCommentator,
  runAnalyst: defaultRunAnalyst,
  escalationOnCooldown: defaultEscalationOnCooldown,
  appendComment: defaultAppendComment,
  runRecap: (date) => runDailyRecap(date),
};

function dayLevelInputs(pack: CommentPack): NamedLevel[] {
  const named: NamedLevel[] = [];
  const { prev_day, pre_market, opening_range } = pack.day_levels ?? {};
  if (prev_day) {
    named.push({ name: "prev_day_high", value: prev_day.high }, { name: "prev_day_low", value: prev_day.low });
  }
  if (pre_market) {
    named.push({ name: "pre_market_high", value: pre_market.high }, { name: "pre_market_low", value: pre_market.low });
  }
  if (opening_range) {
    named.push(
      { name: "opening_range_high", value: opening_range.high },
      { name: "opening_range_low", value: opening_range.low },
    );
  }
  return named;
}

function triggerInputFromPack(pack: CommentPack): TriggerInput {
  const bars = pack.m5.bars.map((b) => ({
    time: Date.parse(b.time),
    close: Number(b.close),
    volume: Number(b.volume),
  }));
  const macdHist = pack.m5.macd.hist.filter((v): v is number => v != null);
  const flow = pack.flow.map((r) => Number(r.inflow)).filter((v) => Number.isFinite(v));
  const prediction = pack.prediction;
  return {
    bars,
    macdHist,
    flow,
    levels: {
      entry: prediction?.entry ?? null,
      stop: prediction?.stop ?? null,
      target1: prediction?.target1 ?? null,
      target2: prediction?.target2 ?? null,
    },
    zones: prediction?.zones ?? [],
    dayLevels: dayLevelInputs(pack),
  };
}

function combineTriggers(triggers: Trigger[]): Trigger {
  if (triggers.length === 1) return triggers[0];
  return {
    kind: triggers[0].kind,
    detail: triggers.map((t) => `${t.kind}: ${t.detail}`).join("; "),
  };
}

async function handleSymbol(
  symbol: string,
  config: AiConfig,
  deps: SchedulerDeps,
  lastCommentatorRunAt: Map<string, number>,
): Promise<void> {
  if (!config.commentModel) return;
  const pack = await deps.buildCommentPack(symbol);
  const triggers = deps.detectTriggers(triggerInputFromPack(pack));
  const nowMs = deps.now();
  const heartbeat = triggers.length === 0 && deps.shouldHeartbeat(lastCommentatorRunAt.get(symbol) ?? null, nowMs);
  if (triggers.length === 0 && !heartbeat) return;

  const trigger = triggers.length > 0 ? combineTriggers(triggers) : HEARTBEAT_TRIGGER;
  lastCommentatorRunAt.set(symbol, nowMs);

  await runTriggeredCommentator(symbol, pack, trigger, config.commentModel, config.analystModel, deps);
}

async function runTriggeredCommentator(
  symbol: string,
  pack: CommentPack,
  trigger: Trigger,
  commentModel: AiModel,
  analystModel: AiModel | null,
  deps: SchedulerDeps,
): Promise<void> {
  const { escalate } = await deps.runCommentator({
    symbol,
    pack,
    trigger,
    deps: { model: commentModel },
  });

  if (!escalate || !analystModel) return;
  if (deps.escalationOnCooldown(symbol, deps.now())) return;
  deps.runAnalyst({ symbol, origin: "escalation", deps: { model: analystModel } });
}

async function handlePreSymbol(symbol: string, deps: SchedulerDeps, gapNoted: Set<string>): Promise<void> {
  const pack = await deps.buildCommentPack(symbol);
  const prevClose = pack.day_levels?.prev_day?.close;
  const last = pack.quote.last;
  if (prevClose == null || !Number.isFinite(last) || prevClose <= 0) return;

  const gapPct = (last / prevClose - 1) * 100;
  if (Math.abs(gapPct) < PREMARKET_GAP_PCT) return;

  const key = `${symbol}@${easternDate(new Date(deps.now()))}`;
  if (gapNoted.has(key)) return;
  if (pack.recent_comments.some((c) => c.trigger === "premarket_gap")) {
    gapNoted.add(key);
    return;
  }
  gapNoted.add(key);

  const preHigh = pack.day_levels.pre_market?.high;
  const tail = preHigh != null ? `，开盘确认突破时对照盘前高点 ${preHigh}` : "";
  await deps.appendComment({
    ts: new Date(deps.now()).toISOString(),
    symbol,
    level: Math.abs(gapPct) >= PREMARKET_GAP_WARN_PCT ? "warn" : "info",
    text: `盘前跳空${gapPct > 0 ? "高开" : "低开"} ${gapPct.toFixed(1)}%（昨收 ${prevClose} → 现价 ${last}）${tail}。`,
    trigger: "premarket_gap",
    source: "system",
  });
}

interface SchedulerState {
  lastCommentatorRunAt: Map<string, number>;
  lastPreTickAt: number;
  gapNoted: Set<string>;
  recapDate: string | null;
}

async function runRegularTick(deps: SchedulerDeps, state: SchedulerState): Promise<void> {
  const config = deps.aiConfig();
  if (!config.commentModel) {
    console.log("[ai-scheduler] skip: comment model is not configured");
    return;
  }
  const targets = await deps.discoverTargets();
  console.log(`[ai-scheduler] tick targets=${targets.length}`);
  for (const symbol of targets) {
    try {
      await handleSymbol(symbol, config, deps, state.lastCommentatorRunAt);
    } catch (err) {
      console.error(`[ai-scheduler] ${symbol}:`, err instanceof Error ? err.message : String(err));
    }
  }
}

async function runPreTick(deps: SchedulerDeps, state: SchedulerState): Promise<void> {
  const nowMs = deps.now();
  if (nowMs - state.lastPreTickAt < PRE_TICK_MS) return;
  state.lastPreTickAt = nowMs;
  const targets = await deps.discoverPreTargets();
  console.log(`[ai-scheduler] pre-market tick targets=${targets.length}`);
  for (const symbol of targets) {
    try {
      await handlePreSymbol(symbol, deps, state.gapNoted);
    } catch (err) {
      console.error(`[ai-scheduler] pre ${symbol}:`, err instanceof Error ? err.message : String(err));
    }
  }
}

async function runPostTick(deps: SchedulerDeps, state: SchedulerState): Promise<void> {
  const today = easternDate(new Date(deps.now()));
  if (state.recapDate === today) return;
  state.recapDate = today;
  try {
    await deps.runRecap(today);
    console.log(`[ai-scheduler] daily recap done for ${today}`);
  } catch (err) {
    console.error("[ai-scheduler] recap failed:", err instanceof Error ? err.message : String(err));
  }
}

async function runTick(deps: SchedulerDeps, state: SchedulerState): Promise<void> {
  const session = deps.sessionKind(deps.now());
  if (session === "regular") return runRegularTick(deps, state);
  if (session === "pre") return runPreTick(deps, state);
  if (session === "post") return runPostTick(deps, state);
}

export interface AiScheduler {
  start(): boolean;
  stop(): void;
  tick(): Promise<void>;
  resumeFollow(symbol: string): Promise<boolean>;
}

export function createAiScheduler(deps: SchedulerDeps = defaultSchedulerDeps): AiScheduler {
  const state: SchedulerState = {
    lastCommentatorRunAt: new Map(),
    lastPreTickAt: 0,
    gapNoted: new Set(),
    recapDate: null,
  };
  let timer: ReturnType<typeof setInterval> | null = null;
  let ticking = false;

  const tick = async () => {
    if (ticking) return;
    ticking = true;
    try {
      await runTick(deps, state);
    } catch (err) {
      console.error("[ai-scheduler] tick failed:", err instanceof Error ? err.message : String(err));
    } finally {
      ticking = false;
    }
  };

  const resumeFollow = async (symbol: string): Promise<boolean> => {
    const nowMs = deps.now();
    if (deps.sessionKind(nowMs) !== "regular") return false;

    const config = deps.aiConfig();
    if (!config.commentModel) return false;

    const normalized = symbol.trim().toUpperCase();
    const targets = await deps.discoverTargets();
    if (!targets.includes(normalized)) return false;

    const persistedRunAt = await deps.latestCommentatorRunAt(normalized, easternDate(new Date(nowMs)));
    const memoryRunAt = state.lastCommentatorRunAt.get(normalized) ?? null;
    const lastRunAt =
      persistedRunAt == null
        ? memoryRunAt
        : memoryRunAt == null
          ? persistedRunAt
          : Math.max(persistedRunAt, memoryRunAt);
    if (!deps.shouldHeartbeat(lastRunAt, nowMs)) return false;

    state.lastCommentatorRunAt.set(normalized, nowMs);
    const pack = await deps.buildCommentPack(normalized);
    await runTriggeredCommentator(
      normalized,
      pack,
      RESUME_TRIGGER,
      config.commentModel,
      config.analystModel,
      deps,
    );
    return true;
  };

  return {
    start() {
      if (timer) return true;
      timer = setInterval(() => void tick(), TICK_MS);
      return true;
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    tick,
    resumeFollow,
  };
}

let singleton: AiScheduler | null = null;

export function startAiScheduler(deps: SchedulerDeps = defaultSchedulerDeps): boolean {
  if (!singleton) singleton = createAiScheduler(deps);
  return singleton.start();
}

export function stopAiScheduler(): void {
  singleton?.stop();
  singleton = null;
}

export function requestImmediateFollow(symbol: string): void {
  if (!singleton) return;
  void singleton.resumeFollow(symbol).catch((err) => {
    console.error(`[ai-scheduler] immediate follow ${symbol}:`, err instanceof Error ? err.message : String(err));
  });
}

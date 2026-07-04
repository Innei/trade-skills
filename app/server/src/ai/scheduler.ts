import { classifySession, easternDate } from "../services/session.js";
import { listCharts } from "../services/store.js";
import { runAnalyst as defaultRunAnalyst, escalationOnCooldown as defaultEscalationOnCooldown } from "./analyst.js";
import { runCommentator as defaultRunCommentator } from "./commentator.js";
import { buildCommentPack as defaultBuildCommentPack, type CommentPack } from "./datapack.js";
import { aiConfig as defaultAiConfig, type AiConfig } from "./models.js";
import { detectTriggers as defaultDetectTriggers, shouldHeartbeat as defaultShouldHeartbeat, type Trigger, type TriggerInput } from "./triggers.js";

const TICK_MS = 60_000;

const HEARTBEAT_TRIGGER: Trigger = { kind: "heartbeat" as Trigger["kind"], detail: "定时心跳巡检，无显式触发" };

export interface SchedulerDeps {
  now: () => number;
  aiConfig: () => AiConfig;
  isRegularSession: (nowMs: number) => boolean;
  discoverTargets: () => Promise<string[]>;
  buildCommentPack: (symbol: string) => Promise<CommentPack>;
  detectTriggers: (input: TriggerInput) => Trigger[];
  shouldHeartbeat: (lastRunAt: number | null, now: number) => boolean;
  runCommentator: typeof defaultRunCommentator;
  runAnalyst: typeof defaultRunAnalyst;
  escalationOnCooldown: (symbol: string, now: number) => boolean;
}

async function discoverTodayIntradayTargets(now: () => number): Promise<string[]> {
  const today = easternDate(new Date(now()));
  const metas = await listCharts({ type: "intraday" });
  const symbols = new Set<string>();
  for (const meta of metas) {
    if (meta.symbol && easternDate(new Date(meta.created_at)) === today) symbols.add(meta.symbol);
  }
  return [...symbols];
}

export const defaultSchedulerDeps: SchedulerDeps = {
  now: () => Date.now(),
  aiConfig: defaultAiConfig,
  isRegularSession: (nowMs) => classifySession(Math.floor(nowMs / 1000)) === "regular",
  discoverTargets: () => discoverTodayIntradayTargets(() => Date.now()),
  buildCommentPack: (symbol) => defaultBuildCommentPack(symbol),
  detectTriggers: defaultDetectTriggers,
  shouldHeartbeat: defaultShouldHeartbeat,
  runCommentator: defaultRunCommentator,
  runAnalyst: defaultRunAnalyst,
  escalationOnCooldown: defaultEscalationOnCooldown,
};

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
      entry: prediction?.anchor?.price ?? null,
      stop: prediction?.stop ?? null,
      target: prediction?.target1 ?? null,
    },
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

  const { escalate } = await deps.runCommentator({
    symbol,
    pack,
    trigger,
    deps: { model: config.commentModel },
  });

  if (!escalate || !config.analystModel) return;
  if (deps.escalationOnCooldown(symbol, deps.now())) return;
  deps.runAnalyst({ symbol, origin: "escalation", deps: { model: config.analystModel } });
}

async function runTick(deps: SchedulerDeps, lastCommentatorRunAt: Map<string, number>): Promise<void> {
  const nowMs = deps.now();
  if (!deps.isRegularSession(nowMs)) return;
  const config = deps.aiConfig();
  if (!config.commentModel) return;
  const targets = await deps.discoverTargets();
  for (const symbol of targets) {
    try {
      await handleSymbol(symbol, config, deps, lastCommentatorRunAt);
    } catch (err) {
      console.error(`[ai-scheduler] ${symbol}:`, err instanceof Error ? err.message : String(err));
    }
  }
}

export interface AiScheduler {
  start(): boolean;
  stop(): void;
  tick(): Promise<void>;
}

export function createAiScheduler(deps: SchedulerDeps = defaultSchedulerDeps): AiScheduler {
  const lastCommentatorRunAt = new Map<string, number>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let ticking = false;

  const tick = async () => {
    if (ticking) return;
    ticking = true;
    try {
      await runTick(deps, lastCommentatorRunAt);
    } finally {
      ticking = false;
    }
  };

  return {
    start() {
      if (timer) return true;
      if (!deps.aiConfig().commentModel) return false;
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

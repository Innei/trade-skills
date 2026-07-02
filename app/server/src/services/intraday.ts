import {
  AUTO_SIGNAL_META,
  type ColoredPoint,
  type Connector,
  type DivergencePair,
  type DivergencePoint,
  type EmaLine,
  type IntradayBuilt,
  type IntradayEntryPlan,
  type IntradayPrediction,
  type IntradayTfData,
  type IntradayTfSummary,
  type MacdCross,
  type NewsItem,
  type RawBar,
  type SeriesMarker,
  type TimeframeKey,
} from "../../../shared/types.js";
import { ClientError } from "../errors.js";
import { ema, findSwings, lineData, macd, pyRound, sma, toTs } from "./indicators.js";

export const TIMEFRAME_ORDER: TimeframeKey[] = ["m5", "m15", "h1"];
export const TIMEFRAME_LABELS: Record<TimeframeKey, string> = { m5: "5分钟", m15: "15分钟", h1: "1小时" };
export const DEFAULT_EMA_PERIODS = [9, 21, 55];
const MACD_MIN_BARS = 60;
const SIGNAL_ICON: Record<string, string> = { pin_bar: "📌", macd_divergence: "⚡", macd_beichi: "🌀" };
const BEICHI_WEAKER_RATIO = 0.9;
const MIN_PUSH_BARS = 3;

const barTimeShort = (t: number) => new Date(t * 1000).toISOString().slice(5, 16).replace("T", " ");

export function findMacdCrosses(hist: (number | null)[], timesTs: number[]): MacdCross[] {
  const out: MacdCross[] = [];
  let prev: number | null = null;
  for (let i = 0; i < hist.length; i++) {
    const h = hist[i];
    if (h === null) continue;
    if (prev !== null) {
      if (prev <= 0 && h > 0) out.push({ time: timesTs[i], type: "golden" });
      else if (prev >= 0 && h < 0) out.push({ time: timesTs[i], type: "death" });
    }
    prev = h;
  }
  return out;
}

export function findPriceDivergence(swingPoints: DivergencePoint[], isHigh: boolean): DivergencePair[] {
  const out: DivergencePair[] = [];
  for (let i = 0; i + 1 < swingPoints.length; i++) {
    const a = swingPoints[i];
    const b = swingPoints[i + 1];
    if (isHigh && b.price > a.price && b.macd_value < a.macd_value) {
      out.push({ kind: "top", a, b });
    } else if (!isHigh && b.price < a.price && b.macd_value > a.macd_value) {
      out.push({ kind: "bottom", a, b });
    }
  }
  return out;
}

interface Push {
  start: number;
  end: number;
  sign: 1 | -1;
}

export function macdPushes(hist: (number | null)[]): Push[] {
  const pushes: Push[] = [];
  let i = 0;
  const n = hist.length;
  while (i < n) {
    const h = hist[i];
    if (h === null || h === 0) {
      i += 1;
      continue;
    }
    const sign = h > 0 ? 1 : -1;
    let j = i;
    while (j < n) {
      const hj = hist[j];
      if (hj === null || (sign > 0 ? hj <= 0 : hj >= 0)) break;
      j += 1;
    }
    if (j - i >= MIN_PUSH_BARS) pushes.push({ start: i, end: j - 1, sign });
    i = j > i ? j : i + 1;
  }
  return pushes;
}

export function findMacdBeichi(
  hist: (number | null)[],
  highs: number[],
  lows: number[],
  timesTs: number[],
): DivergencePair[] {
  const pushes = macdPushes(hist);
  const out: DivergencePair[] = [];
  const area = (p: Push) => {
    let s = 0;
    for (let j = p.start; j <= p.end; j++) s += Math.abs(hist[j] ?? 0);
    return s;
  };
  const argExtreme = (p: Push, arr: number[], isMax: boolean) => {
    let best = p.start;
    for (let j = p.start + 1; j <= p.end; j++) {
      if (isMax ? arr[j] > arr[best] : arr[j] < arr[best]) best = j;
    }
    return best;
  };
  for (let k = 2; k < pushes.length; k++) {
    const prev = pushes[k - 2];
    const curr = pushes[k];
    if (prev.sign !== curr.sign) continue;
    if (area(curr) >= area(prev) * BEICHI_WEAKER_RATIO) continue;
    let kind: "top" | "bottom";
    let prevI: number;
    let currI: number;
    let prevPrice: number;
    let currPrice: number;
    if (curr.sign > 0) {
      prevI = argExtreme(prev, highs, true);
      currI = argExtreme(curr, highs, true);
      if (highs[currI] <= highs[prevI]) continue;
      kind = "top";
      prevPrice = highs[prevI];
      currPrice = highs[currI];
    } else {
      prevI = argExtreme(prev, lows, false);
      currI = argExtreme(curr, lows, false);
      if (lows[currI] >= lows[prevI]) continue;
      kind = "bottom";
      prevPrice = lows[prevI];
      currPrice = lows[currI];
    }
    out.push({
      kind,
      a: { time: timesTs[prevI], price: prevPrice, macd_value: hist[prevI] as number },
      b: { time: timesTs[currI], price: currPrice, macd_value: hist[currI] as number },
    });
  }
  return out;
}

export interface CoercedTimeframe {
  candles: IntradayTfData["candles"];
  volumes: ColoredPoint[];
  emas: EmaLine[];
  macdDif: IntradayTfData["macdDif"];
  macdDea: IntradayTfData["macdDea"];
  macdHist: ColoredPoint[];
  macdCrosses: MacdCross[];
  autoDivergence: DivergencePair[];
  autoBeichi: DivergencePair[];
  lastClose: number;
  summary: IntradayTfSummary;
}

export function sanitizeEmaPeriods(raw: unknown): number[] {
  if (!Array.isArray(raw)) return DEFAULT_EMA_PERIODS;
  const periods = raw
    .map((p) => Math.trunc(Number(p)))
    .filter((p) => Number.isFinite(p) && p >= 2 && p <= 250)
    .slice(0, 4);
  return periods.length ? periods : DEFAULT_EMA_PERIODS;
}

export function coerceIntradayTimeframe(bars: RawBar[], key: string, emaPeriods = DEFAULT_EMA_PERIODS): CoercedTimeframe {
  if (!bars || bars.length < MACD_MIN_BARS) {
    throw new ClientError(
      `intraday: timeframe '${key}' needs at least ${MACD_MIN_BARS} bars (got ${bars?.length ?? 0}); ` +
        "MACD(12,26,9) needs slow+signal warm-up plus history for swing detection.",
      `Pull more history: \`longbridge kline <SYM> --period ${key} --count 150 --format json\`.`,
    );
  }
  const timesTs = bars.map((b) => toTs(b.time));
  const opens = bars.map((b) => Number(b.open));
  const highs = bars.map((b) => Number(b.high));
  const lows = bars.map((b) => Number(b.low));
  const closes = bars.map((b) => Number(b.close));
  const vols = bars.map((b) => Number(b.volume));

  const { dif, dea, hist } = macd(closes);
  const vol20 = sma(vols, 20);
  const emaArrs = emaPeriods.map((p) => ({ period: p, arr: ema(closes, p) }));

  const candles = timesTs.map((t, i) => ({ time: t, open: opens[i], high: highs[i], low: lows[i], close: closes[i] }));
  const volumes: ColoredPoint[] = timesTs.map((t, i) => {
    let color = closes[i] >= opens[i] ? "#26a69a" : "#ef5350";
    const v20 = vol20[i];
    if (v20 !== null && vols[i] >= 1.5 * v20) color = "#ff5722";
    return { time: t, value: vols[i], color };
  });

  const histBars: ColoredPoint[] = [];
  for (let i = 0; i < timesTs.length; i++) {
    const h = hist[i];
    if (h === null) continue;
    histBars.push({ time: timesTs[i], value: h, color: h >= 0 ? "#26a69a" : "#ef5350" });
  }

  const { swingHighs, swingLows } = findSwings(highs, lows, timesTs);
  const lastNonNull = (arr: (number | null)[]) => {
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i] !== null) return arr[i];
    return null;
  };

  const macdCrosses = findMacdCrosses(hist, timesTs);

  const histByTime = new Map<number, number>();
  for (let i = 0; i < hist.length; i++) {
    const h = hist[i];
    if (h !== null) histByTime.set(timesTs[i], h);
  }
  const withMacd = (pts: { time: number; price: number }[]): DivergencePoint[] =>
    pts.filter((p) => histByTime.has(p.time)).map((p) => ({ ...p, macd_value: histByTime.get(p.time) as number }));

  const autoDivergence = [
    ...findPriceDivergence(withMacd(swingHighs), true),
    ...findPriceDivergence(withMacd(swingLows), false),
  ].sort((a, b) => a.b.time - b.b.time);
  const autoBeichi = findMacdBeichi(hist, highs, lows, timesTs).sort((a, b) => a.b.time - b.b.time);

  return {
    candles,
    volumes,
    emas: emaArrs.map(({ period, arr }) => ({ period, data: lineData(timesTs, arr) })),
    macdDif: lineData(timesTs, dif),
    macdDea: lineData(timesTs, dea),
    macdHist: histBars,
    macdCrosses,
    autoDivergence: autoDivergence.slice(-2),
    autoBeichi: autoBeichi.slice(-2),
    lastClose: closes[closes.length - 1],
    summary: {
      last_dif: lastNonNull(dif),
      last_dea: lastNonNull(dea),
      last_hist: lastNonNull(hist),
      emas: emaArrs.map(({ period, arr }) => ({ period, last: lastNonNull(arr) })),
      recent_swing_highs: swingHighs.slice(-6),
      recent_swing_lows: swingLows.slice(-6),
      last_cross: macdCrosses.length ? macdCrosses[macdCrosses.length - 1] : null,
      divergence_candidates: autoDivergence.slice(-3),
      beichi_candidates: autoBeichi.slice(-3),
    },
  };
}

interface TfOverlay {
  markers: SeriesMarker[];
  priceConnectors: Connector[];
  macdConnectors: Connector[];
}

function buildIntradaySignals(signals: IntradayPrediction["signals"]): Record<TimeframeKey, TfOverlay> {
  const perTf = Object.fromEntries(
    TIMEFRAME_ORDER.map((k) => [k, { markers: [], priceConnectors: [], macdConnectors: [] } as TfOverlay]),
  ) as Record<TimeframeKey, TfOverlay>;
  for (const sig of signals ?? []) {
    const tf = sig.timeframe;
    if (!tf || !(tf in perTf)) continue;
    const stype = sig.type ?? "other";
    const bias = sig.bias;
    const color = bias === "bullish" ? "#26a69a" : bias === "bearish" ? "#ef5350" : "#ffc107";
    const shape = bias === "bullish" ? "arrowUp" : bias === "bearish" ? "arrowDown" : "circle";

    const tooltip = `${SIGNAL_ICON[stype] ?? "•"} AI 标注信号\n${sig.label ?? stype}`;
    if (stype === "macd_divergence") {
      const points = sig.points ?? [];
      for (const p of points) {
        perTf[tf].markers.push({
          time: toTs(p.time),
          position: bias === "bullish" ? "belowBar" : "aboveBar",
          color,
          shape,
          text: SIGNAL_ICON[stype] ?? "•",
          tooltip,
        });
      }
      if (points.length === 2) {
        perTf[tf].priceConnectors.push({
          color,
          data: [
            { time: toTs(points[0].time), value: Number(points[0].price) },
            { time: toTs(points[1].time), value: Number(points[1].price) },
          ],
        });
        if (points[0].macd_value != null && points[1].macd_value != null) {
          perTf[tf].macdConnectors.push({
            color,
            data: [
              { time: toTs(points[0].time), value: Number(points[0].macd_value) },
              { time: toTs(points[1].time), value: Number(points[1].macd_value) },
            ],
          });
        }
      }
    } else {
      if (sig.time == null) continue;
      perTf[tf].markers.push({
        time: toTs(sig.time),
        position: bias === "bullish" ? "belowBar" : "aboveBar",
        color,
        shape,
        text: SIGNAL_ICON[stype] ?? "•",
        tooltip,
      });
    }
  }
  return perTf;
}

function autoPatternMarkers(items: DivergencePair[], group: "divergence" | "beichi", color: string): TfOverlay {
  const markers: SeriesMarker[] = [];
  const priceConnectors: Connector[] = [];
  const macdConnectors: Connector[] = [];
  for (const it of items) {
    const { a, b } = it;
    const meta = AUTO_SIGNAL_META[`${group}-${it.kind}`];
    const position = it.kind === "top" ? "aboveBar" : "belowBar";
    const tooltip =
      `${meta.icon} 自动·${meta.title}（简化算法，仅供参考）\n` +
      `${barTimeShort(a.time)} $${a.price} → ${barTimeShort(b.time)} $${b.price}\n` +
      meta.impact;
    for (const p of [a, b]) {
      markers.push({ time: p.time, position, color, shape: "circle", text: meta.icon, tooltip });
    }
    priceConnectors.push({
      color,
      data: [
        { time: a.time, value: a.price },
        { time: b.time, value: b.price },
      ],
    });
    macdConnectors.push({
      color,
      data: [
        { time: a.time, value: a.macd_value },
        { time: b.time, value: b.macd_value },
      ],
    });
  }
  return { markers, priceConnectors, macdConnectors };
}

export function computeIntradayEntryPlan(
  raw: NonNullable<IntradayPrediction["entry_plan"]>,
  direction: string,
): IntradayEntryPlan {
  const entry = Number(raw.entry);
  const stop = Number(raw.stop);
  const t1Pct = Number(raw.target1_pct ?? 3);
  const t2Pct = Number(raw.target2_pct ?? 6);
  let target1: number;
  let target2: number;
  let risk: number;
  let reward: number;
  if (direction === "short") {
    target1 = pyRound(entry * (1 - t1Pct / 100), 4);
    target2 = pyRound(entry * (1 - t2Pct / 100), 4);
    risk = stop - entry;
    reward = entry - target2;
  } else {
    target1 = pyRound(entry * (1 + t1Pct / 100), 4);
    target2 = pyRound(entry * (1 + t2Pct / 100), 4);
    risk = entry - stop;
    reward = target2 - entry;
  }
  const rr = risk > 0 ? reward / risk : 0;
  return {
    entry,
    stop,
    target1,
    target1_pct: t1Pct,
    target2,
    target2_pct: t2Pct,
    rr,
    rr_ok: rr >= 2,
    rr_great: rr >= 3,
    note: raw.note ?? "",
  };
}

export interface IntradayInput {
  symbol: string;
  name?: string;
  as_of?: string;
  timeframes: Partial<Record<TimeframeKey, RawBar[]>>;
  ema_periods?: number[];
  news?: NewsItem[];
  position?: { shares?: number; cost?: number };
  prediction?: IntradayPrediction | null;
}

export interface IntradayMeta {
  mode: "prediction" | "preview";
  bars: Record<TimeframeKey, number>;
  technicals: Record<TimeframeKey, IntradayTfSummary>;
  [key: string]: unknown;
}

export function buildIntraday(input: IntradayInput): { built: IntradayBuilt; meta: IntradayMeta } {
  const symbol = input.symbol;
  if (!symbol) throw new ClientError("intraday: input.symbol is required");
  const name = input.name || symbol;
  const asOf = input.as_of ?? "";

  const tfRaw = input.timeframes ?? {};
  const missing = TIMEFRAME_ORDER.filter((k) => !(k in tfRaw));
  if (missing.length) {
    throw new ClientError(
      `intraday: missing timeframes [${missing.join(", ")}]; need all of [${TIMEFRAME_ORDER.join(", ")}].`,
      "Pull each with `longbridge kline <SYM> --period <5m|15m|1h> --count 150 --format json`.",
    );
  }

  const prediction = input.prediction ?? null;
  const emaPeriods = sanitizeEmaPeriods(input.ema_periods);
  const tfs = Object.fromEntries(
    TIMEFRAME_ORDER.map((k) => [k, coerceIntradayTimeframe(tfRaw[k] as RawBar[], k, emaPeriods)]),
  ) as Record<TimeframeKey, CoercedTimeframe>;
  const last = tfs.m5.lastClose;

  const direction = prediction?.direction ?? "neutral";
  const anchor = prediction?.anchor;
  const signalsByTf = buildIntradaySignals(prediction?.signals);
  if (anchor && anchor.timeframe in signalsByTf) {
    signalsByTf[anchor.timeframe].markers.push({
      time: toTs(anchor.time),
      position: "inBar",
      color: "#58a6ff",
      shape: "circle",
      text: `🎯 预测点 $${Number(anchor.price).toFixed(2)}`,
      tooltip: `🎯 AI 预测锚点\n${TIMEFRAME_LABELS[anchor.timeframe]} · ${barTimeShort(toTs(anchor.time))} · $${Number(anchor.price).toFixed(2)}\n方向判断（${direction === "short" ? "做空" : direction === "long" ? "做多" : "观望"}）基于这根 K 线做出`,
    });
  }

  const epRaw = prediction?.entry_plan;
  const entryPlan = epRaw?.entry && epRaw.stop ? computeIntradayEntryPlan(epRaw, direction) : null;

  const timeframes = {} as Record<TimeframeKey, IntradayTfData>;
  for (const k of TIMEFRAME_ORDER) {
    const tf = tfs[k];
    const sig = signalsByTf[k];
    const autoDiv = autoPatternMarkers(tf.autoDivergence, "divergence", "#ab47bc");
    const autoBei = autoPatternMarkers(tf.autoBeichi, "beichi", "#ff8f00");
    const crossMarkers: SeriesMarker[] = tf.macdCrosses.map((c, i) => ({
      time: c.time,
      position: "inBar",
      color: c.type === "golden" ? "#26a69a" : "#ef5350",
      shape: "circle",
      text: c.type === "golden" ? "金叉" : "死叉",
      id: `x-${i}`,
      tooltip:
        c.type === "golden"
          ? `金叉 · ${barTimeShort(c.time)}\nDIF 上穿 DEA——短线动能转多，通常是买方接管的信号`
          : `死叉 · ${barTimeShort(c.time)}\nDIF 下穿 DEA——短线动能转空，通常是卖方接管的信号`,
    }));
    timeframes[k] = {
      candles: tf.candles,
      volumes: tf.volumes,
      emas: tf.emas,
      macdDif: tf.macdDif,
      macdDea: tf.macdDea,
      macdHist: tf.macdHist,
      macdCrossMarkers: crossMarkers,
      markers: [...sig.markers, ...autoDiv.markers, ...autoBei.markers]
        .sort((a, b) => a.time - b.time)
        .map((m, i) => ({ ...m, id: `m-${i}` })),
      priceConnectors: [...sig.priceConnectors, ...autoDiv.priceConnectors, ...autoBei.priceConnectors],
      macdConnectors: [...sig.macdConnectors, ...autoDiv.macdConnectors, ...autoBei.macdConnectors],
      autoDivergence: tf.autoDivergence,
      autoBeichi: tf.autoBeichi,
    };
  }

  const defaultTf: TimeframeKey = anchor?.timeframe ?? "m15";
  const technicals = Object.fromEntries(TIMEFRAME_ORDER.map((k) => [k, tfs[k].summary])) as Record<
    TimeframeKey,
    IntradayTfSummary
  >;

  const shares = input.position?.shares;
  const cost = input.position?.cost;
  const position =
    shares && cost
      ? { shares, cost, unrealized: (last - cost) * shares, unrealizedPct: (last / cost - 1) * 100 }
      : null;

  const built: IntradayBuilt = {
    kind: "intraday",
    timeframes,
    defaultTf,
    entryPlan,
    sidebar: {
      symbol,
      name,
      asOf,
      last,
      prediction,
      entryPlan,
      position,
      technicals,
      news: input.news ?? [],
    },
  };

  const meta: IntradayMeta = {
    mode: prediction ? "prediction" : "preview",
    bars: Object.fromEntries(TIMEFRAME_ORDER.map((k) => [k, tfs[k].candles.length])) as Record<TimeframeKey, number>,
    technicals,
  };

  return { built, meta };
}

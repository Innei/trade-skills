import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import type { IntradayBuilt, TimeframeKey } from "../../../../shared/types";
import {
  addPriceLine,
  baseChart,
  markerTooltip,
  observeSize,
  padHistData,
  padLineData,
  showLastBars,
  syncTimeScales,
  toCandleData,
  toHistData,
  toLineData,
  toMarkers,
  type MarkerTooltipHandle,
} from "../lw";

export const EMA_COLORS = ["#ffb74d", "#ba68c8", "#4fc3f7", "#ffee58"];

interface Handle {
  main: IChartApi;
  macd: IChartApi;
  candle: ISeriesApi<"Candlestick">;
  vol: ISeriesApi<"Histogram">;
  emaSeries: ISeriesApi<"Line">[];
  hist: ISeriesApi<"Histogram">;
  dif: ISeriesApi<"Line">;
  dea: ISeriesApi<"Line">;
  mainTip: MarkerTooltipHandle;
  macdTip: MarkerTooltipHandle;
  dynamic: { chart: IChartApi; series: ISeriesApi<"Line"> }[];
}

export function useIntradayCharts(
  built: IntradayBuilt,
  activeTf: TimeframeKey,
  mainRef: RefObject<HTMLDivElement | null>,
  macdRef: RefObject<HTMLDivElement | null>,
): void {
  const handleRef = useRef<Handle | null>(null);
  const builtRef = useRef(built);
  builtRef.current = built;
  const lastTfRef = useRef<TimeframeKey | null>(null);
  const barCountRef = useRef(0);

  useEffect(() => {
    const mainEl = mainRef.current;
    const macdEl = macdRef.current;
    if (!mainEl || !macdEl) return;

    const main = baseChart(mainEl, true);
    const candle = main.addCandlestickSeries({
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    });
    const vol = main.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
      priceLineVisible: false,
      lastValueVisible: false,
    });
    main.priceScale("vol").applyOptions({ scaleMargins: { top: 0.75, bottom: 0 } });

    const emaCount = builtRef.current.timeframes.m5?.emas.length ?? 0;
    const emaSeries = Array.from({ length: emaCount }, (_, i) =>
      main.addLineSeries({
        color: EMA_COLORS[i % EMA_COLORS.length],
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      }),
    );

    const macd = baseChart(macdEl, true);
    const hist = macd.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
    const dif = macd.addLineSeries({ color: "#42a5f5", lineWidth: 1, priceLineVisible: false, lastValueVisible: true });
    const dea = macd.addLineSeries({ color: "#ff9800", lineWidth: 1, priceLineVisible: false, lastValueVisible: true });

    const ep = builtRef.current.entryPlan;
    if (ep) {
      addPriceLine(candle, { price: ep.entry, color: "#58a6ff", lineWidth: 2, lineStyle: 0, title: `入场 $${ep.entry.toFixed(2)}` });
      addPriceLine(candle, { price: ep.stop, color: "#ef5350", lineWidth: 2, lineStyle: 2, title: `止损 $${ep.stop.toFixed(2)}` });
      addPriceLine(candle, { price: ep.target1, color: "#26a69a", lineWidth: 1, lineStyle: 2, title: `T1 $${ep.target1.toFixed(2)}` });
      addPriceLine(candle, { price: ep.target2, color: "#00897b", lineWidth: 1, lineStyle: 2, title: `T2 $${ep.target2.toFixed(2)}` });
    }

    syncTimeScales([main, macd]);
    const observers = [observeSize(mainEl, main), observeSize(macdEl, macd)];
    const mainTip = markerTooltip(main, mainEl);
    const macdTip = markerTooltip(macd, macdEl);

    handleRef.current = { main, macd, candle, vol, emaSeries, hist, dif, dea, mainTip, macdTip, dynamic: [] };
    lastTfRef.current = null;

    return () => {
      mainTip.destroy();
      macdTip.destroy();
      observers.forEach((ro) => ro.disconnect());
      main.remove();
      macd.remove();
      handleRef.current = null;
    };
  }, [mainRef, macdRef]);

  useEffect(() => {
    const h = handleRef.current;
    const d = built.timeframes[activeTf];
    if (!h || !d) return;

    h.dynamic.forEach(({ chart, series }) => {
      try {
        chart.removeSeries(series);
      } catch {
        return;
      }
    });
    h.dynamic = [];

    const timeline = d.candles.map((c) => c.time);
    const prevRange = h.main.timeScale().getVisibleLogicalRange();
    const wasAtRight = prevRange === null || prevRange.to >= barCountRef.current - 2;

    h.candle.setData(toCandleData(d.candles));
    h.vol.setData(toHistData(d.volumes));
    h.emaSeries.forEach((s, i) => {
      const emaLine = d.emas[i];
      s.setData(emaLine ? padLineData(emaLine.data, timeline) : []);
    });
    h.candle.setMarkers(toMarkers(d.markers));
    h.mainTip.setMarkers(d.markers);
    h.dif.setData(padLineData(d.macdDif, timeline));
    h.dea.setData(padLineData(d.macdDea, timeline));
    h.hist.setData(padHistData(d.macdHist, timeline));
    h.dif.setMarkers(toMarkers(d.macdCrossMarkers));
    h.macdTip.setMarkers(d.macdCrossMarkers);

    const connectorOpts = {
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    } as const;
    d.priceConnectors.forEach((c) => {
      const s = h.main.addLineSeries({ color: c.color, ...connectorOpts });
      s.setData(toLineData(c.data));
      h.dynamic.push({ chart: h.main, series: s });
    });
    d.macdConnectors.forEach((c) => {
      const s = h.macd.addLineSeries({ color: c.color, ...connectorOpts });
      s.setData(toLineData(c.data));
      h.dynamic.push({ chart: h.macd, series: s });
    });

    if (lastTfRef.current !== activeTf) {
      lastTfRef.current = activeTf;
      showLastBars(h.main, d.candles);
    } else if (wasAtRight) {
      h.main.timeScale().scrollToRealTime();
    }
    barCountRef.current = d.candles.length;
  }, [built, activeTf]);
}

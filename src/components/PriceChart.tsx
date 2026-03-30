"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { AggregatedLiquidity, LiquidityBucket } from "@/types";
import { formatPrice, formatUsd } from "@/lib/aggregator";
import type { CanvasRenderingTarget2D } from "fancy-canvas";

interface Candle {
  time: number; open: number; high: number; low: number; close: number; volume: number;
}
interface Props {
  mint: string;
  data: AggregatedLiquidity;
  showRange?: number;
}

const RESOLUTIONS = [
  { label: "1m", value: "1" }, { label: "5m", value: "5" },
  { label: "15m", value: "15" }, { label: "1H", value: "60" },
  { label: "4H", value: "240" }, { label: "1D", value: "1440" },
];

const SOURCE_COLORS: Record<string, string> = {
  meteora: "#f97316", raydium: "#8b5cf6", orca: "#06b6d4",
  jupiterLimit: "#22c55e", jupiterDca: "#eab308", pumpfun: "#ec4899",
};
const SOURCE_LABELS: Record<string, string> = {
  meteora: "Meteora", raydium: "Raydium", orca: "Orca",
  jupiterLimit: "Jup Limit", jupiterDca: "Jup DCA", pumpfun: "Pump.fun",
};

// ── Depth bars — lightweight-charts v5 series primitive ────────────────────
// Draws directly inside the chart render pipeline: no z-index fights,
// priceToCoordinate() is always valid when draw() fires.

interface DepthPluginData {
  buckets: LiquidityBucket[];
  currentPrice: number;
  showRange: number;
}

class DepthBarsRenderer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private _data: DepthPluginData | null, private _series: any) {}

  draw(target: CanvasRenderingTarget2D): void {
    if (!this._data || !this._series) return;
    const { buckets, currentPrice, showRange } = this._data;

    // useBitmapCoordinateSpace sets transform=scale(dpr,dpr) so coordinates
    // are still in CSS/media pixels — use mediaSize for boundaries, and use
    // priceToCoordinate() result directly (it already returns media pixels).
    target.useBitmapCoordinateSpace(({ context: ctx, mediaSize }) => {
      const W = mediaSize.width;   // CSS-pixel width of the pane
      const H = mediaSize.height;  // CSS-pixel height of the pane

      const visible = buckets.filter(b => b.index >= -showRange && b.index <= showRange && b.totalUsd > 0);
      if (visible.length === 0) return;

      const maxUsd = Math.max(...visible.map(b => b.totalUsd), 1);
      const MAX_BAR_W = Math.max(60, W * 0.22); // 22% of chart width, min 60px
      const BAR_H      = 3; // CSS pixels — DPR transform makes it crisp
      const CURR_BAR_H = 5;

      for (const bucket of visible) {
        // priceToCoordinate → CSS pixels from top of pane (media coords)
        const y = this._series.priceToCoordinate(bucket.priceMid) as number | null;
        if (y === null || y === undefined || y < 0 || y > H) continue;

        const isCurrent = bucket.index === 0;
        const isSupport = bucket.index < 0;
        const barW = Math.max(1, (bucket.totalUsd / maxUsd) * MAX_BAR_W);
        const barH = isCurrent ? CURR_BAR_H : BAR_H;

        if (isCurrent)       ctx.fillStyle = "rgba(250,204,21,0.9)";
        else if (isSupport)  ctx.fillStyle = "rgba(148,163,184,0.85)"; // grey
        else                 ctx.fillStyle = "rgba(249,115,22,0.75)";  // orange

        ctx.fillRect(W - barW, Math.round(y) - Math.floor(barH / 2), barW, barH);
      }

      // Yellow dashed current-price horizontal line
      const currY = this._series.priceToCoordinate(currentPrice) as number | null;
      if (currY !== null && currY !== undefined && currY >= 0 && currY <= H) {
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = "#facc15";
        ctx.lineWidth   = 1;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(0, Math.round(currY));
        ctx.lineTo(W, Math.round(currY));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
    });
  }
}

class DepthBarsPlugin {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _series: any = null;
  private _requestUpdate: (() => void) | null = null;
  private _data: DepthPluginData | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  attached(param: { series: any; requestUpdate: () => void }) {
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
  }
  detached() {
    this._series = null;
    this._requestUpdate = null;
  }

  setData(data: DepthPluginData) {
    this._data = data;
    this._requestUpdate?.();
  }

  paneViews() {
    const renderer = new DepthBarsRenderer(this._data, this._series);
    return [{
      zOrder: () => "top" as const,
      renderer: () => renderer,
    }];
  }
}

// ── Component ──────────────────────────────────────────────────────────────
export default function PriceChart({ mint, data, showRange = 20 }: Props) {
  const containerRef    = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef        = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candleSeriesRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const volumeSeriesRef = useRef<any>(null);
  const pluginRef       = useRef<DepthBarsPlugin | null>(null);

  const [resolution, setResolution] = useState("60");
  const [candles, setCandles]       = useState<Candle[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  // Push new data into plugin whenever data or showRange changes
  useEffect(() => {
    pluginRef.current?.setData({ buckets: data.buckets, currentPrice: data.currentPrice, showRange });
  }, [data, showRange]);

  // ── Fetch OHLCV ─────────────────────────────────────────────────────────
  const fetchCandles = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/ohlcv?mint=${mint}&resolution=${resolution}`);
      if (!res.ok) { const j = await res.json(); setError(j.error ?? "Load failed"); return; }
      const j = await res.json();
      setCandles(j.candles ?? []);
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }, [mint, resolution]);

  useEffect(() => { fetchCandles(); }, [fetchCandles]);

  // ── Init chart (once) ───────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let chart: any;

    import("lightweight-charts").then(
      ({ createChart, CandlestickSeries, HistogramSeries, ColorType }) => {
        if (!containerRef.current) return;
        chart = createChart(containerRef.current, {
          layout: {
            background: { type: ColorType.Solid, color: "#0d1117" },
            textColor: "#6b7280",
            fontFamily: "ui-monospace,'Courier New',monospace",
          },
          grid: { vertLines: { color: "#1a2030" }, horzLines: { color: "#1a2030" } },
          crosshair: {
            vertLine: { color: "#374151", labelBackgroundColor: "#1f2937" },
            horzLine: { color: "#374151", labelBackgroundColor: "#1f2937" },
          },
          rightPriceScale: {
            borderColor: "#21262d", textColor: "#6b7280",
            scaleMargins: { top: 0.08, bottom: 0.22 },
          },
          timeScale: { borderColor: "#21262d", timeVisible: true, secondsVisible: false, barSpacing: 8 },
          width:  containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });

        const candleSeries = chart.addSeries(CandlestickSeries, {
          upColor: "#22c55e", downColor: "#ef4444",
          borderUpColor: "#22c55e", borderDownColor: "#ef4444",
          wickUpColor: "#22c55e", wickDownColor: "#ef4444",
        });
        const volumeSeries = chart.addSeries(HistogramSeries, {
          priceFormat: { type: "volume" }, priceScaleId: "vol",
        });
        chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

        chartRef.current       = chart;
        candleSeriesRef.current = candleSeries;
        volumeSeriesRef.current = volumeSeries;

        // Attach depth bars primitive to the candle series
        const plugin = new DepthBarsPlugin();
        candleSeries.attachPrimitive(plugin);
        pluginRef.current = plugin;

        // Push current data into plugin (in case data arrived before chart init)
        if (data) {
          plugin.setData({ buckets: data.buckets, currentPrice: data.currentPrice, showRange });
        }
      }
    );

    const handleResize = () => {
      if (!chartRef.current || !containerRef.current) return;
      chartRef.current.applyOptions({
        width:  containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      chart?.remove();
      chartRef.current = candleSeriesRef.current = volumeSeriesRef.current = pluginRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // init once

  // ── Load candle data ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || candles.length === 0) return;
    candleSeriesRef.current.setData(candles.map(c => ({
      time: c.time as import("lightweight-charts").UTCTimestamp,
      open: c.open, high: c.high, low: c.low, close: c.close,
    })));
    volumeSeriesRef.current.setData(candles.map(c => ({
      time: c.time as import("lightweight-charts").UTCTimestamp,
      value: c.volume,
      color: c.close >= c.open ? "#22c55e44" : "#ef444444",
    })));
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  const activeSources = Object.entries(SOURCE_COLORS).filter(
    ([src]) => (data.sourceBreakdown[src as keyof typeof data.sourceBreakdown] ?? 0) > 0
  );

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-[#1a2030]"
        style={{ background: "#0d1117" }}>
        <div className="flex items-center gap-0.5">
          {RESOLUTIONS.map(r => (
            <button key={r.value} onClick={() => setResolution(r.value)}
              className={`text-[11px] px-2 py-0.5 rounded transition-colors font-mono ${
                resolution === r.value ? "bg-[#f97316] text-white" : "text-gray-600 hover:text-white hover:bg-[#1f2937]"
              }`}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="text-[10px] text-gray-600 font-mono">
          {data.token.symbol}/USD · {formatPrice(data.currentPrice)}
        </div>
      </div>

      {/* Chart container — primitive draws directly here */}
      <div ref={containerRef} className="relative flex-1 min-h-0" style={{ background: "#0d1117" }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0d1117]/80 z-20">
            <div className="flex flex-col items-center gap-2">
              <div className="w-5 h-5 border-2 border-[#f97316] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-gray-500">Loading chart…</span>
            </div>
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center z-20">
            <div className="text-center">
              <p className="text-gray-500 text-sm mb-2">{error}</p>
              <button onClick={fetchCandles} className="text-xs text-[#f97316] hover:underline">Retry</button>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="shrink-0 flex items-center flex-wrap gap-x-3 gap-y-0.5 px-3 py-1 border-t border-[#1a2030]"
        style={{ background: "#090c12" }}>
        <span className="text-[9px] text-gray-700">Liquidity:</span>
        <span className="flex items-center gap-1 text-[10px] text-gray-500">
          <span className="inline-block rounded-full" style={{ width: 6, height: 6, background: "#94a3b8" }} />
          Support
        </span>
        <span className="flex items-center gap-1 text-[10px] text-gray-500">
          <span className="inline-block rounded-full" style={{ width: 6, height: 6, background: "#f97316" }} />
          Resistance
        </span>
        {activeSources.map(([src, color]) => {
          const total = data.sourceBreakdown[src as keyof typeof data.sourceBreakdown] ?? 0;
          return (
            <span key={src} className="flex items-center gap-1 text-[10px] text-gray-500">
              <span className="inline-block rounded-full" style={{ width: 6, height: 6, background: color }} />
              {SOURCE_LABELS[src]} ({formatUsd(total)})
            </span>
          );
        })}
      </div>
    </div>
  );
}

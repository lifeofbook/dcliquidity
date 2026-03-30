"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { AggregatedLiquidity } from "@/types";
import { formatPrice, formatUsd } from "@/lib/aggregator";

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

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
}

export default function PriceChart({ mint, data, showRange = 20 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef       = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candleSeriesRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const volumeSeriesRef = useRef<any>(null);

  // Keep a ref to data+showRange so subscriptions always see the latest values
  const dataRef      = useRef(data);
  const rangeRef     = useRef(showRange);
  useEffect(() => { dataRef.current = data; },      [data]);
  useEffect(() => { rangeRef.current = showRange; }, [showRange]);

  const [resolution, setResolution] = useState("60");
  const [candles, setCandles]       = useState<Candle[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  // ── Draw depth bars on canvas ───────────────────────────────────────────
  const drawDepth = useCallback(() => {
    const canvas = canvasRef.current;
    const series = candleSeriesRef.current;
    const d      = dataRef.current;
    if (!canvas || !series || !d) return;

    // Use parent container dimensions (reliable after layout)
    const parent = containerRef.current;
    if (!parent) return;
    const W = parent.clientWidth;
    const H = parent.clientHeight;
    if (W <= 0 || H <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width  = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width  = `${W}px`;
      canvas.style.height = `${H}px`;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const range   = rangeRef.current;
    const buckets = d.buckets.filter(b => b.index >= -range && b.index <= range);
    const maxUsd  = Math.max(...buckets.map(b => b.totalUsd), 1);
    const MAX_BAR_W = Math.max(80, W * 0.20); // 20% of chart width

    let drawnBars = 0;

    for (const bucket of buckets) {
      if (bucket.totalUsd <= 0) continue;

      // Price-to-pixel coordinate (returns null if price is out of visible range)
      const y = series.priceToCoordinate(bucket.priceMid);
      if (y === null || y < 0 || y > H) continue;

      const isCurrent = bucket.index === 0;
      const isSupport = bucket.index < 0;
      const barW  = (bucket.totalUsd / maxUsd) * MAX_BAR_W;
      const barH  = isCurrent ? 5 : isSupport ? 3 : 2;
      const alpha = isCurrent ? 1 : isSupport ? 0.85 : 0.35;

      // Dominant source color
      const dominant = Object.entries(bucket.sources)
        .filter(([, v]) => v > 0)
        .sort(([, a], [, b]) => b - a)[0];
      const hex = dominant ? (SOURCE_COLORS[dominant[0]] ?? "#6b7280") : "#6b7280";
      const [r, g, b2] = hexToRgb(hex);

      ctx.fillStyle = `rgba(${r},${g},${b2},${alpha})`;
      // Draw from RIGHT edge extending LEFT
      ctx.fillRect(W - barW, Math.round(y) - Math.floor(barH / 2), barW, barH);
      drawnBars++;
    }

    // Yellow dashed current-price line
    const currY = series.priceToCoordinate(d.currentPrice);
    if (currY !== null && currY >= 0 && currY <= H) {
      ctx.globalAlpha = 0.75;
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

    // Debug: if nothing drawn, log once
    if (drawnBars === 0 && buckets.length > 0) {
      console.warn("[depth] priceToCoordinate returned null for all buckets — chart not ready?");
    }
  }, []); // stable — always reads from refs

  // Redraw when data or showRange changes
  useEffect(() => {
    requestAnimationFrame(drawDepth);
  }, [data, showRange, drawDepth]);

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

  // ── Init chart ───────────────────────────────────────────────────────────
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
          rightPriceScale: { borderColor: "#21262d", textColor: "#6b7280",
            scaleMargins: { top: 0.08, bottom: 0.22 } },
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

        // Subscribe — always calls current drawDepth (stable ref)
        chart.timeScale().subscribeVisibleLogicalRangeChange(() => requestAnimationFrame(drawDepth));
        chart.subscribeCrosshairMove(() => requestAnimationFrame(drawDepth));
      }
    );

    const handleResize = () => {
      if (!chartRef.current || !containerRef.current) return;
      chartRef.current.applyOptions({
        width:  containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
      requestAnimationFrame(drawDepth);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      chart?.remove();
      chartRef.current = candleSeriesRef.current = volumeSeriesRef.current = null;
    };
  // drawDepth is stable (no deps in useCallback)
  }, [drawDepth]);

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

    // Wait for chart to finish fitting before drawing depth
    setTimeout(() => requestAnimationFrame(drawDepth), 150);
  }, [candles, drawDepth]);

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

      {/* Chart + canvas overlay */}
      <div ref={containerRef} className="relative flex-1 min-h-0" style={{ background: "#0d1117" }}>
        {/* Canvas for depth bars — sits on top of chart, pointer-events:none */}
        <canvas ref={canvasRef} className="absolute inset-0 z-10"
          style={{ pointerEvents: "none" }} />

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
        <span className="text-[9px] text-gray-700">Liquidity overlay:</span>
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

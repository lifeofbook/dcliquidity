"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { AggregatedLiquidity } from "@/types";
import { formatPrice, formatUsd } from "@/lib/aggregator";

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Props {
  mint: string;
  data: AggregatedLiquidity;
  showRange?: number;
}

const RESOLUTIONS = [
  { label: "1m", value: "1" },
  { label: "5m", value: "5" },
  { label: "15m", value: "15" },
  { label: "1H", value: "60" },
  { label: "4H", value: "240" },
  { label: "1D", value: "1440" },
];

const SOURCE_COLORS: Record<string, string> = {
  meteora: "#f97316",
  raydium: "#8b5cf6",
  orca: "#06b6d4",
  jupiterLimit: "#22c55e",
  jupiterDca: "#eab308",
  pumpfun: "#ec4899",
};

const SOURCE_LABELS: Record<string, string> = {
  meteora: "Meteora",
  raydium: "Raydium",
  orca: "Orca",
  jupiterLimit: "Jup Limit",
  jupiterDca: "Jup DCA",
  pumpfun: "Pump.fun",
};

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

export default function PriceChart({ mint, data, showRange = 20 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candleSeriesRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const volumeSeriesRef = useRef<any>(null);
  const [resolution, setResolution] = useState("60");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Draw depth bars on canvas ──────────────────────────────────────────────
  const drawDepth = useCallback(() => {
    const canvas = canvasRef.current;
    const series = candleSeriesRef.current;
    if (!canvas || !series || !data) return;

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    if (W === 0 || H === 0) return;

    // Resize canvas buffer if needed
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const { buckets, currentPrice } = data;
    const visible = buckets.filter(
      (b) => b.index >= -showRange && b.index <= showRange
    );
    const maxUsd = Math.max(...visible.map((b) => b.totalUsd), 1);

    // Max bar width: 22% of chart width, at least 60px
    const MAX_BAR_W = Math.max(60, W * 0.22);

    for (const bucket of visible) {
      if (bucket.totalUsd <= 0) continue;

      const y = series.priceToCoordinate(bucket.priceMid);
      if (y === null || y < 0 || y > H) continue;

      const isCurrent = bucket.index === 0;
      const isSupport = bucket.index < 0;
      const barW = (bucket.totalUsd / maxUsd) * MAX_BAR_W;

      // Bar height: thicker at current price, support slightly thicker than resistance
      const barH = isCurrent ? 4 : isSupport ? 3 : 2;

      // Dominant source color
      const dominant = Object.entries(bucket.sources)
        .filter(([, v]) => v > 0)
        .sort(([, a], [, b]) => b - a)[0];

      const colorHex = dominant ? (SOURCE_COLORS[dominant[0]] ?? "#6b7280") : "#6b7280";
      const [r, g, b2] = hexToRgb(colorHex);

      // Support bars are bright/solid, resistance are faded
      const alpha = isCurrent ? 1 : isSupport ? 0.82 : 0.35;

      ctx.fillStyle = `rgba(${r},${g},${b2},${alpha})`;
      // Draw from RIGHT edge extending LEFT
      ctx.fillRect(W - barW, y - barH / 2, barW, barH);
    }

    // Current price dashed line across full chart width
    const currentY = series.priceToCoordinate(currentPrice);
    if (currentY !== null && currentY >= 0 && currentY <= H) {
      ctx.strokeStyle = "#facc15";
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.8;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(0, currentY);
      ctx.lineTo(W, currentY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }, [data, showRange]);

  // ── Fetch OHLCV ───────────────────────────────────────────────────────────
  const fetchCandles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ohlcv?mint=${mint}&resolution=${resolution}`);
      if (!res.ok) {
        const j = await res.json();
        setError(j.error ?? "Failed to load chart data");
        return;
      }
      const j = await res.json();
      setCandles(j.candles ?? []);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [mint, resolution]);

  useEffect(() => {
    fetchCandles();
  }, [fetchCandles]);

  // ── Init lightweight-charts ───────────────────────────────────────────────
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
            fontFamily: "ui-monospace, 'Courier New', monospace",
          },
          grid: {
            vertLines: { color: "#1a2030" },
            horzLines: { color: "#1a2030" },
          },
          crosshair: {
            vertLine: { color: "#374151", labelBackgroundColor: "#1f2937" },
            horzLine: { color: "#374151", labelBackgroundColor: "#1f2937" },
          },
          rightPriceScale: {
            borderColor: "#21262d",
            textColor: "#6b7280",
            scaleMargins: { top: 0.08, bottom: 0.22 },
          },
          timeScale: {
            borderColor: "#21262d",
            timeVisible: true,
            secondsVisible: false,
            barSpacing: 8,
          },
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });

        const candleSeries = chart.addSeries(CandlestickSeries, {
          upColor: "#22c55e",
          downColor: "#ef4444",
          borderUpColor: "#22c55e",
          borderDownColor: "#ef4444",
          wickUpColor: "#22c55e",
          wickDownColor: "#ef4444",
        });

        const volumeSeries = chart.addSeries(HistogramSeries, {
          priceFormat: { type: "volume" },
          priceScaleId: "vol",
        });
        chart.priceScale("vol").applyOptions({
          scaleMargins: { top: 0.8, bottom: 0 },
        });

        chartRef.current = chart;
        candleSeriesRef.current = candleSeries;
        volumeSeriesRef.current = volumeSeries;

        // Redraw depth canvas whenever chart scrolls or zooms
        chart.timeScale().subscribeVisibleLogicalRangeChange(drawDepth);
        chart.subscribeCrosshairMove(drawDepth);
      }
    );

    const handleResize = () => {
      if (chartRef.current && containerRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
        requestAnimationFrame(drawDepth);
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart?.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load candle data ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || candles.length === 0) return;

    const candleData = candles.map((c) => ({
      time: c.time as import("lightweight-charts").UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    const volumeData = candles.map((c) => ({
      time: c.time as import("lightweight-charts").UTCTimestamp,
      value: c.volume,
      color: c.close >= c.open ? "#22c55e44" : "#ef444444",
    }));

    candleSeriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);
    chartRef.current?.timeScale().fitContent();
    // Redraw depth after candles load
    requestAnimationFrame(drawDepth);
  }, [candles, drawDepth]);

  // ── Redraw depth when data/range changes ─────────────────────────────────
  useEffect(() => {
    requestAnimationFrame(drawDepth);
  }, [drawDepth]);

  const activeSources = Object.entries(SOURCE_COLORS).filter(
    ([src]) => (data.sourceBreakdown[src as keyof typeof data.sourceBreakdown] ?? 0) > 0
  );

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div
        className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-[#1a2030]"
        style={{ background: "#0d1117" }}
      >
        <div className="flex items-center gap-0.5">
          {RESOLUTIONS.map((r) => (
            <button
              key={r.value}
              onClick={() => setResolution(r.value)}
              className={`text-[11px] px-2 py-0.5 rounded transition-colors font-mono ${
                resolution === r.value
                  ? "bg-[#f97316] text-white"
                  : "text-gray-600 hover:text-white hover:bg-[#1f2937]"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="text-[10px] text-gray-600 font-mono">
          {data.token.symbol}/USD · {formatPrice(data.currentPrice)}
        </div>
      </div>

      {/* Chart + depth canvas overlay */}
      <div className="relative flex-1 min-h-0">
        {/* lightweight-charts fills the container */}
        <div ref={containerRef} className="absolute inset-0" />

        {/* Canvas overlay: depth bars drawn here (pointer-events: none) */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ pointerEvents: "none" }}
        />

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0d1117]/80 z-10">
            <div className="flex flex-col items-center gap-2">
              <div className="w-5 h-5 border-2 border-[#f97316] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-gray-500">Loading chart…</span>
            </div>
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="text-center">
              <p className="text-gray-500 text-sm mb-2">{error}</p>
              <button onClick={fetchCandles} className="text-xs text-[#f97316] hover:underline">
                Retry
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Legend strip */}
      <div
        className="shrink-0 flex items-center flex-wrap gap-x-3 gap-y-0.5 px-3 py-1 border-t border-[#1a2030]"
        style={{ background: "#090c12" }}
      >
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

"use client";

import { useEffect, useRef, useState, useCallback } from "react"; // useCallback used by fetchCandles
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

export default function PriceChart({ mint, data, showRange = 20 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
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

  // Fetch OHLCV data
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

  // Init chart
  useEffect(() => {
    if (!containerRef.current) return;
    let chart: ReturnType<typeof import("lightweight-charts")["createChart"]>;

    import("lightweight-charts").then(({ createChart, CandlestickSeries, HistogramSeries, ColorType }) => {
      if (!containerRef.current) return;

      chart = createChart(containerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: "#0d1117" },
          textColor: "#6b7280",
          fontFamily: "ui-monospace, 'Courier New', monospace",
        },
        grid: {
          vertLines: { color: "#21262d" },
          horzLines: { color: "#21262d" },
        },
        crosshair: {
          vertLine: { color: "#374151", labelBackgroundColor: "#1f2937" },
          horzLine: { color: "#374151", labelBackgroundColor: "#1f2937" },
        },
        rightPriceScale: {
          borderColor: "#21262d",
          textColor: "#6b7280",
          scaleMargins: { top: 0.1, bottom: 0.25 },
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
        color: "#22c55e",
        priceFormat: { type: "volume" },
        priceScaleId: "vol",
      });
      chart.priceScale("vol").applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });

      chartRef.current = chart;
      candleSeriesRef.current = candleSeries;
      volumeSeriesRef.current = volumeSeries;

      // (price range sync hook placeholder — subscribeVisibleLogicalRangeChange)
    });

    const handleResize = () => {
      if (chartRef.current && containerRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
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

  // Update candle data when candles change
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
  }, [candles]);

  // Draw/redraw liquidity overlay whenever data changes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const liqLinesRef = useRef<any[]>([]);
  useEffect(() => {
    if (!candleSeriesRef.current || !data) return;

    // Remove old lines
    liqLinesRef.current.forEach((line) => {
      try { candleSeriesRef.current?.removePriceLine(line); } catch { /* ignore */ }
    });
    liqLinesRef.current = [];

    const { buckets, currentPrice } = data;
    const rangeBuckets = buckets
      .filter((b) => b.index >= -showRange && b.index <= showRange && b.totalUsd > 0)
      .sort((a, b) => b.totalUsd - a.totalUsd);

    // Only draw lines for levels that have meaningful liquidity (avoid clutter)
    const threshold = rangeBuckets[0]?.totalUsd ?? 0;
    const minToShow = threshold * 0.05; // only show levels ≥ 5% of max
    const maxUsd = threshold || 1;

    const visibleBuckets = rangeBuckets.filter((b) => b.totalUsd >= minToShow);

    visibleBuckets.forEach((bucket) => {
      const dominantSource = Object.entries(bucket.sources).sort(([, a], [, b]) => b - a)[0];
      const color = dominantSource ? (SOURCE_COLORS[dominantSource[0]] ?? "#4b5563") : "#4b5563";
      // lineWidth 1-4, stronger levels are thicker
      const strength = bucket.totalUsd / maxUsd;
      const thickness = strength > 0.75 ? 4 : strength > 0.45 ? 3 : strength > 0.2 ? 2 : 1;

      const line = candleSeriesRef.current.createPriceLine({
        price: bucket.priceMid,
        // Support (below price) solid, resistance more transparent
        color: bucket.index < 0 ? `${color}dd` : `${color}66`,
        lineWidth: thickness,
        lineStyle: 0, // solid
        axisLabelVisible: false,
        title: "",
      });
      liqLinesRef.current.push(line);
    });

    // Current price
    const currLine = candleSeriesRef.current.createPriceLine({
      price: currentPrice,
      color: "#facc15",
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: formatPrice(currentPrice),
    });
    liqLinesRef.current.push(currLine);
  }, [data, showRange]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#21262d] shrink-0">
        <div className="flex items-center gap-1">
          {RESOLUTIONS.map((r) => (
            <button
              key={r.value}
              onClick={() => setResolution(r.value)}
              className={`text-xs px-2.5 py-1 rounded transition-colors font-mono ${
                resolution === r.value
                  ? "bg-[#f97316] text-white"
                  : "text-gray-500 hover:text-white hover:bg-[#1f2937]"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="text-[11px] text-gray-600 font-mono">
          {data.token.symbol}/USD · {formatPrice(data.currentPrice)}
        </div>
      </div>

      {/* Chart area */}
      <div className="relative flex-1 min-h-0">
        {/* Lightweight Charts container */}
        <div ref={containerRef} className="w-full h-full" />

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0d1117]/80 z-10">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-[#f97316] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-gray-500">Loading chart…</span>
            </div>
          </div>
        )}

        {/* Error overlay */}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="text-center">
              <p className="text-gray-500 text-sm mb-2">{error}</p>
              <button
                onClick={fetchCandles}
                className="text-xs text-[#f97316] hover:underline"
              >
                Retry
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mini legend */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-t border-[#21262d] shrink-0 flex-wrap">
        <span className="text-[10px] text-gray-600">Liquidity overlay:</span>
        {Object.entries(SOURCE_COLORS).map(([src, color]) => {
          const total = data.sourceBreakdown[src as keyof typeof data.sourceBreakdown];
          if (!total || total <= 0) return null;
          return (
            <div key={src} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm" style={{ background: color }} />
              <span className="text-[10px] text-gray-500 capitalize">
                {src === "jupiterLimit" ? "Jup Limit" : src === "jupiterDca" ? "Jup DCA" : src === "pumpfun" ? "Pump.fun" : src.charAt(0).toUpperCase() + src.slice(1)}
                {" "}<span className="text-gray-600">({formatUsd(total)})</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

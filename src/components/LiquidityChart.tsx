"use client";

import { useEffect, useRef } from "react";
import type { AggregatedLiquidity } from "@/types";
import { formatUsd, formatPrice } from "@/lib/aggregator";

interface Props {
  data: AggregatedLiquidity;
  showRange?: number;
}

const SOURCE_ORDER = ["meteora", "raydium", "orca", "jupiterLimit", "jupiterDca", "pumpfun"] as const;

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

// Fixed max bar pixel width — bars extend only as far as data warrants
const MAX_BAR_PX = 180;

export default function LiquidityChart({ data, showRange = 20 }: Props) {
  const { buckets, currentPrice, sourceBreakdown } = data;
  const currentRowRef = useRef<HTMLDivElement>(null);

  // Rows: high price at top, current price in middle, low price at bottom
  const rows = buckets
    .filter((b) => b.index >= -showRange && b.index <= showRange)
    .sort((a, b) => b.index - a.index);

  // Use the ACTUAL max value across visible rows for scaling
  const maxUsd = Math.max(...rows.map((r) => r.totalUsd), 1);

  // Auto-scroll to current price row when data loads
  useEffect(() => {
    currentRowRef.current?.scrollIntoView({ block: "center", behavior: "instant" });
  }, [currentPrice, showRange]);

  const activeSources = SOURCE_ORDER.filter(
    (s) => (sourceBreakdown[s] ?? 0) > 0
  );

  return (
    <div className="flex flex-col h-full select-none">
      {/* Scrollable rows */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {rows.map((row) => {
          const isCurrent = row.index === 0;
          const isSupport = row.index < 0;
          const barPx = (row.totalUsd / maxUsd) * MAX_BAR_PX;

          return (
            <div
              key={row.index}
              ref={isCurrent ? currentRowRef : undefined}
              className="flex items-center"
              style={{
                height: isCurrent ? 18 : 12,
                background: isCurrent
                  ? "rgba(250,204,21,0.12)"
                  : isSupport
                  ? "rgba(34,197,94,0.018)"
                  : "rgba(239,68,68,0.012)",
                borderBottom: isCurrent
                  ? "1px solid rgba(250,204,21,0.3)"
                  : "1px solid rgba(255,255,255,0.03)",
              }}
            >
              {/* Price label — fixed width, right-aligned */}
              <div
                className="shrink-0 text-right pr-1.5 font-mono"
                style={{
                  width: 88,
                  fontSize: isCurrent ? 10 : 8.5,
                  color: isCurrent
                    ? "#facc15"
                    : isSupport
                    ? "#4ade8088"
                    : "#f8717166",
                  fontWeight: isCurrent ? 700 : 400,
                  letterSpacing: "-0.02em",
                }}
              >
                {isCurrent && <span className="mr-0.5">▶</span>}
                {formatPrice(row.priceMid)}
              </div>

              {/* Bar area */}
              <div className="flex items-center" style={{ width: MAX_BAR_PX + 4 }}>
                {row.totalUsd > 0 && (
                  <div
                    className="flex items-center overflow-hidden"
                    style={{
                      width: Math.max(barPx, 1),
                      height: isCurrent ? 9 : isSupport ? 6 : 3,
                    }}
                  >
                    {/* Stacked segments per DEX source */}
                    {SOURCE_ORDER.map((src) => {
                      const val = row.sources[src] ?? 0;
                      if (val <= 0) return null;
                      const segPct = (val / row.totalUsd) * 100;
                      return (
                        <div
                          key={src}
                          title={`${SOURCE_LABELS[src]}: ${formatUsd(val)}`}
                          style={{
                            width: `${segPct}%`,
                            height: "100%",
                            background: SOURCE_COLORS[src],
                            opacity: isCurrent ? 1 : isSupport ? 0.9 : 0.5,
                            flexShrink: 0,
                          }}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div
        className="shrink-0 px-2 py-1.5 border-t border-[#1a2030] space-y-1"
        style={{ background: "#090c12" }}
      >
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {activeSources.map((src) => {
            const total = sourceBreakdown[src] ?? 0;
            if (total <= 0) return null;
            return (
              <span key={src} className="flex items-center gap-1 text-[10px] text-gray-500">
                <span
                  className="inline-block rounded-full"
                  style={{ width: 7, height: 7, background: SOURCE_COLORS[src] }}
                />
                {SOURCE_LABELS[src]} ({formatUsd(total)})
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

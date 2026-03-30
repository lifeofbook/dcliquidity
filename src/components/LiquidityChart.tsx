"use client";

import { useEffect, useRef } from "react";
import type { AggregatedLiquidity, LiquidityBucket } from "@/types";
import { formatUsd, formatPrice } from "@/lib/aggregator";

interface Props {
  data: AggregatedLiquidity;
  showRange?: number;
}

const SOURCE_COLORS: Record<string, string> = {
  meteora: "#f97316",
  raydium: "#8b5cf6",
  orca: "#06b6d4",
  jupiterLimit: "#22c55e",
  jupiterDca: "#eab308",
  pumpfun: "#ec4899",
};

const SOURCE_ORDER = ["meteora", "raydium", "orca", "jupiterLimit", "jupiterDca", "pumpfun"];

const SOURCE_LABELS: Record<string, string> = {
  meteora: "Meteora",
  raydium: "Raydium",
  orca: "Orca",
  jupiterLimit: "Jup Limit",
  jupiterDca: "Jup DCA",
  pumpfun: "Pump.fun",
};

interface RowData extends LiquidityBucket {
  priceLabel: string;
  isSupport: boolean;
  isCurrent: boolean;
}

export default function LiquidityChart({ data, showRange = 20 }: Props) {
  const { buckets, currentPrice, sourceBreakdown } = data;
  const currentRowRef = useRef<HTMLDivElement>(null);

  // Auto-scroll so current price is visible in center
  useEffect(() => {
    currentRowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [currentPrice, showRange]);

  const rows: RowData[] = buckets
    .filter((b) => b.index >= -showRange && b.index <= showRange)
    .sort((a, b) => b.index - a.index) // high price at top
    .map((b) => ({
      ...b,
      priceLabel: formatPrice(b.priceMid),
      isSupport: b.index < 0,
      isCurrent: b.index === 0,
    }));

  // Max USD for bar width scaling
  const maxUsd = Math.max(...rows.map((r) => r.totalUsd), 1);

  // Legend: sources that have any liquidity
  const activeSources = SOURCE_ORDER.filter(
    (s) => (sourceBreakdown[s as keyof typeof sourceBreakdown] ?? 0) > 0
  );

  return (
    <div className="flex flex-col h-full">
      {/* Column headers */}
      <div
        className="shrink-0 flex items-center gap-1 px-2 py-1 border-b border-[#1a2030]"
        style={{ background: "#0a0d14" }}
      >
        <span className="text-[9px] text-gray-700 font-mono" style={{ width: 80 }}>
          ↑ Price (USD)
        </span>
        <span className="text-[9px] text-gray-700">Liquidity (USD) →</span>
      </div>

      {/* Scrollable rows */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {rows.map((row) => {
          const isCurrent = row.isCurrent;
          const isSupport = row.isSupport;

          // Row background
          const rowBg = isCurrent
            ? "rgba(250,204,21,0.10)"
            : isSupport
            ? "rgba(34,197,94,0.025)"
            : "rgba(239,68,68,0.018)";

          // Price label color
          const labelColor = isCurrent
            ? "#facc15"
            : isSupport
            ? "#4ade8099"
            : "#f8717166";

          return (
            <div
              key={row.index}
              ref={isCurrent ? currentRowRef : undefined}
              className="flex items-center gap-1 border-b"
              style={{
                height: 13,
                background: rowBg,
                borderBottomColor: isCurrent ? "#facc1530" : "#ffffff06",
                borderBottomWidth: 1,
              }}
            >
              {/* Price label */}
              <span
                className="shrink-0 text-right font-mono select-none"
                style={{
                  width: 82,
                  fontSize: 9,
                  color: labelColor,
                  paddingRight: 4,
                  fontWeight: isCurrent ? 700 : 400,
                }}
              >
                {isCurrent ? "▶ " : ""}
                {row.priceLabel}
              </span>

              {/* Stacked bars */}
              <div className="flex items-center h-full" style={{ flex: 1 }}>
                {SOURCE_ORDER.map((src) => {
                  const val = row.sources[src as keyof typeof row.sources] ?? 0;
                  if (val < maxUsd * 0.0005) return null; // skip near-zero
                  const widthPct = (val / maxUsd) * 100;
                  const barH = isCurrent ? 8 : isSupport ? 7 : 4;
                  const opacity = isCurrent ? 1 : isSupport ? 0.88 : 0.38;
                  return (
                    <div
                      key={src}
                      title={`${SOURCE_LABELS[src]}: ${formatUsd(val)}`}
                      style={{
                        width: `${widthPct}%`,
                        height: barH,
                        background: SOURCE_COLORS[src],
                        opacity,
                        flexShrink: 0,
                      }}
                    />
                  );
                })}
                {/* Dollar amount on right for current price and strongest levels */}
                {(isCurrent || row.totalUsd >= maxUsd * 0.5) && row.totalUsd > 0 && (
                  <span
                    className="ml-1 font-mono"
                    style={{ fontSize: 8, color: isCurrent ? "#facc15" : "#6b7280" }}
                  >
                    {formatUsd(row.totalUsd)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div
        className="shrink-0 px-2 py-2 border-t border-[#1a2030] space-y-1"
        style={{ background: "#0a0d14" }}
      >
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {activeSources.map((src) => {
            const total = sourceBreakdown[src as keyof typeof sourceBreakdown] ?? 0;
            return (
              <div key={src} className="flex items-center gap-1">
                <span
                  className="rounded-full shrink-0"
                  style={{ width: 7, height: 7, background: SOURCE_COLORS[src] }}
                />
                <span className="text-[10px] text-gray-500">
                  {SOURCE_LABELS[src]}{" "}
                  <span className="text-gray-600">({formatUsd(total)})</span>
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-[9px] text-gray-700">
          ⟵ Bar lebih panjang = level support/resistance lebih kuat
        </p>
      </div>
    </div>
  );
}

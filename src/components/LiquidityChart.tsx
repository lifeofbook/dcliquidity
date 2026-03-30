"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  Legend,
} from "recharts";
import type { AggregatedLiquidity, LiquidityBucket } from "@/types";
import { formatUsd, formatPrice } from "@/lib/aggregator";

interface Props {
  data: AggregatedLiquidity;
  showRange?: number; // how many buckets on each side to show (default 30)
}

const SOURCE_COLORS: Record<string, string> = {
  meteora: "#f97316",   // orange
  raydium: "#8b5cf6",   // purple
  orca: "#06b6d4",      // cyan
  jupiterLimit: "#22c55e", // green
  jupiterDca: "#eab308",   // yellow
  pumpfun: "#ec4899",      // pink
};

const SOURCE_LABELS: Record<string, string> = {
  meteora: "Meteora DLMM",
  raydium: "Raydium",
  orca: "Orca",
  jupiterLimit: "Jupiter Limit",
  jupiterDca: "Jupiter DCA",
  pumpfun: "Pump.fun",
};

interface ChartEntry extends LiquidityBucket {
  isSupport: boolean;
  label: string;
}

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) => {
  if (!active || !payload?.length) return null;

  const total = payload.reduce((s, p) => s + (p.value || 0), 0);

  return (
    <div className="bg-[#1a1f2e] border border-[#2a3142] rounded-lg p-3 text-xs shadow-xl min-w-[160px]">
      <p className="text-gray-400 mb-2">{label}</p>
      {payload.map((p) =>
        p.value > 0 ? (
          <div key={p.name} className="flex justify-between gap-4 mb-1">
            <span style={{ color: p.color }}>{SOURCE_LABELS[p.name] ?? p.name}</span>
            <span className="text-white font-medium">{formatUsd(p.value)}</span>
          </div>
        ) : null
      )}
      <div className="border-t border-[#2a3142] mt-2 pt-2 flex justify-between">
        <span className="text-gray-400">Total</span>
        <span className="text-white font-bold">{formatUsd(total)}</span>
      </div>
    </div>
  );
};

export default function LiquidityChart({ data, showRange = 30 }: Props) {
  const { buckets, currentPrice } = data;

  // Filter to visible range and build chart data
  const visibleBuckets: ChartEntry[] = buckets
    .filter((b) => b.index >= -showRange && b.index <= showRange)
    .map((b) => ({
      ...b,
      isSupport: b.index < 0,
      label: `${b.index > 0 ? "+" : ""}${b.index}% (${formatPrice(b.priceMid)})`,
    }));

  const maxLiquidity = Math.max(...visibleBuckets.map((b) => b.totalUsd), 1);

  return (
    <div className="w-full">
      {/* Current price marker */}
      <div className="flex items-center justify-between mb-3 px-1">
        <span className="text-xs text-gray-500">
          Support ← {formatPrice(currentPrice)} → Resistance
        </span>
        <span className="text-xs text-gray-500">Liquidity (USD)</span>
      </div>

      <ResponsiveContainer width="100%" height={340}>
        <BarChart
          data={visibleBuckets}
          margin={{ top: 4, right: 4, left: 4, bottom: 4 }}
          barCategoryGap="2%"
        >
          <XAxis
            dataKey="label"
            tick={false}
            axisLine={{ stroke: "#2a3142" }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => formatUsd(v)}
            tick={{ fill: "#6b7280", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={60}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />

          {/* Current price line */}
          <ReferenceLine x={`0% (${formatPrice(currentPrice)})`} stroke="#facc15" strokeWidth={2} />

          {/* Stacked bars per source */}
          {Object.keys(SOURCE_COLORS).map((src) => (
            <Bar key={src} dataKey={`sources.${src}`} name={src} stackId="liq" fill={SOURCE_COLORS[src]}>
              {visibleBuckets.map((entry, idx) => (
                <Cell
                  key={`cell-${idx}`}
                  fill={SOURCE_COLORS[src]}
                  fillOpacity={entry.isSupport ? 0.85 : 0.65}
                />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-3 px-1">
        {Object.entries(SOURCE_COLORS).map(([src, color]) => {
          const total = data.sourceBreakdown[src as keyof typeof data.sourceBreakdown];
          if (total <= 0) return null;
          return (
            <div key={src} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: color }} />
              <span className="text-xs text-gray-400">
                {SOURCE_LABELS[src]} <span className="text-gray-500">({formatUsd(total)})</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

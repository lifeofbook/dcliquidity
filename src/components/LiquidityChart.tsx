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
} from "recharts";
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

const SOURCE_LABELS: Record<string, string> = {
  meteora: "Meteora DLMM",
  raydium: "Raydium",
  orca: "Orca",
  jupiterLimit: "Jupiter Limit",
  jupiterDca: "Jupiter DCA",
  pumpfun: "Pump.fun",
};

interface ChartRow {
  price: string;
  priceMid: number;
  index: number;
  totalUsd: number;
  isSupport: boolean;
  isCurrentPrice: boolean;
  sources: Record<string, number>;
}

const CustomTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartRow; name: string; value: number; color: string }>;
}) => {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const total = row.totalUsd;
  if (total <= 0) return null;

  const side = row.isSupport ? "Support" : "Resistance";
  const sideColor = row.isSupport ? "#22c55e" : "#ef4444";

  return (
    <div className="bg-[#12161f] border border-[#2a3142] rounded-lg p-3 text-xs shadow-2xl min-w-[180px]">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono text-white font-semibold">{row.price}</span>
        <span style={{ color: sideColor }} className="text-[10px]">
          {row.index > 0 ? "+" : ""}{row.index}%
        </span>
      </div>
      <div className="flex justify-between mb-2">
        <span style={{ color: sideColor }}>{side}</span>
        <span className="text-white font-bold">{formatUsd(total)}</span>
      </div>
      {Object.entries(row.sources)
        .filter(([, v]) => v > 0)
        .sort(([, a], [, b]) => b - a)
        .map(([src, val]) => (
          <div key={src} className="flex justify-between gap-3 text-[10px] mb-0.5">
            <span style={{ color: SOURCE_COLORS[src] ?? "#9ca3af" }}>
              {SOURCE_LABELS[src] ?? src}
            </span>
            <span className="text-gray-300">{formatUsd(val)}</span>
          </div>
        ))}
    </div>
  );
};

export default function LiquidityChart({ data, showRange = 30 }: Props) {
  const { buckets, currentPrice } = data;

  // Build rows sorted from highest price (top) to lowest price (bottom)
  const rows: ChartRow[] = buckets
    .filter((b) => b.index >= -showRange && b.index <= showRange)
    .sort((a, b) => b.index - a.index) // descending: high price at top
    .map((b: LiquidityBucket) => ({
      price: formatPrice(b.priceMid),
      priceMid: b.priceMid,
      index: b.index,
      totalUsd: b.totalUsd,
      isSupport: b.index < 0,
      isCurrentPrice: b.index === 0,
      sources: { ...b.sources },
    }));

  const maxLiq = Math.max(...rows.map((r) => r.totalUsd), 1);

  // Find the current price row label for ReferenceLine
  const currentRow = rows.find((r) => r.index === 0);
  const currentRowLabel = currentRow?.price ?? formatPrice(currentPrice);

  return (
    <div className="w-full flex flex-col gap-3">
      {/* Axis labels */}
      <div className="flex items-center justify-between px-1 text-[11px] text-gray-500">
        <span>↑ Price (USD)</span>
        <span>Liquidity (USD) →</span>
      </div>

      <ResponsiveContainer width="100%" height={Math.max(rows.length * 10, 380)}>
        <BarChart
          layout="vertical"
          data={rows}
          margin={{ top: 2, right: 16, left: 0, bottom: 2 }}
          barCategoryGap="4%"
          barSize={10}
        >
          {/* X-axis = liquidity amount */}
          <XAxis
            type="number"
            tickFormatter={(v) => formatUsd(v)}
            tick={{ fill: "#6b7280", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            domain={[0, maxLiq * 1.05]}
          />

          {/* Y-axis = price level */}
          <YAxis
            type="category"
            dataKey="price"
            width={90}
            tick={({ x, y, payload, index }) => {
              const row = rows[index];
              if (!row) return <g />;
              const isCurrentPrice = row.isCurrentPrice;
              const color = isCurrentPrice
                ? "#facc15"
                : row.isSupport
                ? "#9ca3af"
                : "#9ca3af";
              const weight = isCurrentPrice ? "700" : "400";
              return (
                <text
                  x={x}
                  y={y}
                  dy={4}
                  textAnchor="end"
                  fill={color}
                  fontSize={isCurrentPrice ? 11 : 10}
                  fontWeight={weight}
                  fontFamily="monospace"
                >
                  {isCurrentPrice ? `▶ ${payload.value}` : payload.value}
                </text>
              );
            }}
            tickLine={false}
            axisLine={false}
            interval={Math.floor(rows.length / 8)}
          />

          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
          />

          {/* Current price horizontal reference line */}
          <ReferenceLine
            y={currentRowLabel}
            stroke="#facc15"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />

          {/* Stacked bars per source */}
          {Object.entries(SOURCE_COLORS).map(([src, color]) => (
            <Bar
              key={src}
              dataKey={`sources.${src}`}
              name={src}
              stackId="liq"
              fill={color}
              isAnimationActive={false}
            >
              {rows.map((row, idx) => (
                <Cell
                  key={`${src}-${idx}`}
                  fill={color}
                  fillOpacity={
                    row.totalUsd === 0
                      ? 0
                      : row.isCurrentPrice
                      ? 1
                      : row.isSupport
                      ? 0.82
                      : 0.6
                  }
                />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>

      {/* Scale legend bottom */}
      <div className="flex items-center gap-2 px-1">
        <div className="flex-1 h-1 rounded-full" style={{
          background: "linear-gradient(to right, transparent, #22c55e40, #22c55e80)",
        }} />
        <span className="text-[10px] text-gray-600">Support (below price)</span>
        <div className="flex-1 h-1 rounded-full" style={{
          background: "linear-gradient(to right, #f9731640, #f9731680, transparent)",
        }} />
        <span className="text-[10px] text-gray-600">Resistance (above)</span>
      </div>

      {/* Source legend */}
      <div className="flex flex-wrap gap-3 px-1">
        {Object.entries(SOURCE_COLORS).map(([src, color]) => {
          const total = data.sourceBreakdown[src as keyof typeof data.sourceBreakdown];
          if (!total || total <= 0) return null;
          return (
            <div key={src} className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ background: color }}
              />
              <span className="text-xs text-gray-400">
                {SOURCE_LABELS[src]}{" "}
                <span className="text-gray-500">({formatUsd(total)})</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

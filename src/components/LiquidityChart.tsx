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
  showRange?: number; // ±N%
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

interface ChartRow extends LiquidityBucket {
  priceLabel: string;
  isSupport: boolean;
}

// Custom Y-axis tick — only show label every N rows
const PriceTick = ({
  x, y, payload, rows, showRange,
}: {
  x?: number | string;
  y?: number | string;
  payload?: { value: string };
  rows?: ChartRow[];
  showRange?: number;
}) => {
  const nx = typeof x === "string" ? parseFloat(x) : (x ?? 0);
  const ny = typeof y === "string" ? parseFloat(y) : (y ?? 0);
  if (!payload || x === undefined || y === undefined) return null;
  const row = rows?.find(r => r.priceLabel === payload.value);
  if (!row) return null;

  const isCurrentPrice = row.index === 0;
  // Show every N rows depending on total rows
  const interval = Math.max(1, Math.floor((showRange ?? 30) / 8));
  if (!isCurrentPrice && Math.abs(row.index) % interval !== 0) return null;

  return (
    <text
      x={nx - 4}
      y={ny}
      dy={4}
      textAnchor="end"
      fill={isCurrentPrice ? "#facc15" : "#6b7280"}
      fontSize={isCurrentPrice ? 11 : 9}
      fontWeight={isCurrentPrice ? 700 : 400}
      fontFamily="'Courier New', monospace"
    >
      {isCurrentPrice ? `▶ ${payload.value}` : payload.value}
    </text>
  );
};

const CustomTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartRow }>;
}) => {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  if (row.totalUsd <= 0 && row.index !== 0) return null;

  return (
    <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-3 text-xs shadow-2xl min-w-[190px]">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-white font-semibold">{row.priceLabel}</span>
        <span className={`text-[10px] ml-2 ${row.index === 0 ? "text-yellow-400" : row.isSupport ? "text-green-400" : "text-red-400"}`}>
          {row.index === 0 ? "Current" : `${row.index > 0 ? "+" : ""}${row.index}%`}
        </span>
      </div>
      {row.totalUsd > 0 && (
        <>
          <div className="flex justify-between mb-2 pb-1 border-b border-[#21262d]">
            <span className={row.isSupport ? "text-green-400" : "text-red-400"}>
              {row.isSupport ? "Support" : "Resistance"}
            </span>
            <span className="text-white font-bold">{formatUsd(row.totalUsd)}</span>
          </div>
          {Object.entries(row.sources)
            .filter(([, v]) => v > 0)
            .sort(([, a], [, b]) => b - a)
            .map(([src, val]) => (
              <div key={src} className="flex justify-between gap-3 mb-0.5">
                <span style={{ color: SOURCE_COLORS[src] ?? "#9ca3af" }}>
                  {SOURCE_LABELS[src] ?? src}
                </span>
                <span className="text-gray-300">{formatUsd(val)}</span>
              </div>
            ))}
        </>
      )}
    </div>
  );
};

export default function LiquidityChart({ data, showRange = 30 }: Props) {
  const { buckets, currentPrice } = data;

  const rows: ChartRow[] = buckets
    .filter((b) => b.index >= -showRange && b.index <= showRange)
    .sort((a, b) => b.index - a.index) // high price at top
    .map((b: LiquidityBucket) => ({
      ...b,
      priceLabel: formatPrice(b.priceMid),
      isSupport: b.index < 0,
    }));

  const currentPriceLabel = rows.find(r => r.index === 0)?.priceLabel ?? formatPrice(currentPrice);

  return (
    <div className="w-full flex flex-col gap-2">
      <div className="flex items-center justify-between text-[11px] text-gray-500 px-1">
        <span>↑ Price (USD)</span>
        <span>Liquidity (USD) →</span>
      </div>

      <ResponsiveContainer width="100%" height={Math.min(Math.max(rows.length * 9, 300), 700)}>
        <BarChart
          layout="vertical"
          data={rows}
          margin={{ top: 4, right: 20, left: 4, bottom: 4 }}
          barSize={7}
          barCategoryGap="8%"
        >
          <XAxis
            type="number"
            tickFormatter={(v) => formatUsd(v)}
            tick={{ fill: "#4b5563", fontSize: 10 }}
            axisLine={{ stroke: "#21262d" }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="priceLabel"
            width={100}
            tick={(props) => (
              <PriceTick
                {...props}
                rows={rows}
                showRange={showRange}
              />
            )}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: "rgba(255,255,255,0.025)" }}
          />
          <ReferenceLine
            y={currentPriceLabel}
            stroke="#facc15"
            strokeWidth={1.5}
            strokeDasharray="6 3"
            label={{
              position: "right",
              value: formatPrice(currentPrice),
              fill: "#facc15",
              fontSize: 10,
              fontFamily: "monospace",
            }}
          />

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
                      : row.index === 0
                      ? 1.0
                      : row.isSupport
                      ? 0.9
                      : 0.55
                  }
                />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>

      {/* Source legend */}
      <div className="flex flex-wrap gap-3 px-1 pt-1">
        {Object.entries(SOURCE_COLORS).map(([src, color]) => {
          const total = data.sourceBreakdown[src as keyof typeof data.sourceBreakdown];
          if (!total || total <= 0) return null;
          return (
            <div key={src} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: color }} />
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

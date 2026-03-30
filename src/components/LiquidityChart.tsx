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
  meteora: "Meteora",
  raydium: "Raydium",
  orca: "Orca",
  jupiterLimit: "Jupiter Limit",
  jupiterDca: "Jupiter DCA",
  pumpfun: "Pump.fun",
};

interface ChartRow extends LiquidityBucket {
  priceLabel: string;
  isSupport: boolean;
  isCurrent: boolean;
}

const CustomTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartRow }>;
}) => {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;

  return (
    <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-3 text-xs shadow-2xl min-w-[200px]">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-white font-bold">{row.priceLabel}</span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ml-2 ${
            row.isCurrent
              ? "bg-yellow-500/20 text-yellow-400"
              : row.isSupport
              ? "bg-green-500/20 text-green-400"
              : "bg-red-500/20 text-red-400"
          }`}
        >
          {row.isCurrent ? "▶ Current" : row.isSupport ? `Support ${row.index}%` : `Resist +${row.index}%`}
        </span>
      </div>

      {row.totalUsd > 0 && (
        <>
          <div className="flex justify-between items-center mb-2 pb-2 border-b border-[#21262d]">
            <span className="text-gray-400">Total Liquidity</span>
            <span className="text-white font-bold">{formatUsd(row.totalUsd)}</span>
          </div>
          <div className="space-y-1">
            {Object.entries(row.sources)
              .filter(([, v]) => v > 0.01)
              .sort(([, a], [, b]) => b - a)
              .map(([src, val]) => (
                <div key={src} className="flex justify-between gap-4">
                  <span style={{ color: SOURCE_COLORS[src] ?? "#9ca3af" }}>
                    {SOURCE_LABELS[src] ?? src}
                  </span>
                  <span className="text-gray-300">{formatUsd(val)}</span>
                </div>
              ))}
          </div>
          <p className="text-gray-600 text-[10px] mt-2 border-t border-[#21262d] pt-1">
            {row.isSupport
              ? "↑ Buyers defend this level — thick bar = harder to break down"
              : "↓ Sellers resist here — thick bar = harder to break up"}
          </p>
        </>
      )}
      {row.totalUsd === 0 && (
        <p className="text-gray-600 text-[10px]">No liquidity at this price level</p>
      )}
    </div>
  );
};

// Y-axis price label — show every N rows, highlight current price
const PriceTick = ({
  x,
  y,
  payload,
  rows,
  showRange,
}: {
  x?: number | string;
  y?: number | string;
  payload?: { value: string };
  rows?: ChartRow[];
  showRange?: number;
}) => {
  const nx = typeof x === "string" ? parseFloat(x) : (x ?? 0);
  const ny = typeof y === "string" ? parseFloat(y) : (y ?? 0);
  if (!payload) return null;

  const row = rows?.find((r) => r.priceLabel === payload.value);
  if (!row) return null;

  const isCurrent = row.isCurrent;
  const interval = Math.max(2, Math.floor((showRange ?? 20) / 6));
  if (!isCurrent && Math.abs(row.index) % interval !== 0) return null;

  return (
    <text
      x={nx - 4}
      y={ny}
      dy={4}
      textAnchor="end"
      fill={isCurrent ? "#facc15" : row.isSupport ? "#4ade80aa" : "#f87171aa"}
      fontSize={isCurrent ? 11 : 9}
      fontWeight={isCurrent ? 700 : 400}
      fontFamily="'Courier New', monospace"
    >
      {isCurrent ? `▶ ${payload.value}` : payload.value}
    </text>
  );
};

export default function LiquidityChart({ data, showRange = 20 }: Props) {
  const { buckets, currentPrice } = data;

  const rows: ChartRow[] = buckets
    .filter((b) => b.index >= -showRange && b.index <= showRange)
    .sort((a, b) => b.index - a.index) // high price at top
    .map((b: LiquidityBucket) => ({
      ...b,
      priceLabel: formatPrice(b.priceMid),
      isSupport: b.index < 0,
      isCurrent: b.index === 0,
    }));

  const currentPriceLabel =
    rows.find((r) => r.isCurrent)?.priceLabel ?? formatPrice(currentPrice);

  // Count rows above and below for zone labels
  const resistanceCount = rows.filter((r) => r.index > 0).length;
  const supportCount = rows.filter((r) => r.index < 0).length;
  const totalRows = rows.length;

  const chartHeight = Math.min(Math.max(totalRows * 11, 300), 800);

  return (
    <div className="flex flex-col gap-0">
      {/* Zone header */}
      <div
        className="flex items-center justify-between px-3 py-1 text-[10px] font-medium"
        style={{
          height: `${(resistanceCount / totalRows) * chartHeight * 0.92}px`,
          background: "linear-gradient(to bottom, rgba(239,68,68,0.06) 0%, transparent 100%)",
          borderLeft: "2px solid rgba(239,68,68,0.25)",
          marginLeft: "96px",
        }}
      >
        {/* zone bg handled via chart styling */}
      </div>

      {/* Column labels */}
      <div className="flex items-center justify-between px-1 mb-0.5">
        <span className="text-[10px] text-gray-600" style={{ width: 100 }}>
          ↑ Price (USD)
        </span>
        <span className="text-[10px] text-gray-600">Liquidity (USD) →</span>
      </div>

      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          layout="vertical"
          data={rows}
          margin={{ top: 0, right: 12, left: 0, bottom: 0 }}
          barSize={8}
          barCategoryGap="5%"
        >
          <XAxis
            type="number"
            tickFormatter={(v) => formatUsd(v)}
            tick={{ fill: "#374151", fontSize: 9 }}
            axisLine={{ stroke: "#1f2937" }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="priceLabel"
            width={96}
            tick={(props) => (
              <PriceTick {...props} rows={rows} showRange={showRange} />
            )}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
          />

          {/* Current price line */}
          <ReferenceLine
            y={currentPriceLabel}
            stroke="#facc15"
            strokeWidth={1.5}
            strokeDasharray="6 3"
            label={{
              position: "right",
              value: "◄",
              fill: "#facc15",
              fontSize: 12,
            }}
          />

          {/* Stacked bars by DEX source */}
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
                      : row.isCurrent
                      ? 1.0
                      : row.isSupport
                      ? 0.92  // support: bright — these are the "walls" below price
                      : 0.45  // resistance: dimmed — walls above price
                  }
                />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="px-2 pt-2 pb-1 border-t border-[#1f2937]">
        <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2">
          {Object.entries(SOURCE_COLORS).map(([src, color]) => {
            const total = data.sourceBreakdown[src as keyof typeof data.sourceBreakdown];
            if (!total || total <= 0) return null;
            return (
              <div key={src} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: color }} />
                <span className="text-[10px] text-gray-500">
                  {SOURCE_LABELS[src]}{" "}
                  <span className="text-gray-600">({formatUsd(total)})</span>
                </span>
              </div>
            );
          })}
        </div>

        {/* How to read guide */}
        <div className="rounded-md p-2 text-[10px] space-y-1" style={{ background: "#0a0e16" }}>
          <p className="text-gray-500 font-medium">Cara baca chart ini:</p>
          <p className="text-gray-600">
            <span className="text-green-400/70">■</span>{" "}
            Bar terang (bawah harga) = <span className="text-green-400">Support</span> — likuiditas yang menahan harga turun
          </p>
          <p className="text-gray-600">
            <span className="text-red-400/50">■</span>{" "}
            Bar redup (atas harga) = <span className="text-red-400">Resistance</span> — likuiditas yang menahan harga naik
          </p>
          <p className="text-gray-600">
            <span className="text-yellow-400">─ ─</span>{" "}
            Garis kuning = harga saat ini
          </p>
          <p className="text-yellow-400/60 font-medium">
            ⟵ Bar lebih panjang = level lebih kuat (susah ditembus)
          </p>
        </div>
      </div>
    </div>
  );
}

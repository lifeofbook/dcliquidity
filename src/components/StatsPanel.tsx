"use client";

import type { AggregatedLiquidity } from "@/types";
import { formatUsd, formatPrice } from "@/lib/aggregator";
import Image from "next/image";

interface Props {
  data: AggregatedLiquidity;
}

const SOURCE_LABELS: Record<string, string> = {
  meteora: "Meteora DLMM",
  raydium: "Raydium",
  orca: "Orca",
  jupiterLimit: "Jupiter Limit",
  jupiterDca: "Jupiter DCA",
  pumpfun: "Pump.fun",
};

const SOURCE_COLORS: Record<string, string> = {
  meteora: "#f97316",
  raydium: "#8b5cf6",
  orca: "#06b6d4",
  jupiterLimit: "#22c55e",
  jupiterDca: "#eab308",
  pumpfun: "#ec4899",
};

export default function StatsPanel({ data }: Props) {
  const { token, currentPrice, totalLiquidityUsd, sourceBreakdown, buckets } = data;

  // Compute support vs resistance split
  const supportUsd = buckets
    .filter((b) => b.index < 0)
    .reduce((s, b) => s + b.totalUsd, 0);
  const resistanceUsd = buckets
    .filter((b) => b.index > 0)
    .reduce((s, b) => s + b.totalUsd, 0);

  // Nearest strong support / resistance (highest single bucket)
  const supportBuckets = buckets.filter((b) => b.index < 0 && b.totalUsd > 0);
  const resistanceBuckets = buckets.filter((b) => b.index > 0 && b.totalUsd > 0);

  const strongestSupport = supportBuckets.sort((a, b) => b.totalUsd - a.totalUsd)[0];
  const strongestResistance = resistanceBuckets.sort((a, b) => b.totalUsd - a.totalUsd)[0];

  return (
    <div className="flex flex-col gap-4">
      {/* Token header */}
      <div className="flex items-center gap-3">
        {token.logoURI && (
          <Image
            src={token.logoURI}
            alt={token.symbol}
            width={44}
            height={44}
            className="rounded-full bg-[#2a3142]"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        )}
        <div>
          <h2 className="text-lg font-bold text-white">{token.symbol}</h2>
          <p className="text-xs text-gray-500 truncate max-w-[180px]">{token.name}</p>
        </div>
      </div>

      {/* Price */}
      <div className="bg-[#1a1f2e] rounded-lg p-3 border border-[#2a3142]">
        <p className="text-xs text-gray-500 mb-1">Current Price</p>
        <p className="text-xl font-bold text-white">{formatPrice(currentPrice)}</p>
      </div>

      {/* Total liquidity */}
      <div className="bg-[#1a1f2e] rounded-lg p-3 border border-[#2a3142]">
        <p className="text-xs text-gray-500 mb-1">Total Liquidity (±50%)</p>
        <p className="text-lg font-bold text-white">{formatUsd(totalLiquidityUsd)}</p>
        <div className="mt-2 h-1.5 rounded-full bg-[#2a3142] overflow-hidden flex">
          <div
            className="bg-green-500 h-full"
            style={{ width: `${(supportUsd / (totalLiquidityUsd || 1)) * 100}%` }}
          />
          <div
            className="bg-red-500 h-full"
            style={{ width: `${(resistanceUsd / (totalLiquidityUsd || 1)) * 100}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-green-400">Support {formatUsd(supportUsd)}</span>
          <span className="text-xs text-red-400">Resistance {formatUsd(resistanceUsd)}</span>
        </div>
      </div>

      {/* Strongest levels */}
      {(strongestSupport || strongestResistance) && (
        <div className="bg-[#1a1f2e] rounded-lg p-3 border border-[#2a3142] space-y-2">
          <p className="text-xs text-gray-500">Strongest Levels</p>
          {strongestSupport && (
            <div className="flex justify-between items-center">
              <span className="text-xs text-green-400">Support</span>
              <div className="text-right">
                <p className="text-xs text-white font-medium">{formatPrice(strongestSupport.priceMid)}</p>
                <p className="text-xs text-gray-500">{formatUsd(strongestSupport.totalUsd)}</p>
              </div>
            </div>
          )}
          {strongestResistance && (
            <div className="flex justify-between items-center">
              <span className="text-xs text-red-400">Resistance</span>
              <div className="text-right">
                <p className="text-xs text-white font-medium">{formatPrice(strongestResistance.priceMid)}</p>
                <p className="text-xs text-gray-500">{formatUsd(strongestResistance.totalUsd)}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Source breakdown */}
      <div className="bg-[#1a1f2e] rounded-lg p-3 border border-[#2a3142]">
        <p className="text-xs text-gray-500 mb-2">By Source</p>
        <div className="space-y-2">
          {Object.entries(sourceBreakdown)
            .filter(([, v]) => v > 0)
            .sort(([, a], [, b]) => b - a)
            .map(([src, value]) => (
              <div key={src} className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: SOURCE_COLORS[src] }}
                />
                <span className="text-xs text-gray-400 flex-1">{SOURCE_LABELS[src]}</span>
                <span className="text-xs text-white font-medium">{formatUsd(value)}</span>
                <div className="w-16 h-1 rounded-full bg-[#2a3142] overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(value / (totalLiquidityUsd || 1)) * 100}%`,
                      background: SOURCE_COLORS[src],
                    }}
                  />
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Mint address */}
      <div className="bg-[#1a1f2e] rounded-lg p-3 border border-[#2a3142]">
        <p className="text-xs text-gray-500 mb-1">Mint Address</p>
        <p className="text-xs text-gray-400 font-mono break-all">{token.mint}</p>
      </div>
    </div>
  );
}

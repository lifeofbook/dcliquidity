"use client";

import { useState, useCallback } from "react";
import { RefreshCw, AlertCircle, BarChart2, GitBranch } from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import TokenSearch from "@/components/TokenSearch";
import type { AggregatedLiquidity } from "@/types";
import { formatPrice, formatUsd } from "@/lib/aggregator";

const PriceChart = dynamic(() => import("@/components/PriceChart"), { ssr: false });

const POPULAR_TOKENS = [
  { symbol: "SOL", mint: "So11111111111111111111111111111111111111112" },
  { symbol: "JUP", mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" },
  { symbol: "BONK", mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
  { symbol: "WIF", mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm" },
  { symbol: "PYTH", mint: "HZ1JovNiVvGrCNiiYWxoK4sBerABMvxCFBLYn3urRiCk" },
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
  meteora: "Meteora DLMM",
  raydium: "Raydium",
  orca: "Orca",
  jupiterLimit: "Jupiter Limit",
  jupiterDca: "Jupiter DCA",
  pumpfun: "Pump.fun AMM",
};

type ChartRange = 20 | 50 | 100 | 200;

function StatsPanel({ data }: { data: AggregatedLiquidity }) {
  const { token, currentPrice, totalLiquidityUsd, sourceBreakdown, buckets } = data;

  const supportUsd = buckets.filter(b => b.index < 0).reduce((s, b) => s + b.totalUsd, 0);
  const resistUsd = buckets.filter(b => b.index > 0).reduce((s, b) => s + b.totalUsd, 0);

  const strongestSupport = [...buckets].filter(b => b.index < 0 && b.totalUsd > 0)
    .sort((a, b) => b.totalUsd - a.totalUsd)[0];
  const strongestResist = [...buckets].filter(b => b.index > 0 && b.totalUsd > 0)
    .sort((a, b) => b.totalUsd - a.totalUsd)[0];

  const activeSources = Object.entries(sourceBreakdown)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a);

  return (
    <div className="flex flex-col gap-3 px-3 py-3 overflow-y-auto">
      {/* Token header */}
      <div className="flex items-center gap-2">
        {token.logoURI && (
          <Image
            src={token.logoURI}
            alt={token.symbol}
            width={32}
            height={32}
            className="rounded-full bg-[#1f2937]"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        )}
        <div>
          <div className="text-sm font-bold text-white">{token.symbol}</div>
          <div className="text-[10px] text-gray-500 truncate max-w-[160px]">{token.name}</div>
        </div>
      </div>

      {/* Price */}
      <div className="rounded-lg p-2.5" style={{ background: "#0d1117", border: "1px solid #1a2030" }}>
        <div className="text-[9px] text-gray-600 mb-0.5">Current Price</div>
        <div className="text-base font-bold text-white font-mono">{formatPrice(currentPrice)}</div>
      </div>

      {/* Total liquidity + support/resist split */}
      <div className="rounded-lg p-2.5" style={{ background: "#0d1117", border: "1px solid #1a2030" }}>
        <div className="text-[9px] text-gray-600 mb-1">Total Liquidity</div>
        <div className="text-sm font-bold text-white">{formatUsd(totalLiquidityUsd)}</div>
        <div className="mt-1.5 h-1 rounded-full overflow-hidden flex" style={{ background: "#1a2030" }}>
          <div className="h-full bg-green-500" style={{ width: `${(supportUsd / (totalLiquidityUsd || 1)) * 100}%` }} />
          <div className="h-full bg-red-500" style={{ width: `${(resistUsd / (totalLiquidityUsd || 1)) * 100}%` }} />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[9px] text-green-400">Support {formatUsd(supportUsd)}</span>
          <span className="text-[9px] text-red-400">Resist {formatUsd(resistUsd)}</span>
        </div>
      </div>

      {/* Strongest levels */}
      {(strongestSupport || strongestResist) && (
        <div className="rounded-lg p-2.5" style={{ background: "#0d1117", border: "1px solid #1a2030" }}>
          <div className="text-[9px] text-gray-600 mb-1.5">Strongest Levels</div>
          <div className="space-y-1.5">
            {strongestSupport && (
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-green-400">↑ Support</span>
                <div className="text-right">
                  <div className="text-[10px] text-white font-mono">{formatPrice(strongestSupport.priceMid)}</div>
                  <div className="text-[9px] text-gray-600">{formatUsd(strongestSupport.totalUsd)}</div>
                </div>
              </div>
            )}
            {strongestResist && (
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-red-400">↓ Resistance</span>
                <div className="text-right">
                  <div className="text-[10px] text-white font-mono">{formatPrice(strongestResist.priceMid)}</div>
                  <div className="text-[9px] text-gray-600">{formatUsd(strongestResist.totalUsd)}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Source breakdown */}
      <div className="rounded-lg p-2.5" style={{ background: "#0d1117", border: "1px solid #1a2030" }}>
        <div className="text-[9px] text-gray-600 mb-1.5">By Source</div>
        <div className="space-y-1.5">
          {activeSources.map(([src, value]) => (
            <div key={src}>
              <div className="flex justify-between mb-0.5">
                <span className="text-[10px]" style={{ color: SOURCE_COLORS[src] }}>
                  {SOURCE_LABELS[src] ?? src}
                </span>
                <span className="text-[10px] text-white font-mono">{formatUsd(value)}</span>
              </div>
              <div className="h-0.5 rounded-full" style={{ background: "#1a2030" }}>
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

      {/* How to read */}
      <div className="rounded-lg p-2.5 text-[9px] space-y-1" style={{ background: "#060810", border: "1px solid #1a2030" }}>
        <p className="text-gray-500 font-medium">Cara baca chart:</p>
        <p className="text-gray-600">Bar di <span className="text-green-400">bawah</span> harga = <strong className="text-green-400">Support</strong></p>
        <p className="text-gray-600">Bar di <span className="text-red-400">atas</span> harga = <strong className="text-red-400">Resistance</strong></p>
        <p className="text-yellow-400/70">Bar lebih panjang = level lebih kuat</p>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [data, setData] = useState<AggregatedLiquidity | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentMint, setCurrentMint] = useState<string | null>(null);
  const [chartRange, setChartRange] = useState<ChartRange>(20);

  const loadToken = useCallback(async (mint: string) => {
    setLoading(true);
    setError(null);
    setCurrentMint(mint);
    try {
      const res = await fetch(`/api/liquidity?mint=${mint}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to load");
        setData(null);
      } else {
        setData(json);
      }
    } catch {
      setError("Network error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = () => { if (currentMint) loadToken(currentMint); };

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: "#0d1117" }}>
      {/* Header */}
      <header className="shrink-0 border-b border-[#1a2030] px-3 py-1.5" style={{ background: "#090c12" }}>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 shrink-0">
            <BarChart2 className="w-4 h-4 text-[#f97316]" />
            <span className="text-white font-bold text-sm">DCLiquidity</span>
          </div>

          <div className="flex-1 max-w-lg">
            <TokenSearch onSelect={loadToken} loading={loading} />
          </div>

          <div className="hidden md:flex items-center gap-1">
            {POPULAR_TOKENS.map((t) => (
              <button
                key={t.mint}
                onClick={() => loadToken(t.mint)}
                className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                  currentMint === t.mint
                    ? "bg-[#f97316] border-[#f97316] text-white"
                    : "border-[#2a3142] text-gray-500 hover:border-[#f97316] hover:text-white"
                }`}
              >
                {t.symbol}
              </button>
            ))}
          </div>

          {/* Range selector */}
          <div className="flex items-center gap-0.5 rounded-md p-0.5" style={{ background: "#1a1f2e", border: "1px solid #2a3142" }}>
            {([20, 50, 100, 200] as ChartRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setChartRange(r)}
                className={`text-[11px] px-2 py-0.5 rounded transition-colors ${
                  chartRange === r ? "bg-[#f97316] text-white" : "text-gray-500 hover:text-white"
                }`}
              >
                ±{r}%
              </button>
            ))}
          </div>

          {data && (
            <button onClick={refresh} className="text-gray-600 hover:text-white transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
          <a href="https://github.com/lifeofbook/dcliquidity" target="_blank" rel="noreferrer"
            className="text-gray-600 hover:text-white transition-colors">
            <GitBranch className="w-4 h-4" />
          </a>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 min-h-0 flex">
        {/* Empty state */}
        {!data && !loading && !error && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
            <BarChart2 className="w-12 h-12 text-[#f97316] opacity-40" />
            <div>
              <h1 className="text-lg font-semibold text-white mb-1">Solana DEX Liquidity Depth</h1>
              <p className="text-gray-500 text-sm max-w-md">
                Paste alamat token Solana untuk melihat konsentrasi likuiditas support & resistance
                dari Meteora, Raydium, Orca, dan Jupiter — real time.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {POPULAR_TOKENS.map((t) => (
                <button key={t.mint} onClick={() => loadToken(t.mint)}
                  className="px-4 py-2 rounded-lg text-sm text-gray-300 hover:text-white transition-colors"
                  style={{ background: "#1a1f2e", border: "1px solid #2a3142" }}>
                  {t.symbol}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-7 h-7 border-2 border-[#f97316] border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-500">Memuat data likuiditas…</p>
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <AlertCircle className="w-7 h-7 text-red-400" />
            <p className="text-red-400">{error}</p>
            <button onClick={refresh} className="text-sm text-gray-500 hover:text-white flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> Coba lagi
            </button>
          </div>
        )}

        {/* ── CLOBr layout: chart full width with depth overlay, stats on right ── */}
        {data && !loading && (
          <div className="flex-1 min-h-0 flex">
            {/* Left: chart + depth canvas overlay (fills remaining space) */}
            <div className="flex-1 min-w-0">
              <PriceChart mint={currentMint!} data={data} showRange={chartRange} />
            </div>

            {/* Right: compact stats panel */}
            <div
              className="shrink-0 border-l border-[#1a2030]"
              style={{ width: 220, background: "#090c12", overflowY: "auto" }}
            >
              <StatsPanel data={data} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

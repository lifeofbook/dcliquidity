"use client";

import { useState, useCallback } from "react";
import { RefreshCw, AlertCircle, BarChart2, GitBranch } from "lucide-react";
import TokenSearch from "@/components/TokenSearch";
import LiquidityChart from "@/components/LiquidityChart";
import StatsPanel from "@/components/StatsPanel";
import type { AggregatedLiquidity } from "@/types";
import { formatPrice } from "@/lib/aggregator";

// Well-known tokens for quick access
const POPULAR_TOKENS = [
  { symbol: "SOL", mint: "So11111111111111111111111111111111111111112" },
  { symbol: "JUP", mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" },
  { symbol: "BONK", mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
  { symbol: "WIF", mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm" },
  { symbol: "PYTH", mint: "HZ1JovNiVvGrCNiiYWxoK4sBerABMvxCFBLYn3urRiCk" },
  { symbol: "USDC", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
];

type ChartRange = 20 | 50 | 100 | 200;

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
        setError(json.error ?? "Failed to load liquidity data");
        setData(null);
      } else {
        setData(json);
      }
    } catch {
      setError("Network error — please try again");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = () => {
    if (currentMint) loadToken(currentMint);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0d1117" }}>
      {/* Header */}
      <header className="border-b border-[#21262d] px-4 py-3">
        <div className="max-w-screen-xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <BarChart2 className="w-6 h-6 text-[#f97316]" />
            <span className="text-white font-bold text-lg tracking-tight">DCLiquidity</span>
            <span className="hidden sm:inline text-xs text-gray-500 ml-1">Solana DEX Depth</span>
          </div>

          <TokenSearch onSelect={loadToken} loading={loading} />

          <a
            href="https://github.com/lifeofbook/dcliquidity"
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-gray-500 hover:text-white transition-colors"
          >
            <GitBranch className="w-5 h-5" />
          </a>
        </div>
      </header>

      {/* Quick pick tokens */}
      <div className="border-b border-[#21262d] px-4 py-2">
        <div className="max-w-screen-xl mx-auto flex items-center gap-2 overflow-x-auto">
          <span className="text-xs text-gray-600 shrink-0">Quick:</span>
          {POPULAR_TOKENS.map((t) => (
            <button
              key={t.mint}
              onClick={() => loadToken(t.mint)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors shrink-0 ${
                currentMint === t.mint
                  ? "bg-[#f97316] border-[#f97316] text-white"
                  : "border-[#2a3142] text-gray-400 hover:border-[#f97316] hover:text-white"
              }`}
            >
              {t.symbol}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 px-4 py-6">
        <div className="max-w-screen-xl mx-auto">
          {/* Empty state */}
          {!data && !loading && !error && (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
              <BarChart2 className="w-12 h-12 text-[#f97316] opacity-60" />
              <h1 className="text-xl font-semibold text-white">Solana DEX Liquidity Depth</h1>
              <p className="text-gray-500 max-w-md text-sm">
                Search for any Solana token to visualize concentrated liquidity support and resistance
                levels across Meteora, Raydium, Orca, and Jupiter orders — all aggregated into 1%
                price buckets.
              </p>
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {POPULAR_TOKENS.map((t) => (
                  <button
                    key={t.mint}
                    onClick={() => loadToken(t.mint)}
                    className="px-4 py-2 rounded-lg bg-[#1a1f2e] border border-[#2a3142] text-sm text-gray-300 hover:border-[#f97316] hover:text-white transition-colors"
                  >
                    {t.symbol}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Loading skeleton */}
          {loading && (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 animate-pulse">
              <div className="bg-[#1a1f2e] rounded-xl h-96 border border-[#2a3142]" />
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="bg-[#1a1f2e] rounded-lg h-20 border border-[#2a3142]" />
                ))}
              </div>
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <AlertCircle className="w-8 h-8 text-red-400" />
              <p className="text-red-400 font-medium">{error}</p>
              <button
                onClick={refresh}
                className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Try again
              </button>
            </div>
          )}

          {/* Main chart layout */}
          {data && !loading && (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
              {/* Chart panel */}
              <div className="bg-[#13171f] rounded-xl border border-[#21262d] p-5 overflow-y-auto max-h-[85vh]">
                {/* Chart toolbar */}
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="text-white font-semibold text-sm">
                      {data.token.symbol} — Liquidity Depth
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatPrice(data.currentPrice)} · aggregated across all DEXes
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Range selector */}
                    <div className="flex items-center gap-1 bg-[#1a1f2e] rounded-lg p-1 border border-[#2a3142]">
                      {([20, 50, 100, 200] as ChartRange[]).map((r) => (
                        <button
                          key={r}
                          onClick={() => setChartRange(r)}
                          className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                            chartRange === r
                              ? "bg-[#f97316] text-white"
                              : "text-gray-400 hover:text-white"
                          }`}
                        >
                          ±{r}%
                        </button>
                      ))}
                    </div>

                    {/* Refresh */}
                    <button
                      onClick={refresh}
                      title="Refresh data"
                      className="p-2 rounded-lg bg-[#1a1f2e] border border-[#2a3142] text-gray-400 hover:text-white hover:border-[#f97316] transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <LiquidityChart data={data} showRange={chartRange} />

                {/* Last updated */}
                <p className="text-xs text-gray-600 mt-3 text-right">
                  Last updated: {new Date(data.fetchedAt).toLocaleTimeString()}
                </p>
              </div>

              {/* Stats panel */}
              <div>
                <StatsPanel data={data} />
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#21262d] px-4 py-3">
        <div className="max-w-screen-xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600">
          <span>DCLiquidity — Solana concentrated liquidity aggregator</span>
          <span>Data: Meteora · Raydium · Orca · Jupiter Limit &amp; DCA</span>
        </div>
      </footer>
    </div>
  );
}

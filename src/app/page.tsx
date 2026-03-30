"use client";

import { useState, useCallback } from "react";
import { RefreshCw, AlertCircle, BarChart2, GitBranch } from "lucide-react";
import dynamic from "next/dynamic";
import TokenSearch from "@/components/TokenSearch";
import LiquidityChart from "@/components/LiquidityChart";
import type { AggregatedLiquidity } from "@/types";
import { formatPrice } from "@/lib/aggregator";

// Dynamically import PriceChart (uses browser-only lightweight-charts)
const PriceChart = dynamic(() => import("@/components/PriceChart"), { ssr: false });

const POPULAR_TOKENS = [
  { symbol: "SOL", mint: "So11111111111111111111111111111111111111112" },
  { symbol: "JUP", mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" },
  { symbol: "BONK", mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
  { symbol: "WIF", mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm" },
  { symbol: "PYTH", mint: "HZ1JovNiVvGrCNiiYWxoK4sBerABMvxCFBLYn3urRiCk" },
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
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: "#0d1117" }}>
      {/* ── Header ── */}
      <header className="shrink-0 border-b border-[#21262d] px-4 py-2">
        <div className="flex items-center gap-3">
          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <BarChart2 className="w-5 h-5 text-[#f97316]" />
            <span className="text-white font-bold tracking-tight">DCLiquidity</span>
          </div>

          {/* Token search — grows to fill */}
          <div className="flex-1 max-w-md">
            <TokenSearch onSelect={loadToken} loading={loading} />
          </div>

          {/* Quick token buttons */}
          <div className="hidden md:flex items-center gap-1 overflow-x-auto">
            {POPULAR_TOKENS.map((t) => (
              <button
                key={t.mint}
                onClick={() => loadToken(t.mint)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors shrink-0 ${
                  currentMint === t.mint
                    ? "bg-[#f97316] border-[#f97316] text-white"
                    : "border-[#2a3142] text-gray-500 hover:border-[#f97316] hover:text-white"
                }`}
              >
                {t.symbol}
              </button>
            ))}
          </div>

          {/* Range selector (only visible with data) */}
          {data && (
            <div className="flex items-center gap-0.5 bg-[#1a1f2e] rounded-lg p-0.5 border border-[#2a3142]">
              {([20, 50, 100, 200] as ChartRange[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setChartRange(r)}
                  className={`text-xs px-2 py-0.5 rounded transition-colors ${
                    chartRange === r
                      ? "bg-[#f97316] text-white"
                      : "text-gray-500 hover:text-white"
                  }`}
                >
                  ±{r}%
                </button>
              ))}
            </div>
          )}

          {/* Refresh + GitHub */}
          <div className="flex items-center gap-2 shrink-0">
            {data && (
              <button
                onClick={refresh}
                title="Refresh"
                className="p-1.5 rounded text-gray-500 hover:text-white transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
            <a
              href="https://github.com/lifeofbook/dcliquidity"
              target="_blank"
              rel="noreferrer"
              className="text-gray-600 hover:text-white transition-colors"
            >
              <GitBranch className="w-4 h-4" />
            </a>
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="flex-1 min-h-0 flex">
        {/* Empty state */}
        {!data && !loading && !error && (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center p-8">
            <BarChart2 className="w-14 h-14 text-[#f97316] opacity-50" />
            <div>
              <h1 className="text-xl font-semibold text-white mb-2">
                Solana DEX Liquidity Depth
              </h1>
              <p className="text-gray-500 text-sm max-w-md">
                Paste any Solana token address or search by name to visualize
                concentrated liquidity support &amp; resistance levels across
                Meteora, Raydium, Orca, and Jupiter — aggregated in real time.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
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
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-[#f97316] border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-500">Fetching liquidity data…</p>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <AlertCircle className="w-8 h-8 text-red-400" />
            <p className="text-red-400 font-medium">{error}</p>
            <button
              onClick={refresh}
              className="text-sm text-gray-400 hover:text-white flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Try again
            </button>
          </div>
        )}

        {/* ── CLOBr-style dual panel ── */}
        {data && !loading && (
          <div className="flex-1 min-h-0 flex">
            {/* Left: TradingView candlestick chart */}
            <div
              className="flex-1 min-w-0 border-r border-[#21262d]"
              style={{ background: "#0d1117" }}
            >
              <PriceChart
                mint={currentMint!}
                data={data}
                showRange={chartRange}
              />
            </div>

            {/* Right: Liquidity depth panel */}
            <div
              className="shrink-0 flex flex-col border-l border-[#21262d]"
              style={{ width: "320px", background: "#090c12" }}
            >
              {/* Header: title + price + range */}
              <div
                className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-[#1a2030]"
                style={{ background: "#0d1117" }}
              >
                <div className="flex flex-col">
                  <span className="text-[11px] text-white font-semibold">Liquidity Depth</span>
                  <span className="text-[9px] text-gray-600">±{chartRange}% range</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[11px] text-white font-mono font-bold">
                    {formatPrice(data.currentPrice)}
                  </span>
                  <span className="text-[9px] text-gray-600">{data.token.symbol}/USD</span>
                </div>
              </div>

              {/* Depth chart — fills all remaining height */}
              <div className="flex-1 min-h-0">
                <LiquidityChart data={data} showRange={chartRange} />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

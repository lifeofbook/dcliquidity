import type { LiquidityPosition, DEXSource } from "@/types";

const DEXSCREENER_API = "https://api.dexscreener.com/latest/dex/tokens";

interface DexScreenerPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceNative: string;
  priceUsd: string;
  liquidity?: { usd?: number; base?: number; quote?: number };
  volume?: { h24?: number };
  labels?: string[];
}

interface DexScreenerResponse {
  pairs: DexScreenerPair[] | null;
}

const DEX_ID_MAP: Record<string, DEXSource> = {
  meteora: "meteora",
  "meteora-dlmm": "meteora",
  raydium: "raydium",
  "raydium-clmm": "raydium",
  orca: "orca",
  "pump-fun": "pumpfun",
  pumpfun: "pumpfun",
};

/**
 * Estimate the price range a pool's liquidity covers, based on DEX type.
 * - DLMM / CLMM (concentrated): narrow range
 * - AMM / constant product: wide range
 */
function priceRange(dexId: string): { low: number; high: number } {
  const id = dexId.toLowerCase();
  if (id.includes("meteora") || id.includes("dlmm")) {
    return { low: 0.88, high: 1.12 }; // ±12%
  }
  if (id.includes("clmm") || id.includes("orca")) {
    return { low: 0.82, high: 1.18 }; // ±18%
  }
  // AMM / pump.fun constant product — spread from 0 to ∞ but show ±50%
  return { low: 0.5, high: 1.5 };
}

export async function getDexScreenerLiquidity(
  tokenMint: string,
  tokenPriceUsd: number
): Promise<LiquidityPosition[]> {
  try {
    const res = await fetch(`${DEXSCREENER_API}/${tokenMint}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];

    const data: DexScreenerResponse = await res.json();
    const pairs = (data?.pairs ?? []).filter(
      (p) => p.chainId === "solana" && (p.liquidity?.usd ?? 0) > 0
    );

    const positions: LiquidityPosition[] = [];

    for (const pair of pairs) {
      const liquidityUsd = pair.liquidity?.usd ?? 0;
      if (liquidityUsd <= 0) continue;

      const dexId = pair.dexId?.toLowerCase() ?? "";
      const source: DEXSource = DEX_ID_MAP[dexId] ?? "raydium";

      // Use current token price for price range
      const { low, high } = priceRange(dexId);

      positions.push({
        priceLow: tokenPriceUsd * low,
        priceHigh: tokenPriceUsd * high,
        liquidityUsd,
        source,
      });
    }

    return positions;
  } catch {
    return [];
  }
}

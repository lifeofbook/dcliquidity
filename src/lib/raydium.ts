import type { LiquidityPosition } from "@/types";

const RAYDIUM_API = "https://api-v3.raydium.io";

interface RaydiumPool {
  id: string;
  mintA: { address: string; decimals: number; symbol: string };
  mintB: { address: string; decimals: number; symbol: string };
  price: number;
  tvl: number;
  type: string;
  config?: { tickSpacing: number };
}

interface RaydiumPoolResponse {
  data: {
    data: RaydiumPool[];
    hasNextPage: boolean;
  };
}

async function fetchWithTimeout(url: string, ms = 10000): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      next: { revalidate: 60 },
    });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

export async function getRaydiumPools(tokenMint: string): Promise<RaydiumPool[]> {
  try {
    const res = await fetchWithTimeout(
      `${RAYDIUM_API}/pools/info/mint?mint1=${tokenMint}&poolType=all&poolSortField=tvl&sortType=desc&pageSize=50&page=1`
    );
    if (!res.ok) return [];
    const data: RaydiumPoolResponse = await res.json();
    return data?.data?.data ?? [];
  } catch {
    return [];
  }
}

export async function getRaydiumLiquidity(
  tokenMint: string,
  tokenPriceUsd: number
): Promise<LiquidityPosition[]> {
  const pools = await getRaydiumPools(tokenMint);
  const positions: LiquidityPosition[] = [];

  for (const pool of pools) {
    const tvlUsd = pool.tvl ?? 0;
    if (tvlUsd <= 0) continue;

    const isClmm = pool.type === "Concentrated";

    if (isClmm) {
      // CLMM — liquidity concentrated in ±20% range
      positions.push({
        priceLow: tokenPriceUsd * 0.80,
        priceHigh: tokenPriceUsd * 1.20,
        liquidityUsd: tvlUsd,
        source: "raydium",
      });
    } else {
      // Standard AMM (constant product) — wide distribution ±50%
      positions.push({
        priceLow: tokenPriceUsd * 0.5,
        priceHigh: tokenPriceUsd * 1.5,
        liquidityUsd: tvlUsd,
        source: "raydium",
      });
    }
  }

  return positions;
}

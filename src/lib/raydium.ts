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
      // CLMM: gaussian distribution centered on current price, ±20% range
      const RANGE = 40; // 40 bins of 1% each
      const sigma = RANGE / 5; // σ controls width of gaussian
      const weights: number[] = [];
      for (let i = 0; i < RANGE; i++) {
        const dist = Math.abs(i - RANGE / 2 + 0.5);
        weights.push(Math.exp(-0.5 * Math.pow(dist / sigma, 2)));
      }
      const totalWeight = weights.reduce((s, w) => s + w, 0);
      for (let i = 0; i < RANGE; i++) {
        const idx = i - RANGE / 2;
        positions.push({
          priceLow: tokenPriceUsd * Math.pow(1.01, idx),
          priceHigh: tokenPriceUsd * Math.pow(1.01, idx + 1),
          liquidityUsd: (tvlUsd * weights[i]) / totalWeight,
          source: "raydium",
        });
      }
    } else {
      // Standard AMM (constant product): depth ∝ 1/sqrt(price) across ±100%
      // This creates more liquidity at lower prices (support) than higher (resistance)
      const RANGE = 200;
      const weights: number[] = [];
      for (let i = 0; i < RANGE; i++) {
        const relPrice = Math.pow(1.01, i - RANGE / 2 + 0.5);
        weights.push(1 / Math.sqrt(relPrice));
      }
      const totalWeight = weights.reduce((s, w) => s + w, 0);
      for (let i = 0; i < RANGE; i++) {
        const idx = i - RANGE / 2;
        positions.push({
          priceLow: tokenPriceUsd * Math.pow(1.01, idx),
          priceHigh: tokenPriceUsd * Math.pow(1.01, idx + 1),
          liquidityUsd: (tvlUsd * weights[i]) / totalWeight,
          source: "raydium",
        });
      }
    }
  }

  return positions;
}

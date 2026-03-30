import type { LiquidityPosition } from "@/types";

const ORCA_API = "https://api.mainnet.orca.so/v1";

interface OrcaPool {
  address: string;
  tokenA: { mint: string; symbol: string; decimals: number };
  tokenB: { mint: string; symbol: string; decimals: number };
  price: number;
  tvl: number;
  tickSpacing: number;
}

interface OrcaPoolListResponse {
  whirlpools: OrcaPool[];
}

async function fetchWithTimeout(url: string, ms = 10000): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      next: { revalidate: 300 },
    });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

export async function getOrcaLiquidity(
  tokenMint: string,
  tokenPriceUsd: number
): Promise<LiquidityPosition[]> {
  try {
    const res = await fetchWithTimeout(`${ORCA_API}/whirlpool/list`);
    if (!res.ok) return [];

    const data: OrcaPoolListResponse = await res.json();
    const pools = (data?.whirlpools ?? []).filter(
      (p) => p.tokenA?.mint === tokenMint || p.tokenB?.mint === tokenMint
    );

    const positions: LiquidityPosition[] = [];

    for (const pool of pools) {
      const tvlUsd = pool.tvl ?? 0;
      if (tvlUsd <= 0) continue;

      // Orca Whirlpools are CLMM: gaussian distribution ±20% around current price
      const RANGE = 40; // 40 buckets of 1% each
      const sigma = RANGE / 5;
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
          source: "orca",
        });
      }
    }

    return positions;
  } catch {
    return [];
  }
}

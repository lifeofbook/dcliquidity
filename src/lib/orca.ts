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

      // Orca Whirlpools are CLMM — concentrate in ±20% range
      positions.push({
        priceLow: tokenPriceUsd * 0.80,
        priceHigh: tokenPriceUsd * 1.20,
        liquidityUsd: tvlUsd,
        source: "orca",
      });
    }

    return positions;
  } catch {
    return [];
  }
}

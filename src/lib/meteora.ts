import type { LiquidityPosition } from "@/types";

const METEORA_API = "https://dlmm-api.meteora.ag";

interface MeteoraPool {
  address: string;
  name: string;
  mint_x: string;
  mint_y: string;
  current_price: number;
  liquidity: string;
  bin_step: number;
  active_id: number;
  total_value_locked_usd: number;
  trade_volume_24h?: number;
}

interface MeteoraGroupsResponse {
  groups: Array<{
    name: string;
    pairs: MeteoraPool[];
  }>;
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

export async function getMeteoraPools(tokenMint: string): Promise<MeteoraPool[]> {
  try {
    const res = await fetchWithTimeout(
      `${METEORA_API}/pair/all_by_groups?include_unknown=true&sort_key=tvl&order_by=desc&search_term=${tokenMint}`
    );
    if (!res.ok) return [];
    const data: MeteoraGroupsResponse = await res.json();
    const all: MeteoraPool[] = [];
    for (const group of data?.groups ?? []) {
      for (const pair of group.pairs ?? []) {
        if (
          pair.mint_x === tokenMint ||
          pair.mint_y === tokenMint
        ) {
          all.push(pair);
        }
      }
    }
    return all;
  } catch {
    return [];
  }
}

/**
 * For a DLMM pool, distribute TVL into discrete price buckets using bin_step.
 * We model the active liquidity region as ±N bins around the active bin,
 * where N bins cover roughly 20% of the price range.
 */
function distributeDlmmTvl(
  tokenPriceUsd: number,
  binStep: number, // in basis points
  tvlUsd: number,
  source: LiquidityPosition["source"]
): LiquidityPosition[] {
  const positions: LiquidityPosition[] = [];
  if (tvlUsd <= 0) return positions;

  const stepFraction = binStep / 10000; // e.g. 25 bps → 0.0025

  // Distribute over ±40 bins (covers ~10-40% range depending on bin_step)
  const halfRange = 40;
  const totalBins = halfRange * 2;

  for (let i = -halfRange; i < halfRange; i++) {
    const priceLow = tokenPriceUsd * Math.pow(1 + stepFraction, i);
    const priceHigh = tokenPriceUsd * Math.pow(1 + stepFraction, i + 1);

    // Bell-curve weight: more liquidity near active price
    const distFromCenter = Math.abs(i + 0.5);
    const weight = Math.exp(-0.5 * Math.pow(distFromCenter / (halfRange / 3), 2));

    positions.push({
      priceLow,
      priceHigh,
      liquidityUsd: (tvlUsd / totalBins) * weight * 2,
      source,
    });
  }

  return positions;
}

export async function getMeteoraLiquidity(
  tokenMint: string,
  tokenPriceUsd: number
): Promise<LiquidityPosition[]> {
  const pools = await getMeteoraPools(tokenMint);
  if (pools.length === 0) return [];

  const positions: LiquidityPosition[] = [];

  for (const pool of pools) {
    const tvlUsd = pool.total_value_locked_usd ?? 0;
    if (tvlUsd <= 0) continue;

    // Use bin_step to build a realistic distribution
    const binStep = pool.bin_step ?? 25;
    const binPositions = distributeDlmmTvl(tokenPriceUsd, binStep, tvlUsd, "meteora");
    positions.push(...binPositions);
  }

  return positions;
}

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

async function fetchWithTimeout(url: string, ms = 12000): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, next: { revalidate: 60 } });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

export async function getMeteoraPools(tokenMint: string): Promise<MeteoraPool[]> {
  try {
    const url = `${METEORA_API}/pair/all_by_groups?include_unknown=true&sort_key=tvl&order_by=desc&search_term=${tokenMint}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const data: MeteoraGroupsResponse = await res.json();
    const all: MeteoraPool[] = [];
    for (const group of data?.groups ?? []) {
      for (const pair of group.pairs ?? []) {
        if (pair.mint_x === tokenMint || pair.mint_y === tokenMint) {
          all.push(pair);
        }
      }
    }
    return all;
  } catch {
    return [];
  }
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

    const binStep = pool.bin_step ?? 25; // bps
    const stepFraction = binStep / 10000;

    // DLMM: concentrate most liquidity in ±(10 bins) around current price
    // then gradually less further out
    const halfInner = 10;
    const halfOuter = 50;

    // Inner: 70% of TVL in ±halfInner bins
    const innerUsd = tvlUsd * 0.70;
    for (let i = -halfInner; i < halfInner; i++) {
      const dist = Math.abs(i + 0.5);
      const weight = Math.exp(-0.5 * Math.pow(dist / (halfInner / 2.5), 2));
      positions.push({
        priceLow: tokenPriceUsd * Math.pow(1 + stepFraction, i),
        priceHigh: tokenPriceUsd * Math.pow(1 + stepFraction, i + 1),
        liquidityUsd: innerUsd * weight,
        source: "meteora",
      });
    }

    // Outer: 30% of TVL in halfInner to halfOuter bins
    const outerBins = halfOuter - halfInner;
    const outerUsdPerBin = (tvlUsd * 0.30) / (outerBins * 2);
    for (let i = -halfOuter; i < halfOuter; i++) {
      if (Math.abs(i) <= halfInner) continue;
      positions.push({
        priceLow: tokenPriceUsd * Math.pow(1 + stepFraction, i),
        priceHigh: tokenPriceUsd * Math.pow(1 + stepFraction, i + 1),
        liquidityUsd: outerUsdPerBin,
        source: "meteora",
      });
    }
  }

  return positions;
}

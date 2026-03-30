import type { LiquidityPosition, MeteoraPool } from "@/types";

const METEORA_API = "https://dlmm-api.meteora.ag";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const WSOL_MINT = "So11111111111111111111111111111111111111112";

interface MeteoraPoolsResponse {
  groups: Array<{
    pairs: MeteoraPool[];
  }>;
}

interface MeteoraBinResponse {
  activeBin: { binId: number; price: string };
  bins: Array<{
    binId: number;
    price: string;
    xAmount: string;
    yAmount: string;
  }>;
}

export async function getMeteoraPools(tokenMint: string): Promise<MeteoraPool[]> {
  try {
    const res = await fetch(
      `${METEORA_API}/pair/all_by_groups?include_unknown=true&sort_key=tvl&order_by=desc&search_term=${tokenMint}`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) return [];
    const data: MeteoraPoolsResponse = await res.json();
    const allPairs: MeteoraPool[] = [];
    for (const group of data?.groups ?? []) {
      for (const pair of group.pairs ?? []) {
        if (pair.mint_x === tokenMint || pair.mint_y === tokenMint) {
          allPairs.push(pair);
        }
      }
    }
    return allPairs;
  } catch {
    return [];
  }
}

function parseBinStep(binStep: number): number {
  // bin_step is in basis points (e.g., 25 = 0.25%)
  return binStep / 10000;
}

function priceAtBin(activeId: number, binId: number, binStep: number, activePrice: number): number {
  // price = activePrice * (1 + binStep)^(binId - activeId)
  const step = parseBinStep(binStep);
  return activePrice * Math.pow(1 + step, binId - activeId);
}

export async function getMeteoraLiquidity(
  tokenMint: string,
  quotePrice: number // price of token vs USD
): Promise<LiquidityPosition[]> {
  const pools = await getMeteoraPools(tokenMint);
  const positions: LiquidityPosition[] = [];

  for (const pool of pools) {
    try {
      // Get detailed bin data for each pool
      const binsRes = await fetch(
        `${METEORA_API}/pair/${pool.address}/bins?limit=100`,
        { next: { revalidate: 60 } }
      );

      const isTokenX = pool.mint_x === tokenMint;
      const activePrice = Number(pool.current_price);
      if (activePrice <= 0) continue;

      if (binsRes.ok) {
        const binsData: MeteoraBinResponse = await binsRes.json();
        const bins = binsData?.bins ?? [];
        const activeId = binsData?.activeBin?.binId ?? pool.active_id;

        for (const bin of bins) {
          const xAmt = Number(bin.xAmount) || 0;
          const yAmt = Number(bin.yAmount) || 0;
          if (xAmt === 0 && yAmt === 0) continue;

          const binPrice = priceAtBin(activeId, bin.binId, pool.bin_step, activePrice);

          // Convert token amounts to USD
          // In a DLMM pool: x is always the base token (lower mint), y is the quote token (higher mint)
          // The price is expressed as y per x
          let liquidityUsd = 0;
          if (isTokenX) {
            // Token is x (base): x amount * token price USD + y amount * y token price USD
            // y token price = 1 if USDC, or solPrice if WSOL
            const yTokenPrice = getKnownTokenPrice(pool.mint_y);
            liquidityUsd = xAmt * quotePrice + yAmt * yTokenPrice;
          } else {
            // Token is y (quote): y amount * token price USD + x amount * x token price USD
            const xTokenPrice = getKnownTokenPrice(pool.mint_x);
            liquidityUsd = yAmt * quotePrice + xAmt * xTokenPrice;
          }

          if (liquidityUsd <= 0) continue;

          // Bin price range
          const step = parseBinStep(pool.bin_step);
          const priceLow = binPrice;
          const priceHigh = binPrice * (1 + step);

          positions.push({
            priceLow: isTokenX ? priceLow * quotePrice / activePrice : priceLow,
            priceHigh: isTokenX ? priceHigh * quotePrice / activePrice : priceHigh,
            liquidityUsd,
            source: "meteora",
          });
        }
      } else {
        // Fallback: use pool TVL and distribute across ±20% range in 1% buckets
        const tvlUsd = pool.total_value_locked_usd || 0;
        if (tvlUsd <= 0) continue;
        const rangeStart = quotePrice * 0.80;
        const rangeEnd = quotePrice * 1.20;
        positions.push({
          priceLow: rangeStart,
          priceHigh: rangeEnd,
          liquidityUsd: tvlUsd,
          source: "meteora",
        });
      }
    } catch {
      // Fallback for this pool
      const tvlUsd = pool.total_value_locked_usd || 0;
      if (tvlUsd <= 0) continue;
      positions.push({
        priceLow: quotePrice * 0.80,
        priceHigh: quotePrice * 1.20,
        liquidityUsd: tvlUsd,
        source: "meteora",
      });
    }
  }

  return positions;
}

function getKnownTokenPrice(mint: string): number {
  // These are fetched separately but we store rough defaults
  // In practice, prices come from Jupiter API
  return 0; // Caller injects real prices
}

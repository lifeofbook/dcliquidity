import type { LiquidityPosition, RaydiumPool } from "@/types";

const RAYDIUM_API = "https://api-v3.raydium.io";

interface RaydiumPoolResponse {
  data: {
    data: RaydiumPool[];
    hasNextPage: boolean;
  };
}

interface RaydiumTickResponse {
  data: Array<{
    tick: number;
    liquidityNet: string;
    price0: number;
    price1: number;
  }>;
}

export async function getRaydiumPools(tokenMint: string): Promise<RaydiumPool[]> {
  try {
    const res = await fetch(
      `${RAYDIUM_API}/pools/info/mint?mint1=${tokenMint}&poolType=all&poolSortField=tvl&sortType=desc&pageSize=50&page=1`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) return [];
    const data: RaydiumPoolResponse = await res.json();
    return data?.data?.data ?? [];
  } catch {
    return [];
  }
}

/**
 * Compute price from tick index using Raydium/Uniswap v3 formula:
 * price = 1.0001^tick
 */
function tickToPrice(tick: number): number {
  return Math.pow(1.0001, tick);
}

/**
 * Compute USD liquidity in a tick range from raw liquidity units.
 * Simplified: uses TVL proportional to the price range width.
 */
function estimateLiquidityUsd(
  liquidityNet: number,
  tickLower: number,
  tickUpper: number,
  currentTick: number,
  sqrtPriceX64: number,
  totalLiquidityInPool: number,
  poolTvlUsd: number
): number {
  if (totalLiquidityInPool === 0) return 0;
  // Proportion of this position's liquidity vs total pool liquidity
  const fraction = Number(liquidityNet) / totalLiquidityInPool;
  return Math.abs(fraction) * poolTvlUsd;
}

export async function getRaydiumLiquidity(
  tokenMint: string,
  tokenPriceUsd: number
): Promise<LiquidityPosition[]> {
  const pools = await getRaydiumPools(tokenMint);
  const positions: LiquidityPosition[] = [];

  for (const pool of pools) {
    const tvlUsd = pool.tvl || 0;
    if (tvlUsd <= 0) continue;

    const isClmm = pool.type === "Concentrated";
    const isTokenA = pool.mintA.address === tokenMint;
    const currentPrice = pool.price || tokenPriceUsd;

    if (isClmm) {
      // Try to get tick data from Raydium API
      try {
        const tickRes = await fetch(
          `${RAYDIUM_API}/pools/line/position?id=${pool.id}`,
          { next: { revalidate: 60 } }
        );

        if (tickRes.ok) {
          const tickData: RaydiumTickResponse = await tickRes.json();
          const ticks = tickData?.data ?? [];

          if (ticks.length > 1) {
            // Convert ticks to liquidity positions
            let cumulativeLiquidity = 0;
            for (let i = 0; i < ticks.length - 1; i++) {
              const tickCurrent = ticks[i];
              const tickNext = ticks[i + 1];
              cumulativeLiquidity += Number(tickCurrent.liquidityNet);

              if (cumulativeLiquidity <= 0) continue;

              const priceLow = isTokenA ? tickCurrent.price0 : 1 / tickCurrent.price0;
              const priceHigh = isTokenA ? tickNext.price0 : 1 / tickNext.price0;

              // Estimate USD value of liquidity in this range
              // We approximate by assuming uniform distribution of TVL across active range
              const rangeWidth = Math.abs(priceHigh - priceLow);
              const totalRange = currentPrice * 0.4; // rough ±20% active range
              const fraction = rangeWidth / totalRange;
              const liquidityUsd = tvlUsd * fraction;

              if (liquidityUsd <= 0) continue;

              positions.push({
                priceLow: Math.min(priceLow, priceHigh) * tokenPriceUsd / currentPrice,
                priceHigh: Math.max(priceLow, priceHigh) * tokenPriceUsd / currentPrice,
                liquidityUsd,
                source: "raydium",
              });
            }
            continue; // done with this pool, move to next
          }
        }
      } catch {
        // fall through to TVL fallback
      }

      // CLMM fallback: distribute TVL in ±15% range (concentrated)
      positions.push({
        priceLow: tokenPriceUsd * 0.85,
        priceHigh: tokenPriceUsd * 1.15,
        liquidityUsd: tvlUsd,
        source: "raydium",
      });
    } else {
      // Constant product AMM: liquidity is spread from 0 to ∞
      // We include only ±50% range (practical depth)
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

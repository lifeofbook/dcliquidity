import type { LiquidityPosition, OrcaPool } from "@/types";

const ORCA_API = "https://api.mainnet.orca.so/v1";

interface OrcaPoolListResponse {
  whirlpools: OrcaPool[];
}

export async function getOrcaPools(tokenMint: string): Promise<OrcaPool[]> {
  try {
    const res = await fetch(`${ORCA_API}/whirlpool/list`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const data: OrcaPoolListResponse = await res.json();
    return (data?.whirlpools ?? []).filter(
      (p) => p.tokenA?.mint === tokenMint || p.tokenB?.mint === tokenMint
    );
  } catch {
    return [];
  }
}

/**
 * Price at a given tick index in Orca/Uniswap v3:
 * price = 1.0001^tick  (token1 per token0)
 */
function tickToPrice(tick: number): number {
  return Math.pow(1.0001, tick);
}

interface OrcaTickData {
  tickIndex: number;
  liquidityNet: string;
  liquidityGross: string;
}

interface OrcaPoolDetailResponse {
  tickCurrentIndex: number;
  sqrtPrice: string;
  liquidity: string;
  ticks?: OrcaTickData[];
}

export async function getOrcaLiquidity(
  tokenMint: string,
  tokenPriceUsd: number
): Promise<LiquidityPosition[]> {
  const pools = await getOrcaPools(tokenMint);
  const positions: LiquidityPosition[] = [];

  for (const pool of pools) {
    const tvlUsd = pool.tvl || 0;
    if (tvlUsd <= 0) continue;

    const isTokenA = pool.tokenA?.mint === tokenMint;
    const currentPrice = pool.price || 0;
    if (currentPrice <= 0) continue;

    try {
      // Try to get tick array data for this pool
      const detailRes = await fetch(
        `${ORCA_API}/whirlpool/${pool.address}`,
        { next: { revalidate: 60 } }
      );

      if (detailRes.ok) {
        const detail: OrcaPoolDetailResponse = await detailRes.json();
        const ticks = detail?.ticks;
        const totalLiquidity = Number(detail?.liquidity ?? "0");

        if (ticks && ticks.length > 1 && totalLiquidity > 0) {
          let cumulativeLiq = 0;

          for (let i = 0; i < ticks.length - 1; i++) {
            cumulativeLiq += Number(ticks[i].liquidityNet);
            if (cumulativeLiq <= 0) continue;

            const rawPriceLow = tickToPrice(ticks[i].tickIndex);
            const rawPriceHigh = tickToPrice(ticks[i + 1].tickIndex);

            // Convert to USD-denominated price for the searched token
            let priceLow: number, priceHigh: number;
            if (isTokenA) {
              priceLow = rawPriceLow * tokenPriceUsd / currentPrice;
              priceHigh = rawPriceHigh * tokenPriceUsd / currentPrice;
            } else {
              priceLow = (1 / rawPriceHigh) * tokenPriceUsd / currentPrice;
              priceHigh = (1 / rawPriceLow) * tokenPriceUsd / currentPrice;
            }

            // Estimate USD value proportionally
            const liqFraction = cumulativeLiq / totalLiquidity;
            const rangeWidth = Math.abs(rawPriceHigh - rawPriceLow);
            const totalActiveRange = currentPrice * 0.4;
            const rangeFraction = Math.min(rangeWidth / totalActiveRange, 1);
            const liquidityUsd = tvlUsd * liqFraction * rangeFraction;

            if (liquidityUsd <= 0) continue;

            positions.push({
              priceLow: Math.min(priceLow, priceHigh),
              priceHigh: Math.max(priceLow, priceHigh),
              liquidityUsd,
              source: "orca",
            });
          }
          continue;
        }
      }
    } catch {
      // fall through to TVL fallback
    }

    // Fallback: distribute TVL uniformly across ±20% (concentrated)
    positions.push({
      priceLow: tokenPriceUsd * 0.80,
      priceHigh: tokenPriceUsd * 1.20,
      liquidityUsd: tvlUsd,
      source: "orca",
    });
  }

  return positions;
}

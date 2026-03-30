import type {
  LiquidityPosition,
  LiquidityBucket,
  AggregatedLiquidity,
  TokenInfo,
  DEXSource,
} from "@/types";

/**
 * Number of buckets on each side of current price (support + resistance).
 * e.g. 50 means we show ±50% from current price in 1% steps.
 */
const BUCKET_RANGE = 50;
const BUCKET_STEP_PCT = 1; // each bucket = 1% price change

function emptySourceBreakdown() {
  return {
    meteora: 0,
    raydium: 0,
    orca: 0,
    jupiterLimit: 0,
    jupiterDca: 0,
    pumpfun: 0,
  };
}

/**
 * Build array of bucket price boundaries centered on currentPrice.
 * Bucket i=0 is the one containing currentPrice.
 * Negative indices are support (below), positive are resistance (above).
 */
function buildBuckets(currentPrice: number): LiquidityBucket[] {
  const buckets: LiquidityBucket[] = [];
  const step = BUCKET_STEP_PCT / 100;

  for (let i = -BUCKET_RANGE; i <= BUCKET_RANGE; i++) {
    const priceLow = currentPrice * Math.pow(1 + step, i);
    const priceHigh = currentPrice * Math.pow(1 + step, i + 1);
    const priceMid = (priceLow + priceHigh) / 2;

    buckets.push({
      index: i,
      priceLow,
      priceHigh,
      priceMid,
      totalUsd: 0,
      sources: emptySourceBreakdown(),
    });
  }

  return buckets;
}

/**
 * Distribute a liquidity position into the overlapping price buckets.
 * Splits the position's USD value proportionally by price range overlap.
 */
function distributePosition(
  position: LiquidityPosition,
  buckets: LiquidityBucket[]
): void {
  const { priceLow, priceHigh, liquidityUsd, source } = position;
  if (priceLow >= priceHigh || liquidityUsd <= 0) return;

  const positionRange = priceHigh - priceLow;

  for (const bucket of buckets) {
    // Calculate overlap between position range and bucket range
    const overlapLow = Math.max(priceLow, bucket.priceLow);
    const overlapHigh = Math.min(priceHigh, bucket.priceHigh);

    if (overlapHigh <= overlapLow) continue;

    const overlapFraction = (overlapHigh - overlapLow) / positionRange;
    const bucketLiquidity = liquidityUsd * overlapFraction;

    bucket.totalUsd += bucketLiquidity;
    bucket.sources[source as DEXSource] += bucketLiquidity;
  }
}

export function aggregateLiquidity(
  token: TokenInfo,
  currentPrice: number,
  positions: LiquidityPosition[]
): AggregatedLiquidity {
  const buckets = buildBuckets(currentPrice);

  for (const position of positions) {
    distributePosition(position, buckets);
  }

  // Compute totals
  const sourceBreakdown = emptySourceBreakdown();
  let totalLiquidityUsd = 0;

  for (const bucket of buckets) {
    for (const src of Object.keys(sourceBreakdown) as DEXSource[]) {
      sourceBreakdown[src] += bucket.sources[src];
    }
    totalLiquidityUsd += bucket.totalUsd;
  }

  return {
    token,
    currentPrice,
    buckets,
    totalLiquidityUsd,
    sourceBreakdown,
    fetchedAt: Date.now(),
  };
}

export function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

export function formatPrice(value: number): string {
  if (value === 0) return "$0";
  if (value >= 1) return `$${value.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
  // For small prices, use significant digits
  const str = value.toPrecision(4);
  return `$${str}`;
}

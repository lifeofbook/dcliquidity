export interface TokenInfo {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  price: number; // USD
}

export interface LiquidityBucket {
  /** bucket index relative to current price: 0 = current, negative = below (support), positive = above (resistance) */
  index: number;
  /** lower bound price of this bucket */
  priceLow: number;
  /** upper bound price of this bucket */
  priceHigh: number;
  /** mid price of bucket */
  priceMid: number;
  /** total USD liquidity in this bucket */
  totalUsd: number;
  /** breakdown by source */
  sources: {
    meteora: number;
    raydium: number;
    orca: number;
    jupiterLimit: number;
    jupiterDca: number;
    pumpfun: number;
  };
}

export interface PoolInfo {
  id: string;
  source: DEXSource;
  type: "clmm" | "dlmm" | "amm" | "limit" | "dca";
  tvlUsd: number;
  currentPrice: number;
  token0Mint: string;
  token1Mint: string;
}

export type DEXSource = "meteora" | "raydium" | "orca" | "pumpfun" | "jupiterLimit" | "jupiterDca";

export interface LiquidityPosition {
  priceLow: number;
  priceHigh: number;
  liquidityUsd: number;
  source: DEXSource;
}

export interface AggregatedLiquidity {
  token: TokenInfo;
  currentPrice: number;
  buckets: LiquidityBucket[];
  totalLiquidityUsd: number;
  sourceBreakdown: {
    meteora: number;
    raydium: number;
    orca: number;
    jupiterLimit: number;
    jupiterDca: number;
    pumpfun: number;
  };
  fetchedAt: number;
}

export interface MeteoraPool {
  address: string;
  name: string;
  mint_x: string;
  mint_y: string;
  current_price: number;
  liquidity: string;
  bin_step: number;
  active_id: number;
  fees_24h: number;
  trade_volume_24h: number;
  total_value_locked_usd: number;
}

export interface MeteoraPositionBin {
  binId: number;
  price: string;
  pricePerToken: string;
  binXAmount: string;
  binYAmount: string;
  binLiquidity: string;
  positionLiquidity: string;
  positionXAmount: string;
  positionYAmount: string;
}

export interface RaydiumPool {
  id: string;
  mintA: { address: string; decimals: number; symbol: string };
  mintB: { address: string; decimals: number; symbol: string };
  price: number;
  tvl: number;
  type: string;
  config?: { tickSpacing: number };
}

export interface OrcaPool {
  address: string;
  tokenA: { mint: string; symbol: string; decimals: number };
  tokenB: { mint: string; symbol: string; decimals: number };
  price: number;
  tvl: number;
  tickSpacing: number;
  liquidity: string;
}

export interface JupiterLimitOrder {
  publicKey: string;
  account: {
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    price: number;
    remainingInAmount: string;
    remainingOutAmount: string;
  };
}

export interface JupiterDCAOrder {
  publicKey: string;
  account: {
    inputMint: string;
    outputMint: string;
    inDeposited: string;
    inWithdrawn: string;
    outWithdrawn: string;
    cycleFrequency: number;
    inAmountPerCycle: string;
    nextCycleAt: number;
  };
}

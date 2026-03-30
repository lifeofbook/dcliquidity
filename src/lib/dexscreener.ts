import type { LiquidityPosition, DEXSource } from "@/types";

const DEXSCREENER_API = "https://api.dexscreener.com/latest/dex/tokens";

interface DexScreenerPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceNative: string;
  priceUsd: string;
  liquidity?: { usd?: number; base?: number; quote?: number };
  volume?: { h24?: number };
  labels?: string[];
}

interface DexScreenerResponse {
  pairs: DexScreenerPair[] | null;
}

function mapDexId(dexId: string): DEXSource {
  const id = (dexId ?? "").toLowerCase();
  // Check specific DEX names BEFORE "pump" to avoid misclassifying
  // a Raydium/Orca pool for a pump.fun token as "pumpfun"
  if (id.includes("meteora")) return "meteora";
  if (id.includes("raydium")) return "raydium";
  if (id.includes("orca")) return "orca";
  if (id === "pump" || id === "pump-amm" || id.startsWith("pump")) return "pumpfun";
  return "raydium";
}

/**
 * For DLMM (Meteora) distribute heavily concentrated around current price.
 * For CLMM (Raydium/Orca) slightly wider concentration.
 * For AMM/constant product distribute proportionally (higher weight near price).
 */
function buildPositions(
  dexId: string,
  source: DEXSource,
  liquidityUsd: number,
  tokenPriceUsd: number,
  labels?: string[]
): LiquidityPosition[] {
  const id = (dexId ?? "").toLowerCase();
  const lbls = (labels ?? []).map(l => l.toLowerCase());
  // Detect CLMM from dexId or pool labels (e.g. Raydium CLMM has label "CLMM" or "v3")
  const isClmmByLabel = lbls.some(l => ["clmm", "v3", "concentrated"].includes(l));
  const positions: LiquidityPosition[] = [];

  if (id.includes("meteora") || id.includes("dlmm")) {
    // DLMM: very concentrated — 60% within ±5%, 30% ±5-20%, 10% ±20-50%
    const innerUsd = liquidityUsd * 0.60;
    const midUsd = liquidityUsd * 0.30;
    const outerUsd = liquidityUsd * 0.10;
    const NUM_INNER = 10; // 10 buckets covering ±5%
    const NUM_MID = 30;
    const NUM_OUTER = 60;

    // inner ±5%
    for (let i = -NUM_INNER / 2; i < NUM_INNER / 2; i++) {
      const step = 0.01;
      positions.push({
        priceLow: tokenPriceUsd * Math.pow(1 + step, i),
        priceHigh: tokenPriceUsd * Math.pow(1 + step, i + 1),
        liquidityUsd: innerUsd / NUM_INNER,
        source,
      });
    }
    // mid ±5–20%
    for (let i = -NUM_MID / 2; i < NUM_MID / 2; i++) {
      if (Math.abs(i) < NUM_INNER / 2) continue;
      const step = 0.01;
      positions.push({
        priceLow: tokenPriceUsd * Math.pow(1 + step, i),
        priceHigh: tokenPriceUsd * Math.pow(1 + step, i + 1),
        liquidityUsd: midUsd / (NUM_MID - NUM_INNER),
        source,
      });
    }
    // outer ±20–50%
    for (let i = -NUM_OUTER / 2; i < NUM_OUTER / 2; i++) {
      if (Math.abs(i) < NUM_MID / 2) continue;
      const step = 0.01;
      positions.push({
        priceLow: tokenPriceUsd * Math.pow(1 + step, i),
        priceHigh: tokenPriceUsd * Math.pow(1 + step, i + 1),
        liquidityUsd: outerUsd / (NUM_OUTER - NUM_MID),
        source,
      });
    }
    return positions;
  }

  if (id.startsWith("pump")) {
    // Pump.fun / pumpswap AMM: the exact depth requires the bonding curve's
    // virtualSolReserves & virtualTokenReserves from on-chain state, which is not
    // available here. Use a symmetric gaussian ±20% as the neutral fallback so
    // support and resistance bars are equal — consistent with CLOBr's display.
    const RANGE = 40;
    const sigma = RANGE / 4; // σ = 10 bins
    const pumpWeights: number[] = [];
    for (let i = 0; i < RANGE; i++) {
      const dist = Math.abs(i - RANGE / 2 + 0.5);
      pumpWeights.push(Math.exp(-0.5 * Math.pow(dist / sigma, 2)));
    }
    const totalPumpWeight = pumpWeights.reduce((s, w) => s + w, 0);
    for (let i = 0; i < RANGE; i++) {
      const idx = i - RANGE / 2;
      const step = 0.01;
      positions.push({
        priceLow: tokenPriceUsd * Math.pow(1 + step, idx),
        priceHigh: tokenPriceUsd * Math.pow(1 + step, idx + 1),
        liquidityUsd: liquidityUsd * pumpWeights[i] / totalPumpWeight,
        source,
      });
    }
    return positions;
  }

  if (id.includes("clmm") || id.includes("orca") || isClmmByLabel) {
    // CLMM: concentrated ±20%, heavier near current price
    const RANGE = 40;
    for (let i = -RANGE / 2; i < RANGE / 2; i++) {
      const dist = Math.abs(i + 0.5);
      const weight = Math.exp(-0.5 * Math.pow(dist / (RANGE / 5), 2));
      const step = 0.01;
      positions.push({
        priceLow: tokenPriceUsd * Math.pow(1 + step, i),
        priceHigh: tokenPriceUsd * Math.pow(1 + step, i + 1),
        liquidityUsd: liquidityUsd * weight,
        source,
      });
    }
    // normalize
    const total = positions.reduce((s, p) => s + p.liquidityUsd, 0);
    return positions.map(p => ({ ...p, liquidityUsd: p.liquidityUsd / total * liquidityUsd }));
  }

  // AMM / constant product: depth ∝ 1/sqrt(price) — mathematically correct for
  // xy=k pools (marginal USD liquidity at price P is ∝ 1/√P).
  const RANGE = 200;
  const weights: number[] = [];
  for (let i = 0; i < RANGE; i++) {
    const relPrice = Math.pow(1.01, i - RANGE / 2 + 0.5);
    weights.push(1 / Math.sqrt(relPrice));
  }
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < RANGE; i++) {
    const idx = i - RANGE / 2;
    const step = 0.01;
    positions.push({
      priceLow: tokenPriceUsd * Math.pow(1 + step, idx),
      priceHigh: tokenPriceUsd * Math.pow(1 + step, idx + 1),
      liquidityUsd: liquidityUsd * weights[i] / totalWeight,
      source,
    });
  }
  return positions;
}

export async function getDexScreenerLiquidity(
  tokenMint: string,
  tokenPriceUsd: number
): Promise<LiquidityPosition[]> {
  try {
    const res = await fetch(`${DEXSCREENER_API}/${tokenMint}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];

    const data: DexScreenerResponse = await res.json();
    const pairs = (data?.pairs ?? []).filter(
      (p) => p.chainId === "solana" && (p.liquidity?.usd ?? 0) > 0
    );

    const positions: LiquidityPosition[] = [];

    for (const pair of pairs) {
      const liquidityUsd = pair.liquidity?.usd ?? 0;
      if (liquidityUsd <= 0) continue;
      const source = mapDexId(pair.dexId);
      const built = buildPositions(pair.dexId, source, liquidityUsd, tokenPriceUsd, pair.labels);
      positions.push(...built);
    }

    return positions;
  } catch {
    return [];
  }
}

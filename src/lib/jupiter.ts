import type { TokenInfo, JupiterLimitOrder, JupiterDCAOrder, LiquidityPosition } from "@/types";

const JUPITER_PRICE_API = "https://api.jup.ag/price/v2";
const JUPITER_TOKEN_API = "https://tokens.jup.ag/token";
const JUPITER_LIMIT_API = "https://api.jup.ag/limit/v2/openOrders";
const JUPITER_DCA_API = "https://dca.jup.ag/dca/v2/open-dca";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const WSOL_MINT = "So11111111111111111111111111111111111111112";

const fetchWithTimeout = async (url: string, timeout = 10000): Promise<Response> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal, next: { revalidate: 60 } });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
};

export async function getTokenPrice(mint: string): Promise<number> {
  try {
    const res = await fetchWithTimeout(`${JUPITER_PRICE_API}?ids=${mint}&vsToken=${USDC_MINT}`);
    if (!res.ok) return 0;
    const data = await res.json();
    return data?.data?.[mint]?.price ?? 0;
  } catch {
    return 0;
  }
}

export async function getTokenInfo(mint: string): Promise<TokenInfo | null> {
  try {
    const [tokenRes, priceRes] = await Promise.all([
      fetchWithTimeout(`${JUPITER_TOKEN_API}/${mint}`),
      fetchWithTimeout(`${JUPITER_PRICE_API}?ids=${mint}&vsToken=${USDC_MINT}`),
    ]);

    if (!tokenRes.ok) return null;
    const token = await tokenRes.json();
    const priceData = priceRes.ok ? await priceRes.json() : null;

    return {
      mint,
      symbol: token.symbol ?? "UNKNOWN",
      name: token.name ?? "Unknown Token",
      decimals: token.decimals ?? 9,
      logoURI: token.logoURI,
      price: priceData?.data?.[mint]?.price ?? 0,
    };
  } catch {
    return null;
  }
}

export async function getJupiterLimitOrders(
  tokenMint: string,
  currentPrice: number,
  tokenDecimals: number
): Promise<LiquidityPosition[]> {
  const positions: LiquidityPosition[] = [];

  const pairs = [
    { inputMint: tokenMint, outputMint: USDC_MINT },
    { inputMint: USDC_MINT, outputMint: tokenMint },
    { inputMint: tokenMint, outputMint: WSOL_MINT },
    { inputMint: WSOL_MINT, outputMint: tokenMint },
  ];

  const solPrice = await getTokenPrice(WSOL_MINT);

  for (const pair of pairs) {
    try {
      const url = `${JUPITER_LIMIT_API}?inputMint=${pair.inputMint}&outputMint=${pair.outputMint}`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) continue;
      const data: { orders: JupiterLimitOrder[] } = await res.json();
      const orders = data?.orders ?? [];

      for (const order of orders) {
        const { inputMint, outputMint, remainingInAmount, remainingOutAmount } = order.account;
        if (!remainingInAmount || !remainingOutAmount) continue;

        const inAmt = Number(remainingInAmount);
        const outAmt = Number(remainingOutAmount);
        if (inAmt <= 0 || outAmt <= 0) continue;

        let orderPrice = 0;
        let liquidityUsd = 0;

        if (inputMint === tokenMint && (outputMint === USDC_MINT || outputMint === WSOL_MINT)) {
          // Selling token → limit sell order → resistance above current price
          const outUsd = outputMint === USDC_MINT
            ? outAmt / 1e6
            : (outAmt / 1e9) * solPrice;
          const inTokenAmt = inAmt / Math.pow(10, tokenDecimals);
          orderPrice = outUsd / inTokenAmt;
          liquidityUsd = outUsd;
        } else if (outputMint === tokenMint && (inputMint === USDC_MINT || inputMint === WSOL_MINT)) {
          // Buying token → limit buy order → support below current price
          const inUsd = inputMint === USDC_MINT
            ? inAmt / 1e6
            : (inAmt / 1e9) * solPrice;
          const outTokenAmt = outAmt / Math.pow(10, tokenDecimals);
          orderPrice = inUsd / outTokenAmt;
          liquidityUsd = inUsd;
        }

        if (orderPrice <= 0 || liquidityUsd <= 0) continue;
        // Orders are point liquidity at a specific price — represent as a very thin bucket (±0.1%)
        const spread = orderPrice * 0.001;
        positions.push({
          priceLow: orderPrice - spread,
          priceHigh: orderPrice + spread,
          liquidityUsd,
          source: "jupiterLimit",
        });
      }
    } catch {
      // skip failed pair
    }
  }

  return positions;
}

export async function getJupiterDCAOrders(
  tokenMint: string,
  currentPrice: number,
  tokenDecimals: number
): Promise<LiquidityPosition[]> {
  const positions: LiquidityPosition[] = [];
  const solPrice = await getTokenPrice(WSOL_MINT);
  const now = Math.floor(Date.now() / 1000);
  const twentyFourHours = 86400;

  const pairs = [
    { inputMint: tokenMint, outputMint: USDC_MINT },
    { inputMint: USDC_MINT, outputMint: tokenMint },
    { inputMint: tokenMint, outputMint: WSOL_MINT },
    { inputMint: WSOL_MINT, outputMint: tokenMint },
  ];

  for (const pair of pairs) {
    try {
      const url = `${JUPITER_DCA_API}?inputMint=${pair.inputMint}&outputMint=${pair.outputMint}`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) continue;
      const data: { dcaAccounts: JupiterDCAOrder[] } = await res.json();
      const orders = data?.dcaAccounts ?? [];

      for (const order of orders) {
        const { inputMint, cycleFrequency, inAmountPerCycle, nextCycleAt } = order.account;
        if (!cycleFrequency || !inAmountPerCycle) continue;

        const cyclesIn24h = Math.floor(twentyFourHours / Number(cycleFrequency));
        if (cyclesIn24h <= 0) continue;

        const totalInAmt = Number(inAmountPerCycle) * cyclesIn24h;

        let liquidityUsd = 0;
        if (inputMint === USDC_MINT) {
          liquidityUsd = totalInAmt / 1e6;
        } else if (inputMint === WSOL_MINT) {
          liquidityUsd = (totalInAmt / 1e9) * solPrice;
        } else if (inputMint === tokenMint) {
          liquidityUsd = (totalInAmt / Math.pow(10, tokenDecimals)) * currentPrice;
        }

        if (liquidityUsd <= 0) continue;

        // DCA spreads around current price — represent as ±5% range around current price
        positions.push({
          priceLow: currentPrice * 0.95,
          priceHigh: currentPrice * 1.05,
          liquidityUsd,
          source: "jupiterDca",
        });
      }
    } catch {
      // skip
    }
  }

  return positions;
}

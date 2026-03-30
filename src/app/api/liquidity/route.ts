import { NextRequest, NextResponse } from "next/server";
import { getTokenInfo, getJupiterLimitOrders, getJupiterDCAOrders } from "@/lib/jupiter";
import { getMeteoraLiquidity } from "@/lib/meteora";
import { getRaydiumLiquidity } from "@/lib/raydium";
import { getOrcaLiquidity } from "@/lib/orca";
import { getDexScreenerLiquidity } from "@/lib/dexscreener";
import { aggregateLiquidity } from "@/lib/aggregator";
import type { LiquidityPosition } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const mint = searchParams.get("mint");

  if (!mint || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) {
    return NextResponse.json({ error: "Invalid mint address" }, { status: 400 });
  }

  try {
    // 1. Fetch token info + price
    const token = await getTokenInfo(mint);
    if (!token) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    const currentPrice = token.price;
    if (currentPrice <= 0) {
      return NextResponse.json(
        { error: "No price data available for this token" },
        { status: 404 }
      );
    }

    // 2. Fetch all liquidity sources in parallel
    // DexScreener is the reliable baseline; native DEX APIs provide enhanced precision
    const [
      dexscreenerPositions,
      meteoraPositions,
      raydiumPositions,
      orcaPositions,
      limitOrderPositions,
      dcaPositions,
    ] = await Promise.allSettled([
      getDexScreenerLiquidity(mint, currentPrice),
      getMeteoraLiquidity(mint, currentPrice),
      getRaydiumLiquidity(mint, currentPrice),
      getOrcaLiquidity(mint, currentPrice),
      getJupiterLimitOrders(mint, currentPrice, token.decimals),
      getJupiterDCAOrders(mint, currentPrice, token.decimals),
    ]);

    const dexPositions =
      dexscreenerPositions.status === "fulfilled" ? dexscreenerPositions.value : [];
    const meteoraPos = meteoraPositions.status === "fulfilled" ? meteoraPositions.value : [];
    const raydiumPos = raydiumPositions.status === "fulfilled" ? raydiumPositions.value : [];
    const orcaPos = orcaPositions.status === "fulfilled" ? orcaPositions.value : [];
    const orderPositions: LiquidityPosition[] = [
      ...(limitOrderPositions.status === "fulfilled" ? limitOrderPositions.value : []),
      ...(dcaPositions.status === "fulfilled" ? dcaPositions.value : []),
    ];

    // Strategy: use native API data for each DEX when available (more accurate),
    // and supplement with DexScreener for any sources the native APIs missed.
    const meteoraUsd = meteoraPos.reduce((s, p) => s + p.liquidityUsd, 0);
    const raydiumUsd = raydiumPos.reduce((s, p) => s + p.liquidityUsd, 0);
    const orcaUsd = orcaPos.reduce((s, p) => s + p.liquidityUsd, 0);

    // Only pull DexScreener positions for sources the native APIs didn't cover
    const dexScreenerFill = dexPositions.filter((p) => {
      if (p.source === "meteora" && meteoraUsd > 0) return false;
      if (p.source === "raydium" && raydiumUsd > 0) return false;
      if (p.source === "orca" && orcaUsd > 0) return false;
      return true;
    });

    const allPositions: LiquidityPosition[] = [
      ...meteoraPos,
      ...raydiumPos,
      ...orcaPos,
      ...dexScreenerFill,
      ...orderPositions,
    ];

    // 3. Aggregate into 1% price buckets
    const result = aggregateLiquidity(token, currentPrice, allPositions);

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
      },
    });
  } catch (err) {
    console.error("[liquidity] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

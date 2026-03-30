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
    const nativePositions: LiquidityPosition[] = [
      ...(meteoraPositions.status === "fulfilled" ? meteoraPositions.value : []),
      ...(raydiumPositions.status === "fulfilled" ? raydiumPositions.value : []),
      ...(orcaPositions.status === "fulfilled" ? orcaPositions.value : []),
    ];
    const orderPositions: LiquidityPosition[] = [
      ...(limitOrderPositions.status === "fulfilled" ? limitOrderPositions.value : []),
      ...(dcaPositions.status === "fulfilled" ? dcaPositions.value : []),
    ];

    // Merge: if native DEX APIs returned positions, prefer those (more precise).
    // Otherwise fall back to DexScreener pool data.
    const nativeLiquidityUsd = nativePositions.reduce((s, p) => s + p.liquidityUsd, 0);
    const dexLiquidityUsd = dexPositions.reduce((s, p) => s + p.liquidityUsd, 0);

    let poolPositions: LiquidityPosition[];
    if (nativeLiquidityUsd > 0) {
      poolPositions = nativePositions;
    } else {
      // Native APIs returned nothing — use DexScreener as fallback
      poolPositions = dexPositions;
    }

    const allPositions: LiquidityPosition[] = [...poolPositions, ...orderPositions];

    // 3. Aggregate into 1% price buckets
    const result = aggregateLiquidity(token, currentPrice, allPositions);

    // Expose which source was used
    (result as typeof result & { dataSource: string }).dataSource =
      nativeLiquidityUsd > 0 ? "native" : "dexscreener";

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

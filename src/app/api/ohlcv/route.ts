import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GeckoTerminal free public API — no API key required
const GECKO_API = "https://api.geckoterminal.com/api/v2";

interface GeckoPool {
  id: string; // "solana_POOL_ADDRESS"
  attributes: {
    address: string;
    reserve_in_usd: string;
    volume_usd: { h24: string };
    base_token_price_usd: string;
  };
}

interface GeckoOhlcvRow {
  // [timestamp_seconds, open, high, low, close, volume]
  0: number;
  1: string;
  2: string;
  3: string;
  4: string;
  5: string;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const mint = searchParams.get("mint");
  const resolution = searchParams.get("resolution") ?? "60"; // minutes

  if (!mint || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) {
    return NextResponse.json({ error: "Invalid mint address" }, { status: 400 });
  }

  try {
    // Step 1: find the best pool for this token on Solana
    const poolsRes = await fetch(
      `${GECKO_API}/networks/solana/tokens/${mint}/pools?page=1`,
      { next: { revalidate: 120 } }
    );

    if (!poolsRes.ok) {
      return NextResponse.json({ error: "No pools found" }, { status: 404 });
    }

    const poolsData: { data: GeckoPool[] } = await poolsRes.json();
    const pools = poolsData?.data ?? [];

    if (pools.length === 0) {
      return NextResponse.json({ error: "No pools found" }, { status: 404 });
    }

    // Pick the pool with highest liquidity
    const bestPool = pools
      .filter((p) => p.attributes.address)
      .sort(
        (a, b) =>
          parseFloat(b.attributes.reserve_in_usd || "0") -
          parseFloat(a.attributes.reserve_in_usd || "0")
      )[0];

    if (!bestPool) {
      return NextResponse.json({ error: "No usable pool" }, { status: 404 });
    }

    const poolAddress = bestPool.attributes.address;

    // Step 2: map resolution (minutes) to GeckoTerminal timeframe
    const timeframeMap: Record<string, { aggregate: string; timeframe: string; limit: number }> = {
      "1": { aggregate: "1", timeframe: "minute", limit: 200 },
      "5": { aggregate: "5", timeframe: "minute", limit: 200 },
      "15": { aggregate: "15", timeframe: "minute", limit: 200 },
      "60": { aggregate: "1", timeframe: "hour", limit: 168 },   // 7 days
      "240": { aggregate: "4", timeframe: "hour", limit: 168 },
      "1440": { aggregate: "1", timeframe: "day", limit: 90 },
    };

    const tf = timeframeMap[resolution] ?? timeframeMap["60"];

    const ohlcvRes = await fetch(
      `${GECKO_API}/networks/solana/pools/${poolAddress}/ohlcv/${tf.timeframe}?aggregate=${tf.aggregate}&limit=${tf.limit}&currency=usd&token=base`,
      { next: { revalidate: 60 } }
    );

    if (!ohlcvRes.ok) {
      return NextResponse.json({ error: "OHLCV fetch failed" }, { status: 502 });
    }

    const ohlcvData: { data: { attributes: { ohlcv_list: GeckoOhlcvRow[] } } } =
      await ohlcvRes.json();

    const rawOhlcv = ohlcvData?.data?.attributes?.ohlcv_list ?? [];

    // GeckoTerminal returns newest first — reverse to oldest first for charts
    const candles = rawOhlcv
      .slice()
      .reverse()
      .map((row) => ({
        time: row[0] as number,
        open: parseFloat(row[1] as string),
        high: parseFloat(row[2] as string),
        low: parseFloat(row[3] as string),
        close: parseFloat(row[4] as string),
        volume: parseFloat(row[5] as string),
      }))
      .filter((c) => c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0);

    return NextResponse.json(
      { candles, poolAddress },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" } }
    );
  } catch (err) {
    console.error("[ohlcv] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

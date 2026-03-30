import { NextRequest, NextResponse } from "next/server";

const JUPITER_TOKEN_SEARCH = "https://tokens.jup.ag/tokens";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ tokens: [] });
  }

  try {
    // Search by symbol/name via Jupiter token list (tagged tokens first)
    const res = await fetch(`${JUPITER_TOKEN_SEARCH}?tags=verified`, {
      next: { revalidate: 3600 },
    });

    if (!res.ok) return NextResponse.json({ tokens: [] });

    const tokens: Array<{
      address: string;
      symbol: string;
      name: string;
      decimals: number;
      logoURI?: string;
    }> = await res.json();

    const lower = q.toLowerCase();

    // Check if query looks like a mint address
    const isMint = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q);
    let results;

    if (isMint) {
      results = tokens.filter((t) => t.address === q).slice(0, 10);
      if (results.length === 0) {
        // Return the mint directly so user can still look it up
        results = [{ address: q, symbol: q.slice(0, 6) + "...", name: "Unknown Token", decimals: 9 }];
      }
    } else {
      results = tokens
        .filter(
          (t) =>
            t.symbol.toLowerCase().includes(lower) ||
            t.name.toLowerCase().includes(lower)
        )
        .slice(0, 20);
    }

    return NextResponse.json({ tokens: results });
  } catch {
    return NextResponse.json({ tokens: [] });
  }
}

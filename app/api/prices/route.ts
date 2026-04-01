import { NextResponse } from 'next/server';

interface YahooQuote {
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
}

interface YahooResponse {
  quoteSummary?: {
    result?: Array<{ price?: YahooQuote }>;
    error?: unknown;
  };
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice: number;
        chartPreviousClose: number;
      };
    }>;
    error?: unknown;
  };
}

async function fetchTicker(symbol: string): Promise<{ price: number; change: number; changePct: number } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; vnzla-oil-dashboard/1.0)',
      },
      next: { revalidate: 300 }, // 5-minute cache
    });

    if (!res.ok) return null;

    const data: YahooResponse = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;

    const price = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose;
    const change = price - prevClose;
    const changePct = (change / prevClose) * 100;

    return {
      price: Math.round(price * 100) / 100,
      change: Math.round(change * 100) / 100,
      changePct: Math.round(changePct * 100) / 100,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const [brent, wti] = await Promise.all([
    fetchTicker('BZ=F'),
    fetchTicker('CL=F'),
  ]);

  // If both fetches fail, return 503 so the client falls back to static values
  if (!brent && !wti) {
    return NextResponse.json(
      { error: 'Price feed unavailable' },
      { status: 503 }
    );
  }

  return NextResponse.json(
    {
      brent: brent ?? { price: 118.35, change: 5.61, changePct: 5.0 },
      wti: wti ?? { price: 102.24, change: 4.88, changePct: 5.02 },
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      },
    }
  );
}

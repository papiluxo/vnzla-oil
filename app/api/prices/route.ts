import { NextResponse } from 'next/server';

interface YahooResponse {
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
  // Fetch Brent front-month, Brent next-month, WTI, petcoke in parallel
  const [brent, brentNext, wti, petcokePc, petcokeMtf] = await Promise.all([
    fetchTicker('BZ=F'),        // Brent continuous front-month
    fetchTicker('BZN26.NYM'),   // Brent Jul 2026 contract (next major)
    fetchTicker('CL=F'),        // WTI front-month
    fetchTicker('PC=F'),
    fetchTicker('MTF=F'),
  ]);

  // If both primary feeds fail, return 503 so the client falls back to static values
  if (!brent && !wti) {
    return NextResponse.json(
      { error: 'Price feed unavailable' },
      { status: 503 }
    );
  }

  // Merey: derived from Brent minus configurable spread
  const spread = parseFloat(process.env.MEREY_SPREAD ?? '9.0');
  const brentPrice = (brent ?? { price: 118.35 }).price;
  const mereyPrice = Math.round((brentPrice - spread) * 100) / 100;
  const merey = {
    price: mereyPrice,
    spread,
    note: `Derived: Brent minus $${spread.toFixed(2)} spread`,
  };

  // Petcoke: try Yahoo symbols, fall back to static estimate
  const petcokeRaw = petcokePc ?? petcokeMtf;
  const petcoke = petcokeRaw
    ? { ...petcokeRaw, live: true, note: 'Yahoo Finance' }
    : { price: 45, change: 0, changePct: 0, live: false, note: 'Estimate — no free live feed' };

  return NextResponse.json(
    {
      brent: brent ?? { price: 118.35, change: 5.61, changePct: 5.0 },
      brentNext: brentNext ?? null,
      wti: wti ?? { price: 102.24, change: 4.88, changePct: 5.02 },
      merey,
      petcoke,
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      },
    }
  );
}

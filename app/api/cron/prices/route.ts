import { NextRequest, NextResponse } from 'next/server';

// Vercel cron job — runs every 4 hours.
// Hits the /api/prices endpoint to warm the cache.
// In the future: write to Vercel KV for persistence across cold starts.
export async function GET(req: NextRequest) {
  // Protect cron endpoint in production
  const authHeader = req.headers.get('authorization');
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
    const res = await fetch(`${base}/api/prices`, {
      // Force a fresh fetch — bypass Next.js cache
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`Prices API responded ${res.status}`);
    }

    const data = await res.json();
    console.log('[cron/prices] refreshed at', new Date().toISOString(), data);

    return NextResponse.json({
      ok: true,
      refreshed: new Date().toISOString(),
      brent: data.brent?.price,
      wti: data.wti?.price,
    });
  } catch (err) {
    console.error('[cron/prices] failed:', err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}

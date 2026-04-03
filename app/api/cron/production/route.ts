import { NextRequest, NextResponse } from 'next/server';

// Vercel cron job — runs on the 1st of each month at noon UTC.
// Warms the /api/production cache so the first visitor after month-start
// gets fresh EIA data rather than a cold-start delay.
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
    const res = await fetch(`${base}/api/production`, {
      cache: 'no-store', // Force fresh fetch — bypass Next.js cache
    });

    if (!res.ok) {
      throw new Error(`Production API responded ${res.status}`);
    }

    const data = await res.json();
    const latest = data?.data?.[0];

    console.log(
      '[cron/production] cache warmed at',
      new Date().toISOString(),
      '— source:', data.source,
      '— latest:', latest?.period, latest?.value, 'TBPD'
    );

    return NextResponse.json({
      ok: true,
      refreshed: new Date().toISOString(),
      source: data.source,
      latestPeriod: latest?.period ?? null,
      latestValue: latest?.value ?? null,
    });
  } catch (err) {
    console.error('[cron/production] failed:', err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}

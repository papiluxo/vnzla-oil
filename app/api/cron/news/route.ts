import { NextRequest, NextResponse } from 'next/server';

// Vercel cron job — runs daily at 08:00 UTC.
// Hits the /api/news endpoint to warm the cache.
// In the future: write headlines to Vercel KV for persistence.
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
    const res = await fetch(`${base}/api/news`, {
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`News API responded ${res.status}`);
    }

    const data = await res.json();
    const count = data.items?.length ?? 0;
    console.log('[cron/news] refreshed at', new Date().toISOString(), `${count} items`);

    return NextResponse.json({
      ok: true,
      refreshed: new Date().toISOString(),
      itemCount: count,
      headlines: (data.items ?? []).map((i: { title: string }) => i.title),
    });
  } catch (err) {
    console.error('[cron/news] failed:', err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}

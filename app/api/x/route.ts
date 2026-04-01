import { NextResponse } from 'next/server';

// X/Twitter API v2 — Recent Search
// Requires TWITTER_BEARER_TOKEN env var (Basic tier $100/mo or Academic Research)
// Falls back gracefully if not configured

interface Tweet {
  text: string;
  url: string;
  created_at: string;
  author: string;
}

export async function GET() {
  const token = process.env.TWITTER_BEARER_TOKEN;

  if (!token) {
    // No token configured — return empty so news ribbon falls back to RSS
    return NextResponse.json(
      { items: [], note: 'TWITTER_BEARER_TOKEN not configured', timestamp: new Date().toISOString() },
      { headers: { 'Cache-Control': 'public, s-maxage=60' } }
    );
  }

  try {
    const query = encodeURIComponent(
      '(venezuela oil OR PDVSA OR "venezuelan crude" OR "venezuela production") -is:retweet lang:en'
    );
    const url = `https://api.twitter.com/2/tweets/search/recent?query=${query}&max_results=10&sort_order=relevancy&tweet.fields=created_at,author_id,public_metrics&expansions=author_id&user.fields=username,name`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 900 }, // 15-min cache
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[api/x] Twitter API error:', res.status, err);
      return NextResponse.json(
        { items: [], error: `Twitter API ${res.status}`, timestamp: new Date().toISOString() },
        { status: 200 } // Don't break the ribbon
      );
    }

    const data = await res.json();
    const users = new Map<string, string>();
    if (data.includes?.users) {
      for (const u of data.includes.users) {
        users.set(u.id, `@${u.username}`);
      }
    }

    const items: Tweet[] = (data.data || []).map((t: { text: string; id: string; created_at: string; author_id: string }) => ({
      text: t.text.replace(/https:\/\/t\.co\/\S+/g, '').trim().substring(0, 140),
      url: `https://x.com/i/status/${t.id}`,
      created_at: t.created_at,
      author: users.get(t.author_id) || '',
    }));

    return NextResponse.json(
      { items, timestamp: new Date().toISOString() },
      { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=300' } }
    );
  } catch (err) {
    console.error('[api/x] fetch failed:', err);
    return NextResponse.json(
      { items: [], error: 'X feed unavailable', timestamp: new Date().toISOString() },
      { status: 200 }
    );
  }
}

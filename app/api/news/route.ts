import { NextResponse } from 'next/server';

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

function parseRSS(xml: string): NewsItem[] {
  const items: NewsItem[] = [];

  // Extract <item> blocks
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);

  for (const match of itemMatches) {
    const block = match[1];

    const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
      ?? block.match(/<title>(.*?)<\/title>/)?.[1]
      ?? '';

    const link = block.match(/<link>(.*?)<\/link>/)?.[1]
      ?? block.match(/<guid>(.*?)<\/guid>/)?.[1]
      ?? '';

    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? '';

    // Google News RSS encodes source as last part of title after " - "
    const titleParts = title.split(' - ');
    const source = titleParts.length > 1 ? titleParts[titleParts.length - 1].trim() : '';
    const cleanTitle = titleParts.slice(0, -1).join(' - ').trim() || title;

    if (cleanTitle && link) {
      items.push({ title: cleanTitle, link, pubDate, source });
    }

    if (items.length >= 5) break;
  }

  return items;
}

export async function GET() {
  try {
    const query = encodeURIComponent('venezuela oil production sanctions 2026');
    const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; vnzla-oil-dashboard/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
      next: { revalidate: 3600 }, // 1-hour cache
    });

    if (!res.ok) {
      throw new Error(`RSS fetch failed: ${res.status}`);
    }

    const xml = await res.text();
    const items = parseRSS(xml);

    return NextResponse.json(
      { items, timestamp: new Date().toISOString() },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=300',
        },
      }
    );
  } catch (err) {
    console.error('[api/news] fetch failed:', err);
    return NextResponse.json(
      { items: [], error: 'News feed unavailable', timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }
}

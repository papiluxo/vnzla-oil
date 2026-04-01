import { NextResponse } from 'next/server';

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

function parseRSS(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
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

    // Google News encodes source after last " - "
    const titleParts = title.split(' - ');
    const source = titleParts.length > 1 ? titleParts[titleParts.length - 1].trim() : '';
    const cleanTitle = titleParts.slice(0, -1).join(' - ').trim() || title;

    if (cleanTitle && link) {
      items.push({ title: cleanTitle, link, pubDate, source });
    }
  }
  return items;
}

const RSS_FEEDS = [
  // Multiple queries for broader, fresher coverage
  'https://news.google.com/rss/search?q=venezuela+oil+production+sanctions&hl=en-US&gl=US&ceid=US:en',
  'https://news.google.com/rss/search?q=PDVSA+chevron+venezuela&hl=en-US&gl=US&ceid=US:en',
  'https://news.google.com/rss/search?q=brent+crude+oil+price+hormuz&hl=en-US&gl=US&ceid=US:en',
  'https://news.google.com/rss/search?q=oil+market+OPEC+production&hl=en-US&gl=US&ceid=US:en',
];

export async function GET() {
  try {
    // Fetch all feeds in parallel
    const results = await Promise.allSettled(
      RSS_FEEDS.map(url =>
        fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; vnzla-oil-dashboard/1.0)',
            Accept: 'application/rss+xml, application/xml, text/xml',
          },
          next: { revalidate: 1800 }, // 30-min cache per feed
        }).then(r => r.ok ? r.text() : '')
      )
    );

    // Collect and deduplicate
    const seen = new Set<string>();
    const allItems: NewsItem[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        for (const item of parseRSS(result.value)) {
          const key = item.title.toLowerCase().substring(0, 60);
          if (!seen.has(key)) {
            seen.add(key);
            allItems.push(item);
          }
        }
      }
    }

    // Sort by date descending, take top 15
    allItems.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
    const items = allItems.slice(0, 15);

    return NextResponse.json(
      { items, timestamp: new Date().toISOString() },
      { headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=300' } }
    );
  } catch (err) {
    console.error('[api/news] fetch failed:', err);
    return NextResponse.json(
      { items: [], error: 'News feed unavailable', timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }
}

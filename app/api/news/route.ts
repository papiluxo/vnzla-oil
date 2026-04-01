import { NextResponse } from 'next/server';

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

function parseRSS(xml: string, fallbackSource?: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);

  for (const match of itemMatches) {
    const block = match[1];
    const rawTitle = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
      ?? block.match(/<title>(.*?)<\/title>/)?.[1]
      ?? '';
    const link = block.match(/<link>(.*?)<\/link>/)?.[1]
      ?? block.match(/<guid.*?>(.*?)<\/guid>/)?.[1]
      ?? '';
    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? '';

    // Google News encodes source after last " - "
    const titleParts = rawTitle.split(' - ');
    let source = fallbackSource || '';
    let title = rawTitle;
    if (!fallbackSource && titleParts.length > 1) {
      source = titleParts[titleParts.length - 1].trim();
      title = titleParts.slice(0, -1).join(' - ').trim();
    }

    // Decode HTML entities
    title = title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');

    if (title && link) {
      items.push({ title, link, pubDate, source });
    }
  }
  return items;
}

// Multiple feeds for maximum freshness — Google News has ~2h delay,
// direct publisher feeds are near-real-time
const RSS_FEEDS: { url: string; source?: string }[] = [
  // Direct publisher feeds (fastest updates)
  { url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html', source: 'CNBC Energy' },
  { url: 'https://oilprice.com/rss/main', source: 'OilPrice' },
  { url: 'https://feeds.bloomberg.com/markets/news.rss', source: 'Bloomberg' },
  // Google News (broader, but 1-3h delay)
  { url: 'https://news.google.com/rss/search?q=venezuela+oil+PDVSA+sanctions+when:1d&hl=en-US&gl=US&ceid=US:en' },
  { url: 'https://news.google.com/rss/search?q=brent+crude+oil+hormuz+when:1d&hl=en-US&gl=US&ceid=US:en' },
  { url: 'https://news.google.com/rss/search?q=OPEC+oil+production+market+when:1d&hl=en-US&gl=US&ceid=US:en' },
  { url: 'https://news.google.com/rss/search?q=oil+price+crude+when:1d&hl=en-US&gl=US&ceid=US:en' },
];

// Oil-related keywords for filtering non-oil articles from general feeds
const OIL_KEYWORDS = /oil|crude|brent|wti|opec|petroleum|barrel|refin|pipeline|lng|gas|energy|drill|sanctions|venezuela|pdvsa|hormuz|iran|saudi/i;

export async function GET() {
  try {
    const results = await Promise.allSettled(
      RSS_FEEDS.map(feed =>
        fetch(feed.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            Accept: 'application/rss+xml, application/xml, text/xml, */*',
          },
          next: { revalidate: 600 }, // 10-min cache
        }).then(r => r.ok ? r.text().then(xml => ({ xml, source: feed.source })) : null)
      )
    );

    const seen = new Set<string>();
    const allItems: NewsItem[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        const { xml, source } = result.value;
        for (const item of parseRSS(xml, source)) {
          // Filter: only oil/energy related from general feeds
          if (source && !OIL_KEYWORDS.test(item.title)) continue;

          const key = item.title.toLowerCase().substring(0, 50);
          if (!seen.has(key)) {
            seen.add(key);
            allItems.push(item);
          }
        }
      }
    }

    // Sort by date, newest first
    allItems.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
    const items = allItems.slice(0, 20);

    return NextResponse.json(
      { items, timestamp: new Date().toISOString() },
      { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=120' } }
    );
  } catch (err) {
    console.error('[api/news] fetch failed:', err);
    return NextResponse.json(
      { items: [], error: 'News feed unavailable', timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }
}

import { NextResponse } from 'next/server';

interface ProdPoint {
  period: string;
  value: number;
  source: string;
}

interface EiaResponse {
  response?: {
    data?: { period: string; value: number | string }[];
  };
}

// Recent estimates from CEIC, Trading Economics, Kpler vessel tracking
// Updated by daily-vnzla-intel agent or manually
// These supplement EIA which lags ~3 months
const RECENT_ESTIMATES: ProdPoint[] = [
  { period: '2026-03', value: 1090, source: 'Kpler/vessel exports' },
  { period: '2026-02', value: 903, source: 'CEIC (crude-only)' },
  { period: '2026-01', value: 924, source: 'Trading Economics' },
];

export async function GET() {
  const apiKey = process.env.EIA_API_KEY;
  let eiaData: ProdPoint[] = [];

  if (apiKey) {
    try {
      const url =
        'https://api.eia.gov/v2/international/data/' +
        `?api_key=${apiKey}` +
        '&frequency=monthly' +
        '&data[0]=value' +
        '&facets[activityId][]=1' +
        '&facets[productId][]=57' +
        '&facets[countryRegionId][]=VEN' +
        '&facets[unit][]=TBPD' +
        '&sort[0][column]=period' +
        '&sort[0][direction]=desc' +
        '&length=24';

      const res = await fetch(url, {
        next: { revalidate: 21600 },
      });

      if (res.ok) {
        const raw: EiaResponse = await res.json();
        const items = raw?.response?.data;
        if (items && items.length > 0) {
          eiaData = items.map((item) => ({
            period: item.period,
            value: typeof item.value === 'string' ? parseFloat(item.value) : item.value,
            source: 'EIA',
          }));
        }
      }
    } catch (err) {
      console.error('[api/production] EIA fetch error:', err);
    }
  }

  // Merge: recent estimates fill gaps that EIA hasn't published yet
  const eiaLatest = eiaData.length > 0 ? eiaData[0].period : '0000-00';
  const supplemental = RECENT_ESTIMATES.filter(r => r.period > eiaLatest);

  // Combined: recent estimates first (newest), then EIA data
  const merged = [...supplemental, ...eiaData];
  merged.sort((a, b) => b.period.localeCompare(a.period));

  const primarySource = supplemental.length > 0 ? 'eia+estimates' : eiaData.length > 0 ? 'eia' : 'fallback';

  console.log(
    '[api/production]',
    primarySource,
    '— latest:', merged[0]?.period, merged[0]?.value, 'TBPD',
    '(' + merged[0]?.source + ')',
    '| EIA latest:', eiaLatest,
    '| supplemental months:', supplemental.length
  );

  return NextResponse.json(
    {
      data: merged.map(d => ({ period: d.period, value: d.value, source: d.source })),
      source: primarySource,
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=3600',
      },
    }
  );
}

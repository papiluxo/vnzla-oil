import { NextResponse } from 'next/server';

interface EiaResponseItem {
  period: string;
  value: number | string;
}

interface EiaResponse {
  response?: {
    data?: EiaResponseItem[];
  };
}

// Hardcoded fallback — last known monthly production (TBPD = thousand barrels/day)
const FALLBACK_DATA = [
  { period: '2026-02', value: 990 },
  { period: '2026-01', value: 958 },
  { period: '2025-12', value: 924 },
  { period: '2025-11', value: 891 },
  { period: '2025-10', value: 876 },
  { period: '2025-09', value: 862 },
  { period: '2025-08', value: 855 },
  { period: '2025-07', value: 843 },
  { period: '2025-06', value: 831 },
  { period: '2025-05', value: 820 },
  { period: '2025-04', value: 808 },
  { period: '2025-03', value: 795 },
  { period: '2025-02', value: 783 },
  { period: '2025-01', value: 771 },
];

export async function GET() {
  const apiKey = process.env.EIA_API_KEY;

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
        next: { revalidate: 21600 }, // 6-hour cache — EIA data only updates monthly
      });

      if (res.ok) {
        const raw: EiaResponse = await res.json();
        const items = raw?.response?.data;

        if (items && items.length > 0) {
          const data = items.map((item) => ({
            period: item.period,
            value: typeof item.value === 'string' ? parseFloat(item.value) : item.value,
          }));

          console.log(
            '[api/production] EIA fetch ok — latest:',
            data[0]?.period,
            data[0]?.value,
            'TBPD'
          );

          return NextResponse.json(
            { data, source: 'eia', timestamp: new Date().toISOString() },
            {
              headers: {
                'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=3600',
              },
            }
          );
        }
      }

      console.warn('[api/production] EIA returned non-ok or empty — falling back. status:', res.status);
    } catch (err) {
      console.error('[api/production] EIA fetch error:', err);
    }
  } else {
    console.log('[api/production] No EIA_API_KEY — using fallback data');
  }

  // Fallback: return hardcoded data
  return NextResponse.json(
    { data: FALLBACK_DATA, source: 'fallback', timestamp: new Date().toISOString() },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=3600',
      },
    }
  );
}

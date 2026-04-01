import Dashboard from './dashboard';

// Fetch live prices server-side so the HTML is pre-populated on first load.
// Falls back gracefully to the static values baked into the dashboard if the
// fetch fails (network issue, rate-limit, etc.).
async function getLivePrices() {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'}/api/prices`,
      { next: { revalidate: 300 } } // 5-minute ISR cache
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function Home() {
  const prices = await getLivePrices();
  return <Dashboard livePrices={prices} />;
}

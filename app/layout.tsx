import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'VNZLA OIL — 2026 Production Guidance',
  description: 'Venezuela crude oil production intelligence dashboard — 2026 scenarios, sanctions tracker, infrastructure map.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

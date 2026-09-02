import type { Metadata } from 'next';
import './globals.css';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://survivor-dash.vercel.app';

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: 'Fantasy Survivor',
  description: 'Friends-league Fantasy Survivor dashboard & live draft hub',
  openGraph: {
    type: 'website',
    siteName: 'Fantasy Survivor',
    title: 'Fantasy Survivor',
    description: 'Friends-league Fantasy Survivor dashboard & live draft hub',
  },
  twitter: { card: 'summary_large_image' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

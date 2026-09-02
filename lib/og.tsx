// Open Graph card renderer shared by the site-wide and per-season OG images.
// Satori (next/og) rules: every multi-child element needs display:flex, and
// absolute positioning uses explicit top/left/right/bottom.

import { ImageResponse } from 'next/og';

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_BRAND = { emoji: '🔥', name: 'Fantasy Survivor', tagline: 'Friends League · Dashboard & Draft Hub' };

const TEAM_COLORS: Record<string, string> = {
  'Kenny + Lena': '#fb7185',
  'Tony + Karina': '#f59e0b',
  'Megan + Jake': '#2dd4bf',
  'Will + Kathleen + Anna': '#a78bfa',
  'Will': '#a78bfa',
};
const FALLBACK = ['#fb7185', '#f59e0b', '#2dd4bf', '#a78bfa', '#60a5fa', '#f472b6'];
export const ogTeamColor = (team: string, i = 0) => TEAM_COLORS[team] ?? FALLBACK[i % FALLBACK.length];

export function ogCard(opts: { heading: string; sub?: string; detail?: string; detailColor?: string }) {
  const { heading, sub, detail, detailColor } = opts;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0c0a09', color: '#fafaf9', fontFamily: 'sans-serif', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'radial-gradient(circle at 50% 38%, rgba(245,158,11,0.22), rgba(12,10,9,0) 62%)' }} />
        <div style={{ fontSize: 118, lineHeight: 1, display: 'flex' }}>{OG_BRAND.emoji}</div>
        <div style={{ marginTop: 22, fontSize: heading.length > 18 ? 68 : 86, fontWeight: 700, letterSpacing: -2, background: 'linear-gradient(90deg,#f59e0b,#f97316)', backgroundClip: 'text', color: 'transparent', display: 'flex' }}>{heading}</div>
        {sub ? <div style={{ marginTop: 12, fontSize: 34, color: '#a8a29e', display: 'flex' }}>{sub}</div> : null}
        {detail ? (
          <div style={{ marginTop: 30, display: 'flex', alignItems: 'center', gap: 16, fontSize: 32, background: '#1c1917', border: '1px solid #2f2a27', borderRadius: 999, padding: '14px 34px' }}>
            {detailColor ? <div style={{ width: 22, height: 22, borderRadius: 6, background: detailColor, display: 'flex' }} /> : null}
            <div style={{ display: 'flex' }}>{detail}</div>
          </div>
        ) : null}
        <div style={{ position: 'absolute', bottom: 34, left: 0, right: 0, display: 'flex', justifyContent: 'center', fontSize: 24, color: '#78716c' }}>survivor-dash.vercel.app</div>
      </div>
    ),
    { ...OG_SIZE },
  );
}

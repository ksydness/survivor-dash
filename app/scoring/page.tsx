import type { Metadata } from 'next';
import Link from 'next/link';
import { getScoringRules } from '@/lib/data';

export const dynamic = 'force-dynamic';

const BRAND = { emoji: '🔥', league: 'Fantasy Survivor', grad: 'linear-gradient(90deg,#f59e0b,#f97316)' };

export const metadata: Metadata = {
  title: `Scoring rules · ${BRAND.league}`,
  description: 'Every action that earns or loses points, straight from the league sheet.',
};

// Read-only view of the newest season's Scoring tab — the same values the sheet's Update Scores
// script multiplies by. Edit the Scoring tab and this page follows; nothing here re-scores.
export default async function ScoringPage() {
  let data: Awaited<ReturnType<typeof getScoringRules>> = null;
  let err = '';
  try { data = await getScoringRules(); }
  catch (e: any) { err = e?.message ?? 'Could not load the scoring rules.'; }

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '14px 16px 64px' }}>
      <Link href="/" style={{ color: '#a8a29e', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>‹ All seasons</Link>
      <div style={{ textAlign: 'center', padding: '28px 0 22px' }}>
        <div style={{ fontSize: 40 }}>{BRAND.emoji}</div>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginTop: 6, background: BRAND.grad,
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
          Scoring rules
        </h1>
        {data && <p style={{ color: '#a8a29e', fontSize: 14, marginTop: 4 }}>As used in {data.name}</p>}
      </div>

      {err && <p style={{ color: '#f87171', fontSize: 13, textAlign: 'center' }}>{err}</p>}
      {!err && !data && <p style={{ color: '#78716c', textAlign: 'center' }}>No Scoring tab found yet.</p>}
      {data && (
        <div style={{ background: '#1c1917', border: '1px solid #2f2a27', borderRadius: 16, padding: '6px 18px' }}>
          {data.rules.map((r, i) => {
            // "Uses hidden immunity idol (awarded to …)" → main line + muted note
            const m = r.action.trim().match(/^(.*?)\s*\(([^()]*)\)\s*$/);
            const main = m && m[1] ? m[1] : r.action.trim();
            const note = m && m[1] ? m[2] : '';
            const color = r.points > 0 ? '#86efac' : r.points < 0 ? '#f87171' : '#a8a29e';
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 0',
                borderTop: i ? '1px solid #2f2a27' : 'none' }}>
                <div style={{ flex: 1, fontSize: 14.5, fontWeight: 600, color: '#fafaf9', lineHeight: 1.3 }}>
                  {main}
                  {note && <div style={{ fontSize: 12, fontWeight: 500, color: '#78716c', marginTop: 2 }}>{note}</div>}
                </div>
                <div style={{ flex: 'none', minWidth: 44, textAlign: 'right', fontSize: 17, fontWeight: 800,
                  color, fontVariantNumeric: 'tabular-nums' }}>
                  {r.points > 0 ? `+${r.points}` : r.points}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p style={{ color: '#78716c', fontSize: 12, marginTop: 12, textAlign: 'center' }}>
        Points per occurrence, tallied each episode.
      </p>
    </main>
  );
}

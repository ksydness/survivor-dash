import Link from 'next/link';
import { getSeasons } from '@/lib/data';

export const dynamic = 'force-dynamic';

export default async function Home() {
  let seasons: { season: number; name: string; status: string }[] = [];
  let err = '';
  try { seasons = await getSeasons(); }
  catch (e: any) { err = e?.message ?? 'Could not load seasons.'; }

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '64px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 48 }}>🔥</div>
      <h1 style={{ fontSize: 34, fontWeight: 800, marginTop: 8,
        background: 'linear-gradient(90deg,#f59e0b,#f97316)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
        Fantasy Survivor
      </h1>
      <p style={{ color: '#a8a29e', marginTop: 6 }}>Friends-league dashboard & hub</p>

      <div style={{ marginTop: 36, display: 'grid', gap: 12 }}>
        {err && <p style={{ color: '#f87171', fontSize: 13 }}>{err}</p>}
        {!err && seasons.length === 0 && (
          <p style={{ color: '#78716c' }}>No seasons yet. Add a row to the <b>Seasons</b> tab in your sheet.</p>
        )}
        {seasons.map(s => (
          <Link key={s.season} href={`/s/${s.season}`}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: '#1c1917', border: '1px solid #2f2a27', borderRadius: 14,
              padding: '16px 20px', textDecoration: 'none', color: '#fafaf9' }}>
            <span style={{ fontWeight: 700 }}>{s.name || `Season ${s.season}`}</span>
            <span style={{ fontSize: 12, color: s.status === 'active' ? '#f59e0b' : '#78716c' }}>
              {s.status === 'active' ? '● live' : 'final'}
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}

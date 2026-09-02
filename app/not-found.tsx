import Link from 'next/link';

// Branded 404 — the only screen that used to fall back to Next's plain default.
export default function NotFound() {
  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '96px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 56 }}>🔥</div>
      <h1 style={{ fontSize: 30, fontWeight: 800, marginTop: 10,
        background: 'linear-gradient(90deg,#f59e0b,#f97316)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
        Nothing here
      </h1>
      <p style={{ color: '#a8a29e', marginTop: 10, lineHeight: 1.5 }}>
        That page doesn’t exist — maybe a typo in the link, or a season that isn’t registered yet.
      </p>
      <Link href="/" style={{ display: 'inline-block', marginTop: 24, background: '#262220', color: '#fafaf9', border: '1px solid #3a342f',
        borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
        ‹ All seasons
      </Link>
    </main>
  );
}

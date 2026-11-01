'use client';

// The homepage's current-season card, behind the spoiler shield. The server renders one "frame" per
// week this phone may step through (the last week it revealed, then each hidden week); the card shows
// the first and a "Week N scores are in · Reveal" strip. Reveal → the full-screen reveal (RevealSplash:
// the board counts up and re-sorts, chaining through every hidden week) → as each week lands, the card
// moves to that frame and the cookie moves forward; closing the reveal opens the dashboard. Nothing here
// is computed from scores — the frames come from the same standings()/recap() the card always used.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Standing } from '../s/[season]/dash/model';
import { fmtDelta } from '../s/[season]/dash/model';
import { readSeen, writeSeen, type RevealInfo } from '../s/[season]/dash/spoiler';
import RevealSplash, { SHIELD_CSS } from '../RevealSplash';
import { unlockRevealSound } from '@/lib/revealSound';
import { shortName } from '@/lib/teamNames';

export interface Frame {
  week: number | null;     // sheet week label shown in the eyebrow (null = nothing scored / revealed)
  seen: number;            // what goes in the cookie once this frame is showing
  headline: string;
  rows: Standing[];
  body: string | null;
  topTeam: { label: string; names: string; pts: number | null } | null;
  alive: number;
  cast: number;
}

const Chevron = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 18l6-6-6-6" /></svg>
);

/** counts from the previous value to the new one when it changes (a reveal) */
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const a = from.current, b = value;
    from.current = value;
    if (a === b || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setShown(b); return; }
    let raf = 0; const t0 = performance.now(), dur = 900;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      setShown(Math.round((a + (b - a) * e) * 100) / 100);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{Number.isInteger(shown) ? shown : shown.toFixed(1)}</>;
}

export default function SeasonCard({ season, name, active, frames, reveals, hadCookie }: {
  season: number; name: string; active: boolean;
  frames: Frame[];            // frames[0] = what this phone has seen; frames[i+1] = after revealing reveals[i]
  reveals: RevealInfo[];
  hadCookie: boolean;
}) {
  const router = useRouter();
  const [i, setI] = useState(0);
  const [splash, setSplash] = useState<RevealInfo[] | null>(null);  // frozen when opened: this week + later hidden ones
  const href = `/s/${season}`;

  useEffect(() => {
    if (frames.length < 2) return;
    // first visit: remember "everything but the newest week" so the next scored week doesn't slip through
    if (!hadCookie) writeSeen(season, frames[0].seen);
    // a page held in the router cache may be behind this phone (revealed on the dashboard meanwhile)
    const c = readSeen(season);
    if (c != null) {
      let j = 0;
      frames.forEach((f, n) => { if (f.seen <= c) j = n; });
      if (j > 0) setI(j);
    }
  }, [season, frames, hadCookie]);

  /** a week landed in the reveal: the card (behind it) moves to that week and the cookie follows */
  function landed(info: RevealInfo) {
    const j = reveals.findIndex(r => r.week === info.week);
    if (j < 0 || !frames[j + 1]) return;
    writeSeen(season, frames[j + 1].seen);
    setI(n => Math.max(n, j + 1));
  }

  const f = frames[Math.min(i, frames.length - 1)];
  const nextReveal = i < reveals.length ? reveals[i] : null;

  return (
    <section className="card" aria-labelledby="cur">
      <div className="hrow">
        <h2 id="cur" className="eyebrow">{name}{f.week !== null ? ` · Week ${f.week}` : ''}</h2>
        {active ? <span className="pill"><i />Live</span> : <span className="pill done"><i />Final</span>}
      </div>

      {nextReveal ? (
        <div className="shieldbar">
          <style>{SHIELD_CSS}</style>
          <span className="sic" aria-hidden>🔥</span>
          <span className="stx">
            <b>Week {nextReveal.week} scores are in</b>
            <span>{f.week !== null ? `Showing through Week ${f.week}.` : 'Nothing shown yet.'} Watched it?</span>
          </span>
          <button type="button" className="sbtn" onClick={() => { unlockRevealSound(); setSplash(reveals.slice(i)); }}>Reveal</button>
        </div>
      ) : (
        <p className="headline">{f.headline}</p>
      )}

      <div className="rows">
        {f.rows.map(t => {
          const mv = t.move === null ? null : t.move > 0 ? { c: 'up', txt: `▲${t.move}`, sr: `up ${t.move}` } : t.move < 0 ? { c: 'down', txt: `▼${-t.move}`, sr: `down ${-t.move}` } : { c: '', txt: '–', sr: 'no change' };
          const rankTxt = t.tied ? `T-${t.rank}` : String(t.rank);
          const label = `${t.team}, ${t.tied ? `tied for ${t.rank === 1 ? '1st' : `rank ${t.rank}`}` : `rank ${t.rank}`}, ${t.total} points${t.week !== null ? `, ${fmtDelta(t.week)} this week` : ''}, ${t.left} of ${t.size} players left${mv ? `, ${mv.sr} since last week` : ''}. Open in Teams`;
          return (
            <Link key={t.team}
              className="row" href={`${href}?tab=teams&team=${encodeURIComponent(t.team)}`} aria-label={label}>
              <span className="rk" aria-hidden>
                <b className={t.rank === 1 ? 'first' : ''}>{rankTxt}</b>
                {mv && <span className={`mv ${mv.c}`}>{mv.txt}</span>}
              </span>
              <span className="who" aria-hidden>
                <span className="tn"><span className="dot" style={{ background: t.color }} /><span>{shortName(t.team)}{!active && t.rank === 1 ? ' 👑' : ''}</span></span>
                <span className="sub">
                  <span className="pips">{Array.from({ length: t.size }, (_, n) => <span key={n} className="pip" style={n < t.left ? { background: t.color, borderColor: t.color } : undefined} />)}</span>
                  {t.left} of {t.size} left
                </span>
              </span>
              <span className="pts" aria-hidden>
                <b className="num"><CountUp value={t.total} /></b>
                {t.week !== null ? <span className={`num ${t.week < 0 ? 'neg' : ''}`}>{fmtDelta(t.week)} this wk</span>
                  : t.rank === 1 && !t.tied ? <span>{active ? 'Leader' : 'Champion'}</span>
                    : <span className="num">{t.back} back</span>}
              </span>
            </Link>
          );
        })}
      </div>

      <Link className="cta" href={href}>Open {name}<Chevron /></Link>

      {nextReveal && f.week !== null && <p className="after">{f.headline}.</p>}
      {f.body && <p className="after">{f.body}</p>}
      {(f.topTeam || f.cast > 0) && (
        <div className="facts">
          {f.topTeam && <span>{f.topTeam.label}: <b>{f.topTeam.names}</b>{f.topTeam.pts != null ? ` · ${f.topTeam.pts} pts` : ''}</span>}
          {f.cast > 0 && <span className="num">{f.alive} of {f.cast} still in</span>}
        </div>
      )}

      {splash && (
        // after a reveal people usually want to dig in, so closing it opens the dashboard (Kenny, 2026-11-01)
        <RevealSplash steps={splash} onStep={landed} onClose={() => router.push(href)}
          doneLabel={`Open ${name} ›`} stopLabel={`Stop here · open ${name}`} />
      )}
    </section>
  );
}

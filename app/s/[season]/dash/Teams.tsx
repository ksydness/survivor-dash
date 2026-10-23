'use client';

import { useEffect, useRef, useState } from 'react';
import type { SeasonPayload } from '@/lib/types';
import { Dot, IconSearch, PlayerCard, WeekBars } from './bits';
import { colorFor, ordinal, rosterOf, teamSeries } from './model';
import { shortName } from '@/lib/teamNames';

/**
 * Teams: at a glance → players left per team and every roster as name chips.
 * One tap deeper → a player's card. Another → the team breakdown (where the points came from, by week).
 */
export default function Teams({ d, focusTeam }: { d: SeasonPayload; focusTeam: string | null }) {
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>(focusTeam ? { [focusTeam]: true } : {});
  const refs = useRef<Record<string, HTMLElement | null>>({});

  // arriving from the Leaderboard's "Teams tab ›" link: open that team's breakdown and scroll to it
  useEffect(() => {
    if (!focusTeam) return;
    setOpen(o => ({ ...o, [focusTeam]: true }));
    refs.current[focusTeam]?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [focusTeam]);

  const teams = d.teamTotals.map((t, i) => {
    const roster = rosterOf(d, t.team);
    return { ...t, i, color: colorFor(t.team), roster, left: roster.filter(c => !c.eliminated).length };
  });
  const aliveTotal = teams.reduce((a, t) => a + t.left, 0);
  const q = query.trim().toLowerCase();
  const hit = q ? d.contestants.find(c => c.name.toLowerCase().startsWith(q)) ?? d.contestants.find(c => c.name.toLowerCase().includes(q)) ?? null : null;

  return (
    <>
      <section aria-label="Players left per team" className="glance" style={{ ['--n' as string]: Math.min(teams.length, 4) }}>
        {teams.map(t => (
          <div key={t.team} className="gl" style={{ borderTopColor: t.color }}>
            <b className="num">{t.left}<small>/{t.roster.length}</small></b>
            <span>{shortName(t.team)}</span>
          </div>
        ))}
      </section>
      <p className="note" style={{ textAlign: 'center', margin: '-6px 0 0' }}>{aliveTotal} of {d.contestants.length} players still in · tap a name for their card</p>

      <div className="search">
        <label htmlFor="find-player" className="ph">Find a player</label>
        <div className="box">
          <IconSearch />
          <input id="find-player" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Type a name" autoComplete="off" />
        </div>
        {q && (
          <div className="result" aria-live="polite">
            {hit ? (<>
              <Dot c={colorFor(hit.team)} />
              <span><b>{hit.name}</b> is on <b>{hit.team}</b><span className="muted"> · {hit.eliminated ? 'out' : 'still in'}</span></span>
            </>) : <span className="muted">No player matches “{query.trim()}”.</span>}
          </div>
        )}
      </div>

      {teams.map(t => {
        const selected = t.roster.find(c => c.name === sel) ?? null;
        const isOpen = !!open[t.team];
        const series = teamSeries(d, t.team);
        const byPts = [...t.roster].sort((a, b) => b.total - a.total);
        const OPS = [1, 0.78, 0.6, 0.45, 0.32, 0.2, 0.14, 0.1];
        const pos = Math.max(t.total, 0);
        return (
          <section key={t.team} className="panel" ref={el => { refs.current[t.team] = el; }} style={{ scrollMarginTop: 76 }}>
            <div className="tc-head">
              <Dot c={t.color} lg />
              <h2>{t.team}</h2>
              <span>{ordinal(t.rank ?? t.i + 1)} · <span className="num">{t.total}</span> pts</span>
            </div>
            <div className="rchips">
              {t.roster.map(c => {
                const picked = sel === c.name;
                const out = !!c.eliminated;
                const isHit = hit?.name === c.name;
                return (
                  <button key={c.name} type="button" aria-pressed={picked}
                    className={`rchip ${out ? 'out' : ''} ${isHit ? 'hit' : ''}`}
                    style={picked ? { background: t.color, borderColor: t.color, borderStyle: 'solid' } : out ? undefined : { borderColor: t.color }}
                    onClick={() => setSel(picked ? null : c.name)}
                    aria-label={`${c.name}, ${out ? 'out' : 'still in'}. ${picked ? 'Hide' : 'Show'} player card`}>
                    {out ? <s>{c.name}</s> : c.name}{out && <small>out</small>}
                  </button>
                );
              })}
            </div>
            {selected && <PlayerCard d={d} c={selected} color={t.color} onClose={() => setSel(null)} />}

            <button type="button" className="moretoggle" aria-expanded={isOpen} onClick={() => setOpen(o => ({ ...o, [t.team]: !isOpen }))}>
              Team breakdown<span>{isOpen ? 'Hide' : 'Show'}</span>
            </button>
            {isOpen && (
              <div style={{ display: 'grid', gap: 18, paddingTop: 6 }}>
                <div>
                  <h3 className="h3">Where the points came from</h3>
                  <div className="share" role="img" aria-label={byPts.map(c => `${c.name} ${c.total}`).join(', ')}>
                    {byPts.map((c, i) => <i key={c.name} style={{ width: `${pos ? (Math.max(c.total, 0) / pos) * 100 : 0}%`, background: t.color, opacity: OPS[i] ?? 0.1 }} />)}
                  </div>
                  <div className="sharelist">
                    {byPts.map((c, i) => (
                      <div key={c.name}>
                        <span className="dot lg" style={{ background: t.color, opacity: OPS[i] ?? 0.1 }} aria-hidden />
                        <span className="n">{c.name}</span>
                        <span className="pct num">{pos ? Math.round((Math.max(c.total, 0) / pos) * 100) : 0}%</span>
                        <span className="v num">{c.total}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="h3">Team points by week</h3>
                  <WeekBars series={series} color={t.color} height={80} highlightMax labels="all" label={`${t.team} points by week: ${series.map(s => s.v).join(', ')}`} />
                </div>
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}

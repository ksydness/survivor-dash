'use client';

import { useState } from 'react';
import type { SeasonPayload } from '@/lib/types';
import { colorFor, draftPicks, ordinal, stealsAndBusts, tint } from './model';

/** Draft: the whole board on one screen (rounds down, teams across), then steals & busts. */
export default function Draft({ d }: { d: SeasonPayload }) {
  const b = d.draft!;
  const n = b.teams.length;
  const picks = draftPicks(d);
  const { steal, bust } = stealsAndBusts(d, picks);
  const firstReal = steal?.p ?? picks.find(p => p.c) ?? null;
  const [selPick, setSelPick] = useState<number | null>(firstReal?.pick ?? null);
  const sel = picks.find(p => p.pick === selPick) ?? null;
  const color = (i: number) => colorFor(b.teams[i]);
  const scored = picks.filter(p => p.c);
  const maxPts = Math.max(...scored.map(p => p.c!.total), 1);
  // scale the points axis to the actual scores (early season ≈ 10s, late season ≈ 200s)
  const step = maxPts <= 20 ? 5 : maxPts <= 50 ? 10 : maxPts <= 150 ? 25 : 50;
  const yMax = Math.max(step * 2, Math.ceil((maxPts * 1.08) / step) * step);
  const lowest = Math.min(0, ...scored.map(p => p.c!.total));
  const minPts = lowest < 0 ? Math.floor(lowest / step) * step : 0;
  const total = picks.length;
  const ticks = [0, ...[0.5, 1].map(f => Math.round((yMax * f) / step) * step)].filter((t, i, a) => a.indexOf(t) === i);

  const readout = (p: typeof sel) => p && p.name ? (
    <><b>{p.name}</b><span className="muted"> · Round {p.round}, pick #{p.pick} · {p.team}{p.c ? ' · ' : ''}</span>
      {p.c && <b style={{ color: color(p.teamIdx) }}>{p.c.total} pts{p.c.eliminated ? ' · out' : ''}</b>}</>
  ) : <span className="muted">Tap a pick for details.</span>;

  return (
    <>
      <section className="panel" style={{ padding: '18px 14px' }}>
        <div className="phrow" style={{ padding: '0 4px', marginBottom: 12 }}>
          <h2 className="ph">Draft order</h2>
          <span className="aside">Snake · {b.rounds.length} rounds · {total} picks</span>
        </div>
        <div className="dgrid" style={{ ['--n' as string]: n }}>
          <span />
          {b.teams.map((t, i) => <div key={t} className="dhead" style={{ borderColor: color(i) }}>{t}</div>)}
        </div>
        <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
          {b.rounds.map((row, r) => (
            <div key={r} className="dgrid" style={{ ['--n' as string]: n }}>
              <div className="dround">R{r + 1}<span aria-label={r % 2 === 0 ? 'left to right' : 'right to left'}>{r % 2 === 0 ? '→' : '←'}</span></div>
              {row.map((_, i) => {
                const p = picks.find(x => x.round === r + 1 && x.teamIdx === i)!;
                if (!p.name) return <div key={i} className="dcell empty" style={{ borderColor: color(i) }}><span className="dno">#{p.pick}</span><span className="dn">—</span></div>;
                const out = !!p.c?.eliminated;
                return (
                  <button key={i} type="button" className={`dcell ${out ? 'out' : ''}`} aria-pressed={selPick === p.pick}
                    style={{ borderColor: color(i), background: tint(color(i)) }}
                    onClick={() => setSelPick(p.pick)}
                    aria-label={`Round ${p.round}, pick ${p.pick}: ${p.name}, ${p.team}${p.c ? `, ${p.c.total} points` : ''}${out ? ', out' : ''}`}>
                    <span className="dno num">#{p.pick}</span>
                    <span className="dn">{p.name}</span>
                    {p.c && <span className="dp num">{p.c.total}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="readout" aria-live="polite">{readout(sel)}</div>
        {b.undrafted && b.undrafted.length > 0 && <div className="note">Undrafted: {b.undrafted.join(', ')}</div>}
        <div className="note">Rounds read across; arrows show the snake. Crossed out = eliminated.</div>
      </section>

      {scored.length > 1 && (
        <section className="panel">
          <h2 className="ph">Steals &amp; busts</h2>
          <p className="sub">Where each player was picked vs. what they scored. Tap a dot.</p>
          <div className="scatter">
            <div className="yax" aria-hidden>{ticks.map(t => <span key={t} style={{ bottom: `${((t - minPts) / (yMax - minPts)) * 100}%` }}>{t}</span>)}</div>
            <div className="plot">
              {ticks.filter(t => t > minPts).map(t => <span key={t} className="gl-h" style={{ bottom: `${((t - minPts) / (yMax - minPts)) * 100}%` }} />)}
              {b.rounds.slice(1).map((_, r) => <span key={r} className="gl-v" style={{ left: `${(((r + 1) * n - 0.5) / Math.max(total - 1, 1)) * 100}%` }} />)}
              {scored.map(p => (
                <button key={p.pick} type="button" className="pt" aria-pressed={selPick === p.pick} onClick={() => setSelPick(p.pick)}
                  aria-label={`${p.name}, pick ${p.pick}, ${p.c!.total} points`}
                  style={{ left: `${((p.pick - 1) / Math.max(total - 1, 1)) * 100}%`, bottom: `${((p.c!.total - minPts) / (yMax - minPts)) * 100}%` }}>
                  <i style={{ background: color(p.teamIdx) }} />
                </button>
              ))}
            </div>
          </div>
          <div className="xax" aria-hidden>{b.rounds.map((_, r) => <span key={r}>R{r + 1}</span>)}</div>
          <div className="readout">{readout(sel)}</div>
          {(steal || bust) && (
            <div className="minis">
              {steal && (
                <button type="button" className="mini" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setSelPick(steal.p.pick)}>
                  <div className="k">Biggest steal</div>
                  <div className="v">{steal.p.name}</div>
                  <div className="d">Pick #{steal.p.pick} · finished {ordinal(steal.finish)} in points</div>
                </button>
              )}
              {bust && (
                <button type="button" className="mini" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setSelPick(bust.p.pick)}>
                  <div className="k">Biggest bust</div>
                  <div className="v">{bust.p.name}</div>
                  <div className="d">Pick #{bust.p.pick} · finished {ordinal(bust.finish)} in points</div>
                </button>
              )}
            </div>
          )}
        </section>
      )}
    </>
  );
}


'use client';

import { useState } from 'react';
import type { SeasonPayload } from '@/lib/types';
import { Disclosure, Dot } from './bits';
import { colorFor, r2, teamWeekPts, weekLabel } from './model';

/** Stats: four headline numbers up top; the heatmap, weekly totals and records behind "Dig deeper". */
export default function Stats({ d }: { d: SeasonPayload }) {
  const sw = d.meta.scored_weeks ?? [];
  const top = [...d.contestants].sort((a, b) => b.total - a.total);
  let bestWk = { p: '', v: -Infinity, wk: 0 };
  d.contestants.forEach(c => sw.forEach(i => { const v = c.weeks[i] ?? 0; if (v > bestWk.v) bestWk = { p: c.name, v, wk: weekLabel(d, i) }; }));
  const tt = d.teamTotals;
  const leader = tt[0];
  const coLeaders = leader ? tt.filter(t => t.total === leader.total) : [];  // more than one = tied for 1st
  const second = leader ? tt.find(t => t.total < leader.total) : undefined;
  const alive = d.contestants.filter(c => !c.eliminated);
  const negs = d.contestants.flatMap(c => sw.map(i => ({ c: c.name, v: c.weeks[i] ?? 0, wk: weekLabel(d, i) }))).filter(x => x.v < 0).sort((a, b) => a.v - b.v);
  const allPts = r2(d.contestants.reduce((a, c) => a + c.total, 0));
  let bestTeamWk = { t: '', v: -Infinity, wk: 0 };
  tt.forEach(t => sw.forEach(i => { const v = teamWeekPts(d, t.team, i); if (v > bestTeamWk.v) bestTeamWk = { t: t.team, v, wk: weekLabel(d, i) }; }));
  const final = d.meta.status === 'final';

  return (
    <>
      <section className="tiles">
        <div className="tile">
          <div className="k">{coLeaders.length > 1 ? (final ? 'Co-champions' : 'Tied for 1st') : final ? 'Champion' : 'Leader'}</div>
          {coLeaders.length > 1
            ? <div className="v sm">{coLeaders.map((t, i) => <span key={t.team} style={{ display: 'block', color: colorFor(t.team) }}>{t.team}</span>)}</div>
            : <div className="v sm" style={{ color: leader ? colorFor(leader.team) : undefined }}>{leader?.team ?? '—'}</div>}
          <div className="d">{!leader ? '' : coLeaders.length > 1
            ? `${leader.total} pts each${second ? ` · ${r2(leader.total - second.total)} ahead of ${second.team}` : ''}`
            : `${leader.total} pts${second ? ` · ${r2(leader.total - second.total)} ahead` : ''}`}</div>
        </div>
        <div className="tile">
          <div className="k">Top contestant</div>
          <div className="v">{top[0]?.name ?? '—'}</div>
          <div className="d">{top[0] ? `${top[0].total} pts · ${top[0].team}` : ''}</div>
        </div>
        <div className="tile">
          <div className="k">Biggest week</div>
          <div className="v num">{sw.length ? bestWk.v : '—'}</div>
          <div className="d">{sw.length ? `${bestWk.p} · Week ${bestWk.wk}` : 'No weeks scored yet'}</div>
        </div>
        <div className="tile">
          <div className="k">Players left</div>
          <div className="v num">{alive.length} <small>of {d.contestants.length}</small></div>
          <div className="d">{alive.length > 0 && alive.length <= 6 ? alive.map(c => c.name).join(', ') : `${d.contestants.length - alive.length} out so far`}</div>
        </div>
      </section>

      {sw.length > 0 && <>
        <h2 className="sectionlabel">Dig deeper</h2>
        <Disclosure title="Every week, every player" sub="Who scored when — tap any square">
          <Heatmap d={d} best={bestWk} />
        </Disclosure>
        <Disclosure title="League points per week" sub="How big each episode was, split by team">
          <WeeklyStack d={d} />
          <div className="legend">{tt.map((t, i) => <div key={t.team}><Dot c={colorFor(t.team)} />{t.team}</div>)}</div>
        </Disclosure>
        <Disclosure title="More records" sub="Margins, totals and negative weeks">
          <div className="rows">
            {tt.length > 1 && <div><span>Margin, 1st to last</span><b className="num">{r2(tt[0].total - tt[tt.length - 1].total)} pts</b></div>}
            <div><span>Total points scored</span><b className="num">{allPts.toLocaleString()}</b></div>
            {bestTeamWk.t && <div><span>Biggest team week</span><b>{bestTeamWk.v} · {bestTeamWk.t}, Wk {bestTeamWk.wk}</b></div>}
            <div><span>Negative weeks</span><b className="num">{negs.length}</b></div>
            {negs.map((n, i) => <div key={i}><span>{n.c} <span className="muted">· Wk {n.wk}</span></span><b className="neg num">{n.v}</b></div>)}
          </div>
        </Disclosure>
      </>}
    </>
  );
}

function Heatmap({ d, best }: { d: SeasonPayload; best: { p: string; v: number } }) {
  const sw = d.meta.scored_weeks ?? [];
  const bestWk = best;
  const rows = [...d.contestants].sort((a, b) => b.total - a.total);
  const firstPick = bestWk.p ? { n: bestWk.p, i: sw.find(i => (d.contestants.find(c => c.name === bestWk.p)?.weeks[i] ?? 0) === bestWk.v) ?? sw[0] } : null;
  const [pick, setPick] = useState<{ n: string; i: number } | null>(firstPick);
  const pc = pick ? d.contestants.find(c => c.name === pick.n) : null;
  const pv = pc && pick ? pc.weeks[pick.i] ?? 0 : 0;
  const bg = (v: number) => v < 0 ? '#f87171' : v === 0 ? '#262220' : `rgba(245, 158, 11, ${(0.14 + 0.86 * Math.min(v, 20) / 20).toFixed(2)})`;
  return (
    <>
      <div className="readout" style={{ margin: '0 0 12px' }} aria-live="polite">
        {pc && pick ? <><b>{pc.name}</b><span className="muted"> · Week {weekLabel(d, pick.i)} · </span><b style={{ color: pv < 0 ? '#f87171' : '#f59e0b' }}>{pv} pts</b></> : <span className="muted">Tap a square.</span>}
      </div>
      <div className="heatrow" style={{ ['--w' as string]: sw.length }} aria-hidden>
        <span />
        {sw.map(i => <span key={i} className="hw">{weekLabel(d, i)}</span>)}
      </div>
      <div style={{ display: 'grid', gap: 2, marginTop: 2 }}>
        {rows.map(c => (
          <div key={c.name} className="heatrow" style={{ ['--w' as string]: sw.length }}>
            <span className={`hn ${c.eliminated ? 'out' : ''}`}><i style={{ background: colorFor(c.team) }} />{c.name}</span>
            {sw.map(i => {
              const v = c.weeks[i] ?? 0;
              return <button key={i} type="button" className="hc" style={{ background: bg(v) }}
                aria-pressed={pick?.n === c.name && pick.i === i}
                aria-label={`${c.name}, week ${weekLabel(d, i)}: ${v} points`}
                onClick={() => setPick({ n: c.name, i })} />;
            })}
          </div>
        ))}
      </div>
      <div className="heatkey" aria-hidden>
        <i style={{ background: '#262220' }} />0
        <i style={{ background: 'rgba(245, 158, 11, 0.36)', marginLeft: 6 }} />5
        <i style={{ background: 'rgba(245, 158, 11, 0.58)' }} />10
        <i style={{ background: '#f59e0b' }} />20+
        <i style={{ background: '#f87171', marginLeft: 6 }} />negative
      </div>
    </>
  );
}

function WeeklyStack({ d }: { d: SeasonPayload }) {
  const sw = d.meta.scored_weeks ?? [];
  const tt = d.teamTotals;
  const cols = sw.map(i => ({ i, segs: tt.map((t, k) => ({ c: colorFor(t.team), v: Math.max(0, teamWeekPts(d, t.team, i)) })) }))
    .map(c => ({ ...c, total: r2(c.segs.reduce((a, s) => a + s.v, 0)) }));
  const mx = Math.max(...cols.map(c => c.total), 1);
  return (
    <>
      <div className="stack" role="img" aria-label={`League points per week: ${cols.map(c => `week ${weekLabel(d, c.i)} ${c.total}`).join(', ')}`}>
        {cols.map(c => (
          <div key={c.i} className="col">
            <span className="num">{c.total}</span>
            <div>{c.segs.filter(s => s.v > 0).map((s, k) => <i key={k} style={{ height: (s.v / mx) * 136, background: s.c }} />)}</div>
          </div>
        ))}
      </div>
      <div className="barlbl" aria-hidden>{cols.map(c => <span key={c.i} style={{ maxWidth: 'none' }}>{weekLabel(d, c.i)}</span>)}</div>
    </>
  );
}

'use client';

import type { SeasonPayload } from '@/lib/types';
import { Disclosure, Dot, IconCup } from './bits';
import { colorFor, historyModel, ordinal } from './model';

/** History: reigning champs + titles up top; charts, results and records behind "Dig deeper". */
export default function History({ d }: { d: SeasonPayload }) {
  const h = historyModel(d);
  if (!h.seasons.length) return <div className="empty">No past seasons yet. Add rows to the History tab in the sheet.</div>;
  const champColor = h.champ ? colorFor(h.champ.team) : '#f59e0b';
  return (
    <>
      {h.champ && (
        <section className="panel champ">
          <div className="cup"><IconCup size={24} /></div>
          <div>
            <div className="k">Reigning champs · S{h.latest}</div>
            <div className="v"><Dot c={champColor} />{h.champ.team}</div>
            <div className="d">{h.champ.points} pts{h.bySeason[h.latest!][1] ? ` · won by ${Math.round((h.champ.points - h.bySeason[h.latest!][1].points) * 100) / 100}` : ''}</div>
          </div>
        </section>
      )}

      <section className="panel">
        <h2 className="ph" style={{ marginBottom: 4 }}>Titles · Seasons {h.seasons[h.seasons.length - 1]}–{h.seasons[0]}</h2>
        <div className="titles">
          {h.teams.map(t => (
            <div key={t.team}>
              <div className="tn"><Dot c={colorFor(t.team)} />{t.team}</div>
              <div className="cups" role="img" aria-label={`${t.titles.length} title${t.titles.length === 1 ? '' : 's'}`}>
                {t.titles.length ? t.titles.map(s => <IconCup key={s} />) : <span className="none">No titles yet</span>}
              </div>
              <div className="d">{t.titles.length ? `Won ${t.titles.map(s => `S${s}`).join(', ')} · ` : ''}avg finish {t.avgPlace.toFixed(1)} · avg {Math.round(t.avg)} pts</div>
              <div />
            </div>
          ))}
        </div>
      </section>

      <h2 className="sectionlabel">Dig deeper</h2>
      {h.seasons.length > 1 && (
        <Disclosure title="Finish by season" sub={`Where every team placed, S${h.seasons[h.seasons.length - 1]}–S${h.seasons[0]}`}>
          <FinishChart h={h} />
        </Disclosure>
      )}
      <Disclosure title="Season-by-season results" sub="Final standings for every season">
        {h.seasons.map(s => (
          <div key={s} className="season">
            <b>Season {s}</b>
            {h.bySeason[s].map(r => (
              <div key={r.team}>
                <span className={`pl ${r.place === 1 ? 'w' : ''}`}>{r.place}</span>
                <Dot c={colorFor(r.team)} />
                <span className="t">{r.team}</span>
                <span className="p num">{r.points}</span>
              </div>
            ))}
          </div>
        ))}
      </Disclosure>
      <Disclosure title="Points per season" sub="How close each title race was">
        <Strip h={h} />
      </Disclosure>
      <Disclosure title="All-time records" sub="Highs, lows and the closest finish">
        <div className="rows">
          {h.best && <div><span>Best season</span><b>{h.best.points} · {h.best.team}, S{h.best.season}</b></div>}
          {h.worst && <div><span>Lowest season</span><b>{h.worst.points} · {h.worst.team}, S{h.worst.season}</b></div>}
          {h.closest && <div><span>Closest title</span><b>{h.closest.margin} pts · S{h.closest.season}</b></div>}
          {h.widest && <div><span>Biggest title margin</span><b>{h.widest.margin} pts · S{h.widest.season}</b></div>}
        </div>
      </Disclosure>
    </>
  );
}

type H = ReturnType<typeof historyModel>;

/** Place per season, one line per team; ringed dots are titles. */
function FinishChart({ h }: { h: H }) {
  const seasons = [...h.seasons].reverse(); // oldest → newest
  const nPlaces = Math.max(...seasons.map(s => h.bySeason[s].length), 2);
  const W = 320, H = 190, padL = 30, padR = 16, padT = 14, padB = 26;
  const x = (j: number) => padL + (W - padL - padR) * (seasons.length > 1 ? j / (seasons.length - 1) : 0);
  const y = (p: number) => padT + (H - padT - padB) * ((p - 1) / (nPlaces - 1));
  // team lineages: 'Will' (S46) continues as 'Will + Kathleen + Anna' — match by color so the line carries on
  const lines: Record<string, { c: string; pts: { j: number; p: number; win: boolean }[]; name: string }> = {};
  seasons.forEach((s, j) => h.bySeason[s].forEach(r => {
    const c = colorFor(r.team);
    const key = c;
    (lines[key] ??= { c, pts: [], name: r.team }).pts.push({ j, p: r.place, win: r.place === 1 });
    lines[key].name = r.team;
  }));
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Final place by season. ${Object.values(lines).map(l => `${l.name}: ${l.pts.map(p => ordinal(p.p)).join(', ')}`).join('. ')}`} style={{ display: 'block' }}>
        {Array.from({ length: nPlaces }, (_, i) => i + 1).map(p => (
          <g key={p}><line x1={padL} x2={W - padR} y1={y(p)} y2={y(p)} stroke="#2f2a27" /><text x={4} y={y(p) + 4} fontSize="10" fill="#a8a29e">{ordinal(p)}</text></g>
        ))}
        {seasons.map((s, j) => <text key={s} x={x(j)} y={H - 6} fontSize="10" fill="#a8a29e" textAnchor="middle">S{s}</text>)}
        {Object.values(lines).map(l => (
          <polyline key={l.c} points={l.pts.map(p => `${x(p.j).toFixed(1)},${y(p.p).toFixed(1)}`).join(' ')} fill="none" stroke={l.c} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {Object.values(lines).flatMap(l => l.pts.filter(p => p.win).map(p => (
          <g key={`${l.c}${p.j}`}><circle cx={x(p.j)} cy={y(p.p)} r={7} fill="#1c1917" stroke="#fcd34d" strokeWidth={2} /><circle cx={x(p.j)} cy={y(p.p)} r={4} fill={l.c} /></g>
        )))}
      </svg>
      <div className="legend">{Object.values(lines).map(l => <div key={l.c}><Dot c={l.c} />{l.name}</div>)}</div>
    </>
  );
}

/** One row per season, a dot per team at its final total; the champion ringed in gold. */
function Strip({ h }: { h: H }) {
  const all = h.seasons.flatMap(s => h.bySeason[s].map(r => r.points));
  const lo = Math.floor(Math.min(...all) / 50) * 50, hi = Math.ceil(Math.max(...all) / 50) * 50;
  const pos = (v: number) => `${((v - lo) / Math.max(hi - lo, 1)) * 100}%`;
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t += hi - lo > 300 ? 100 : 50) ticks.push(t);
  return (
    <>
      {h.seasons.map(s => (
        <div key={s} className="strip">
          <span>S{s}</span>
          <div className="line" role="img" aria-label={`Season ${s}: ${h.bySeason[s].map(r => `${r.team} ${r.points}`).join(', ')}`}>
            {[...h.bySeason[s]].reverse().map(r => <i key={r.team} className={r.place === 1 ? 'w' : ''} style={{ left: pos(r.points), background: colorFor(r.team) }} />)}
          </div>
        </div>
      ))}
      <div className="strip" aria-hidden><span /><div className="axis">{ticks.map(t => <span key={t} style={{ left: pos(t) }}>{t}</span>)}</div></div>
      <div className="note">Gold ring = that season's champion</div>
    </>
  );
}

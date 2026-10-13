'use client';

import { useState } from 'react';
import type { SeasonPayload } from '@/lib/types';
import { Disclosure, Dot, Pips } from './bits';
import { colorFor, fmtDelta, liveWeek, ordinal, recap, rosterOf, standings, weekLabel } from './model';

export default function Leaderboard({ d, goTeams }: { d: SeasonPayload; goTeams: (team: string) => void }) {
  const rc = recap(d);
  const rows = standings(d);
  const li = liveWeek(d);
  const final = d.meta.status === 'final';
  // tap a team to see its roster; one open at a time
  const [open, setOpen] = useState<string | null>(null);
  const mx = Math.max(...d.contestants.map(c => c.total), 1);

  return (
    <>
      {rc && (
        <section className="panel recap">
          <h2 className="ph">{rc.final ? 'Season recap' : `Week ${rc.week} recap`}</h2>
          <h3>{rc.headline}</h3>
          {rc.body && <p>{rc.body}</p>}
          {(rc.topScorer || rc.topTeam) && (
            <div className="minis">
              {rc.topScorer && (
                <div className="mini">
                  <div className="k">{rc.final ? `Wk ${rc.week} top scorer` : 'Top scorer'}</div>
                  <div className="v">{rc.topScorer.names.length > 2 ? `${rc.topScorer.names.length}-way tie` : rc.topScorer.names.join(' & ')}</div>
                  <div className="d">{rc.topScorer.pts ?? '—'} pts{rc.topScorer.team ? ` · ${rc.topScorer.team}` : ''}</div>
                </div>
              )}
              {rc.topTeam && (
                <div className="mini">
                  <div className="k">{rc.final ? `Wk ${rc.week} top team` : 'Top team'}</div>
                  <div className="v">
                    {rc.topTeam.names.length === 1 && <Dot c={colorFor(rc.topTeam.names[0], d.teamTotals.findIndex(t => t.team === rc.topTeam!.names[0]))} />}
                    {rc.topTeam.names.length > 2 ? `${rc.topTeam.names.length}-way tie` : rc.topTeam.names.join(' & ')}
                  </div>
                  <div className="d">{rc.topTeam.pts ?? '—'} pts that week</div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <section className="panel" style={{ padding: '18px 14px 14px' }}>
        <div className="phrow" style={{ padding: '0 4px' }}>
          <h2 className="ph">{final ? 'Final standings' : 'Standings'}</h2>
          <span className="aside">Tap a team for its roster</span>
        </div>
        <div className="stands">
          {rows.map(t => {
            const isOpen = open === t.team;
            const mv = t.move === null ? null : t.move > 0 ? { cls: 'up', txt: `▲${t.move}`, sr: `up ${t.move}` } : t.move < 0 ? { cls: 'down', txt: `▼${-t.move}`, sr: `down ${-t.move}` } : { cls: '', txt: '–', sr: 'no change' };
            const champ = final && t.rank === 1;
            return (
              <div key={t.team} className={`stand ${t.rank === 1 ? 'win' : ''}`}>
                <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : t.team)}>
                  <span className="rk">
                    <b className={t.tied ? 'tie' : ''}>{t.tied ? `T-${t.rank}` : t.rank}</b>
                    {mv && <span className={`mv ${mv.cls}`}><span aria-hidden>{mv.txt}</span><span className="sr">{mv.sr} since last week</span></span>}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span className="tn"><Dot c={t.color} /><span>{t.team}{champ ? ' 👑' : ''}</span></span>
                    <span className="track" aria-hidden><i style={{ width: `${rows[0].total > 0 ? Math.max(2, (t.total / rows[0].total) * 100) : 0}%`, background: t.color }} /></span>
                    <span className="meta">
                      <span className={t.week !== null && t.week < 0 ? 'neg' : ''}>{t.week !== null ? `${fmtDelta(t.week)} this week` : `${t.left} of ${t.size} left`}</span>
                      <Pips left={t.left} size={t.size} color={t.color} />
                    </span>
                  </span>
                  <span className="pts">
                    <b className="num">{t.total}</b>
                    {t.rank === 1 && !t.tied ? <span className="lead">{champ ? 'Champion' : 'Leader'}</span>
                      : t.back === 0 ? <span className="lead">Tied for 1st</span>
                      : <span className="num">{t.back} back</span>}
                  </span>
                </button>
                {isOpen && (
                  <div className="expand">
                    <div className="colhead" aria-hidden><span>Player</span>{li !== null && <span style={{ width: 40, textAlign: 'right' }}>Wk {weekLabel(d, li)}</span>}<span style={{ width: 36, textAlign: 'right' }}>Total</span></div>
                    <div className="roster">
                      {rosterOf(d, t.team).map(c => {
                        const out = !!c.eliminated;
                        const wk = li === null ? null : c.weeks[li] ?? 0;
                        return (
                          <div key={c.name} className={`player ${out ? 'out' : ''}`}>
                            <div className="pn">{c.name}{out && <small>{d.meta.tracks_eliminations && c.out_week ? `Out · Wk ${c.out_week}` : 'Out'}</small>}</div>
                            <div className="bar" aria-hidden><i style={{ width: `${Math.max(2, (c.total / mx) * 100)}%`, background: t.color, opacity: out ? 0.3 : 0.85 }} /></div>
                            {wk !== null && <div className={`wk num ${wk < 0 ? 'neg' : ''}`}>{out && !wk ? '–' : fmtDelta(wk)}</div>}
                            <div className="tot num">{c.total}</div>
                          </div>
                        );
                      })}
                    </div>
                    <button type="button" className="teamlink" onClick={() => goTeams(t.team)}>Players, stats &amp; breakdown<span>Teams tab ›</span></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {Object.keys(d.ranks).length > 0 && (d.meta.scored_weeks?.length ?? 0) > 1 && (
        <section className="panel">
          <h2 className="ph" style={{ marginBottom: 12 }}>Rank through the season</h2>
          <RankChart d={d} />
          <div className="legend">
            {d.teamTotals.map((t, i) => <div key={t.team}><Dot c={colorFor(t.team, i)} />{t.team}</div>)}
          </div>
        </section>
      )}

      {d.highlights.length > 1 && (
        <Disclosure title="Week by week" sub="Every week's top scorer, top team and who went out">
          <Highlights d={d} />
        </Disclosure>
      )}
    </>
  );
}

/** Rank per week, one line per team — fits the screen width (no sideways scrolling). */
function RankChart({ d }: { d: SeasonPayload }) {
  const teams = d.teamTotals.map(t => t.team);
  const nWeeks = Math.max(...Object.values(d.ranks).map(r => r.length), 1);
  const W = 320, H = 200, padL = 20, padR = 10, padT = 12, padB = 24;
  const x = (i: number) => padL + (W - padL - padR) * (nWeeks > 1 ? i / (nWeeks - 1) : 0);
  const y = (r: number) => padT + (H - padT - padB) * ((r - 1) / Math.max(teams.length - 1, 1));
  const every = nWeeks > 9 ? 3 : nWeeks > 6 ? 2 : 1;
  const labels = d.meta.scored_weeks ?? [];
  const leader = d.teamTotals[0]?.team;
  const story = teams.map(t => `${t}: ${(d.ranks[t] || []).map(ordinal).join(', ')}`).join('. ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Weekly rank of each team. ${story}`} style={{ display: 'block' }}>
      {Array.from({ length: teams.length }, (_, k) => k + 1).map(r => (
        <g key={r}>
          <line x1={padL} x2={W - padR} y1={y(r)} y2={y(r)} stroke="#2f2a27" />
          <text x={8} y={y(r) + 4} fill="#a8a29e" fontSize="11" textAnchor="middle">{r}</text>
        </g>
      ))}
      {Array.from({ length: nWeeks }, (_, i) => i).filter(i => i % every === 0 || i === nWeeks - 1).map(i => (
        <text key={i} x={x(i)} y={H - 6} fill="#a8a29e" fontSize="10" textAnchor="middle">{labels[i] !== undefined ? weekLabel(d, labels[i]) : i + 1}</text>
      ))}
      {[...teams].reverse().map(team => {
        const ti = teams.indexOf(team);
        const arr = d.ranks[team] || [];
        // teams tied at the same rank share a row — nudge them apart so every line stays visible
        const yy = (r: number, i: number) => {
          const same = teams.filter(t => (d.ranks[t] || [])[i] === r);
          return y(r) + (same.length > 1 ? (same.indexOf(team) - (same.length - 1) / 2) * 5 : 0);
        };
        const pts = arr.map((r, i) => `${x(i).toFixed(1)},${yy(r, i).toFixed(1)}`).join(' ');
        const c = colorFor(team, ti);
        const last = arr.length - 1;
        return (
          <g key={team}>
            <polyline points={pts} fill="none" stroke={c} strokeWidth={team === leader ? 3 : 2.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.92} />
            {last >= 0 && <circle cx={x(last)} cy={yy(arr[last], last)} r={4.5} fill={c} />}
          </g>
        );
      })}
    </svg>
  );
}

/** Weekly highlights, newest first: top scorer(s), top team(s), and who went out. */
function Highlights({ d }: { d: SeasonPayload }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setOpen(o => ({ ...o, [k]: !o[k] }));
  return (
    <div className="hls">
      {[...d.highlights].reverse().map(h => {
        const cs = h.top_contestants ?? (h.top_contestant ? [h.top_contestant] : []);
        const ts = h.top_teams ?? (h.top_team ? [h.top_team] : []);
        return (
          <div key={h.week} className="hl">
            <div className="wkb">Wk {h.week}</div>
            <div className="hlb">
              <div className="ln"><span className="lbl">Top</span>
                <Tied names={cs} pts={h.top_contestant_pts} open={!!open[`c${h.week}`]} onToggle={() => toggle(`c${h.week}`)} /></div>
              <div className="ln"><span className="lbl">Team</span>
                <Tied names={ts} pts={h.top_team_pts} teams open={!!open[`t${h.week}`]} onToggle={() => toggle(`t${h.week}`)} /></div>
              {!!h.out?.length && <div className="ln"><span className="lbl">Out</span><span className="outn">{h.out.join(', ')}</span></div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Up to 3 tied names are listed; 4+ collapse to "N-way tie" and expand on tap. */
function Tied({ names, pts, open, onToggle, teams }: { names: string[]; pts: number | null; open: boolean; onToggle: () => void; teams?: boolean }) {
  if (!names.length) return <span className="muted">—</span>;
  const p = pts === null || pts === undefined ? null : <span className="muted"> ({pts})</span>;
  if (names.length > 3 && !open) return <span><button type="button" className="tiebtn" aria-expanded={false} onClick={onToggle}>{names.length}-way tie ▾</button>{p}</span>;
  return (
    <span className="names">
      {teams ? names.map(n => <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Dot c={colorFor(n)} />{n}</span>) : names.join(', ')}
      {p}
      {names.length > 3 && <button type="button" className="tiebtn" aria-expanded onClick={onToggle}>less ▴</button>}
    </span>
  );
}

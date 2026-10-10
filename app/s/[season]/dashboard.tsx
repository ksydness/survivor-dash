'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SeasonPayload, Contestant } from '@/lib/types';
import PushToggle from './PushToggle';

// Stable team colors. Add new teams here if names change between seasons.
const TEAM_COLORS: Record<string, string> = {
  'Kenny + Lena': '#fb7185',
  'Tony + Karina': '#f59e0b',
  'Megan + Jake': '#2dd4bf',
  'Will + Kathleen + Anna': '#a78bfa',
  'Will': '#a78bfa',  // S46 precursor of Will + Kathleen + Anna — same lineage, same color
  'Megan + Jake + Colt': '#2dd4bf',           // S51 — Megan + Jake lineage
  'Will + Kathleen + Anna + Dan': '#a78bfa',  // S51 — Will + Kathleen + Anna lineage
};
const FALLBACK = ['#fb7185', '#f59e0b', '#2dd4bf', '#a78bfa', '#60a5fa', '#f472b6'];
function colorFor(team: string, i = 0) { return TEAM_COLORS[team] ?? FALLBACK[i % FALLBACK.length]; }

/* ── week helpers (week numbers follow the sheet's "Week N" headers when they're clean) ── */
const weekLabel = (d: SeasonPayload, i: number) => d.meta.week_labels?.[i] ?? i + 1;
const latestWeek = (d: SeasonPayload) => { const s = d.meta.scored_weeks ?? []; return s.length ? s[s.length - 1] : null; };
const r2 = (v: number) => Math.round(v * 100) / 100;
const fmtDelta = (v: number) => (v > 0 ? `+${r2(v)}` : `${r2(v)}`);
const teamWeekPts = (d: SeasonPayload, team: string, i: number) => r2(d.contestants.filter(c => c.team === team).reduce((a, c) => a + (c.weeks[i] ?? 0), 0));
/** "this week" deltas only make sense while a season is running */
const liveWeek = (d: SeasonPayload) => (d.meta.status === 'active' ? latestWeek(d) : null);

/**
 * The season as it stood right after the k-th scored week (k = position in meta.scored_weeks).
 * Later weeks are zeroed (arrays keep their length so week indexes stay valid), totals/ranks are
 * recomputed with shared ranks on ties, highlights and the rank chart are cut off, and players
 * who went out later count as still in. A rewound season is shown as "active" (so the week's
 * points show and no crown appears) — it wasn't over yet at that point.
 */
function asOf(d: SeasonPayload, k: number): SeasonPayload {
  const sw = d.meta.scored_weeks ?? [];
  if (!sw.length || k >= sw.length - 1) return d;
  const cut = sw[k];
  const cutLabel = weekLabel(d, cut);
  const contestants = d.contestants.map(c => {
    const weeks = c.weeks.map((v, i) => (i <= cut ? v : 0));
    const total = r2(weeks.reduce((a, b) => a + b, 0));
    const eliminated = d.meta.tracks_eliminations
      ? !!c.eliminated && (c.out_week == null || c.out_week <= cutLabel)
      : total === 0;  // no Out column: same 0-points fallback the data layer uses
    return { ...c, weeks, total, eliminated };
  });
  const tmap: Record<string, number> = {};
  contestants.forEach(c => { tmap[c.team] = r2((tmap[c.team] ?? 0) + c.total); });
  const vals = Object.values(tmap);
  const teamTotals = Object.entries(tmap)
    .map(([team, total]) => ({ team, total, rank: 1 + vals.filter(v => v > total).length }))
    .sort((a, b) => b.total - a.total);
  const ranks = Object.fromEntries(Object.entries(d.ranks).map(([t, r]) => [t, r.slice(0, k + 1)]));
  return {
    ...d,
    meta: { ...d.meta, status: 'active', scored_weeks: sw.slice(0, k + 1) },
    contestants, teamTotals, ranks,
    highlights: d.highlights.slice(0, k + 1),
  };
}

type Tab = 'leaderboard' | 'teams' | 'contestants' | 'stats' | 'history';
const TABS: [Tab, string][] = [
  ['leaderboard', 'Leaderboard'], ['teams', 'Teams'], ['contestants', 'Contestants'],
  ['stats', 'Stats'], ['history', 'History'],
];

export default function Dashboard({ season }: { season: number }) {
  const [data, setData] = useState<SeasonPayload | null>(null);
  const [tab, setTab] = useState<Tab>('leaderboard');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<number | null>(null);  // position in scored_weeks; null = latest

  async function load(sync = false) {
    sync ? setRefreshing(true) : setLoading(true);
    try {
      const res = await fetch(`/api/season/${season}${sync ? '?sync=1' : ''}`);
      setData(await res.json());
    } finally { setLoading(false); setRefreshing(false); }
  }
  useEffect(() => {
    // ?sync=1 (score-notification taps) bypasses the 3-min cache so the new week shows; then drop it from the URL
    const url = new URL(window.location.href);
    const sync = url.searchParams.get('sync') === '1';
    if (sync) { url.searchParams.delete('sync'); window.history.replaceState(null, '', url); }
    load(sync);
    /* eslint-disable-next-line */
  }, [season]);

  // ?week=N opens the dashboard rewound to that sheet week (shareable link)
  useEffect(() => {
    if (!data?.meta) return;
    const w = parseInt(new URLSearchParams(window.location.search).get('week') || '', 10);
    const sw = data.meta.scored_weeks ?? [];
    const k = Number.isFinite(w) ? sw.findIndex(i => weekLabel(data, i) === w) : -1;
    setView(k >= 0 && k < sw.length - 1 ? k : null);
  }, [data]);

  function goTo(k: number | null) {
    setView(k);
    const url = new URL(window.location.href);
    const sw = data?.meta.scored_weeks ?? [];
    if (k === null || k >= sw.length - 1) url.searchParams.delete('week');
    else url.searchParams.set('week', String(weekLabel(data!, sw[k])));
    window.history.replaceState(null, '', url.toString());
  }

  if (loading) return <Shell><div style={{ textAlign: 'center', color: '#a8a29e', padding: 60 }}>Loading…</div></Shell>;
  if (!data?.meta) return <Shell><div style={{ textAlign: 'center', color: '#a8a29e', padding: 60 }}>Season not found.</div></Shell>;

  const sw = data.meta.scored_weeks ?? [];
  const last = sw.length - 1;
  const k = view === null ? last : Math.min(view, last);
  const v = view === null ? data : asOf(data, k);  // what every tab renders
  const stepper = sw.length === 0 ? <div className="thru">No episodes scored yet</div> : (
    <div className="weeknav">
      <div className={`thru stepper ${k < last ? 'past' : ''}`}>
        <button aria-label="Previous week" disabled={k <= 0} onClick={() => goTo(k - 1)}>‹</button>
        <span>{k === last && data.meta.status === 'final' ? 'Final standings' : `Through Week ${weekLabel(data, sw[k])}`}</span>
        <button aria-label="Next week" disabled={k >= last} onClick={() => goTo(k + 1 >= last ? null : k + 1)}>›</button>
      </div>
      {k < last && <button className="latest" onClick={() => goTo(null)}>Back to latest (Week {weekLabel(data, sw[last])}) »</button>}
    </div>
  );

  return (
    <Shell
      title={data.meta.name || `Season ${season}`}
      through={stepper}
      onRefresh={() => load(true)} refreshing={refreshing}
      tab={tab} setTab={setTab}
    >
      {tab === 'leaderboard' && <Leaderboard d={v} />}
      {tab === 'teams' && <Teams d={v} />}
      {tab === 'contestants' && <Contestants d={v} />}
      {tab === 'stats' && <Stats d={v} />}
      {tab === 'history' && <History d={v} />}
    </Shell>
  );
}

/* ── layout shell ── */
function Shell(props: { children: React.ReactNode; title?: string; through?: React.ReactNode; onRefresh?: () => void; refreshing?: boolean; tab?: Tab; setTab?: (t: Tab) => void }) {
  return (
    <>
      <style>{CSS}</style>
      <div id="app">
        <div className="topnav"><a href="/">‹ All seasons</a></div>
        <div className="header">
          <div className="torch">🔥</div>
          <h1>{props.title ?? 'Fantasy Survivor'}</h1>
          <div className="sub">Friends League</div>
          {props.through}
          {props.onRefresh && (
            <button className="refresh" onClick={props.onRefresh} disabled={props.refreshing}>
              {props.refreshing ? 'Syncing…' : '↻ Refresh'}
            </button>
          )}
          {props.onRefresh && <PushToggle />}
        </div>
        {props.setTab && (
          <div className="tabs">
            {TABS.map(([id, label]) => (
              <div key={id} className={`tab ${props.tab === id ? 'active' : ''}`} onClick={() => props.setTab!(id)}>{label}</div>
            ))}
          </div>
        )}
        {props.children}
      </div>
    </>
  );
}

/* ── tabs ── */
function Leaderboard({ d }: { d: SeasonPayload }) {
  const tt = d.teamTotals;
  const li = liveWeek(d);
  // tap a team to see its roster; one open at a time (the Teams tab shows them all)
  const [open, setOpen] = useState<string | null>(null);
  const mx = Math.max(...d.contestants.map(c => c.total), 1);
  return (
    <>
      <div className="panel">
        <h2>Standings</h2>
        <div className="grid">
          {tt.map((t, i) => {
            const r = t.rank ?? i + 1;
            const tied = tt.filter(x => (x.rank ?? -1) === r).length > 1;
            const wk = li === null ? null : teamWeekPts(d, t.team, li);
            const isOpen = open === t.team;
            return (
              <div key={t.team} className={`standgrp ${isOpen ? 'open' : ''}`}>
                <button type="button" className={`stand ${r === 1 ? 'win' : ''}`} aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : t.team)}>
                  <div className="bar" style={{ background: colorFor(t.team, i) }} />
                  <div className={`rk ${tied ? 'tie' : ''}`}>{tied ? `T-${r}` : r}</div>
                  <div className="nm">{t.team}{r === 1 && d.meta.status === 'final' ? ' 👑' : ''}
                    {wk !== null && <small className={wk < 0 ? 'neg' : ''}>{fmtDelta(wk)} this week</small>}
                  </div>
                  <div className="pts">{t.total}<span> pts</span></div>
                  <div className="chev" aria-hidden>▾</div>
                </button>
                {isOpen && (
                  <div className="standroster">
                    <Roster d={d} team={t.team} color={colorFor(t.team, i)} mx={mx} li={li} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {Object.keys(d.ranks).length > 0 && (
        <div className="panel">
          <h2>Rank Through The Season</h2>
          <div className="chartwrap"><RankChart d={d} /></div>
          <div className="legend">
            {tt.map((t, i) => <div key={t.team} className="item"><span className="dot" style={{ background: colorFor(t.team, i) }} />{t.team}</div>)}
          </div>
        </div>
      )}
      {d.highlights.length > 0 && <Highlights d={d} />}
    </>
  );
}

/** Weekly highlights, newest first: top scorer(s), top team(s), and who went out. */
function Highlights({ d }: { d: SeasonPayload }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setOpen(o => ({ ...o, [k]: !o[k] }));
  return (
    <div className="panel">
      <h2>Weekly Highlights</h2>
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
    </div>
  );
}

/** Up to 3 tied names are listed; 4+ collapse to "N-way tie" and expand on tap. */
function Tied({ names, pts, open, onToggle, teams }: { names: string[]; pts: number | null; open: boolean; onToggle: () => void; teams?: boolean }) {
  if (!names.length) return <span className="muted">—</span>;
  const p = pts === null || pts === undefined ? null : <span className="muted"> ({pts})</span>;
  if (names.length > 3 && !open) return <span><button className="tiebtn" onClick={onToggle}>{names.length}-way tie ▾</button>{p}</span>;
  return (
    <span className="names">
      {teams
        ? names.map(n => <span key={n} className="teamtag hlteam"><span className="dot" style={{ background: colorFor(n) }} />{n}</span>)
        : names.join(', ')}
      {p}
      {names.length > 3 && <button className="tiebtn" onClick={onToggle}>less ▴</button>}
    </span>
  );
}

function RankChart({ d }: { d: SeasonPayload }) {
  const teams = d.teamTotals.map(t => t.team);
  const nWeeks = Math.max(...Object.values(d.ranks).map(r => r.length), 1);
  const W = Math.max(640, nWeeks * 48), H = 260, padL = 34, padR = 14, padT = 18, padB = 28;
  const x = (i: number) => padL + (W - padL - padR) * (nWeeks > 1 ? i / (nWeeks - 1) : 0);
  const y = (r: number) => padT + (H - padT - padB) * ((r - 1) / Math.max(teams.length - 1, 1));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
      {Array.from({ length: teams.length }, (_, k) => k + 1).map(r => (
        <g key={r}>
          <line x1={padL} x2={W - padR} y1={y(r)} y2={y(r)} stroke="#2f2a27" />
          <text x={padL - 8} y={y(r) + 4} fill="#78716c" fontSize="11" textAnchor="end">{r}</text>
        </g>
      ))}
      {Array.from({ length: nWeeks }, (_, i) => (
        <text key={i} x={x(i)} y={H - 8} fill="#78716c" fontSize="10" textAnchor="middle">{d.meta.scored_weeks ? weekLabel(d, d.meta.scored_weeks[i]) : i + 1}</text>
      ))}
      {teams.map((team, ti) => {
        const arr = d.ranks[team] || [];
        // teams tied at the same rank share a row — nudge them apart so every line stays visible
        const yy = (r: number, i: number) => {
          const same = teams.filter(t => (d.ranks[t] || [])[i] === r);
          return y(r) + (same.length > 1 ? (same.indexOf(team) - (same.length - 1) / 2) * 5 : 0);
        };
        const pts = arr.map((r, i) => `${x(i)},${yy(r, i)}`).join(' ');
        return (
          <g key={team}>
            <polyline points={pts} fill="none" stroke={colorFor(team, ti)} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.92} />
            {arr.map((r, i) => <circle key={i} cx={x(i)} cy={yy(r, i)} r={i === arr.length - 1 ? 4 : 2.5} fill={colorFor(team, ti)} />)}
          </g>
        );
      })}
    </svg>
  );
}

/** still-in contestants first (by points), eliminated sink to the bottom */
const rosterOf = (d: SeasonPayload, team: string) => d.contestants.filter(c => c.team === team)
  .sort((a, b) => Number(!!a.eliminated) - Number(!!b.eliminated) || b.total - a.total);

/** One team's players with point bars — used by the Teams tab and the expanded Leaderboard row. */
function Roster({ d, team, color, mx, li }: { d: SeasonPayload; team: string; color: string; mx: number; li: number | null }) {
  return (
    <div className="roster">
      {rosterOf(d, team).map(c => {
        const elim = !!c.eliminated;
        return (
          <div key={c.name} className={`player ${elim ? 'out' : ''}`}>
            <div className={`pn ${elim ? 'elim' : ''}`}>{c.name}{elim && d.meta.tracks_eliminations && <small>{c.out_week ? `Out · Wk ${c.out_week}` : 'Out'}</small>}</div>
            <div className="track"><div className="fill" style={{ width: `${Math.max(2, c.total / mx * 100)}%`, background: color, opacity: elim ? 0.25 : 0.85 }} /></div>
            {li !== null && <div className={`wk ${(c.weeks[li] ?? 0) < 0 ? 'neg' : ''}`}>{elim && !c.weeks[li] ? '' : fmtDelta(c.weeks[li] ?? 0)}</div>}
            <div className="pp">{c.total}</div>
          </div>
        );
      })}
    </div>
  );
}

function Teams({ d }: { d: SeasonPayload }) {
  // bars are scaled to the top scorer league-wide (not per team) so they compare across teams
  const mx = Math.max(...d.contestants.map(c => c.total), 1);
  const li = liveWeek(d);
  return (
    <>
      {d.teamTotals.map((t, i) => {
        const roster = rosterOf(d, t.team);
        const left = roster.filter(c => !c.eliminated).length;
        const wk = li === null ? null : teamWeekPts(d, t.team, li);
        const sub = [
          d.meta.tracks_eliminations ? `${left} of ${roster.length} left` : '',
          wk !== null ? `${fmtDelta(wk)} this week` : '',
        ].filter(Boolean).join(' · ');
        return (
          <div key={t.team} className="panel teamcard">
            <h3><span className="sq" style={{ background: colorFor(t.team, i) }} />{t.team}<span className="tot">{t.total}</span></h3>
            {sub && <div className="left">{sub}</div>}
            <Roster d={d} team={t.team} color={colorFor(t.team, i)} mx={mx} li={li} />
          </div>
        );
      })}
    </>
  );
}

function Contestants({ d }: { d: SeasonPayload }) {
  const [key, setKey] = useState<'name' | 'team' | 'best' | 'total'>('total');
  const [asc, setAsc] = useState(false);
  const mxw = Math.max(...d.contestants.flatMap(c => c.weeks), 1);
  const rows = useMemo(() => {
    const r = d.contestants.map(c => ({ ...c, best: Math.max(...c.weeks, 0) }));
    r.sort((a, b) => {
      const v = key === 'name' || key === 'team' ? String(a[key]).localeCompare(String(b[key])) : (a as any)[key] - (b as any)[key];
      return asc ? v : -v;
    });
    return r;
  }, [d, key, asc]);
  const sort = (k: typeof key) => { if (key === k) setAsc(!asc); else { setKey(k); setAsc(k === 'name' || k === 'team'); } };
  return (
    <div className="panel">
      <h2>All Contestants</h2>
      <div className="scroll">
      <table className="wide">
        <thead><tr>
          <th onClick={() => sort('name')}>Contestant</th>
          <th onClick={() => sort('team')}>Team</th>
          <th onClick={() => sort('best')} className="num">Best Wk</th>
          <th onClick={() => sort('total')} className="num">Total</th>
          <th>Trend</th>
        </tr></thead>
        <tbody>{rows.map(c => (
          <tr key={c.name}>
            <td className={c.eliminated ? 'elim' : ''}>{c.name}</td>
            <td><span className="teamtag"><span className="dot" style={{ background: colorFor(c.team) }} />{c.team}</span></td>
            <td className="num">{c.best}</td>
            <td className="num"><b>{c.total}</b></td>
            <td style={{ minWidth: 160 }}>
              <div className="spark">{c.weeks.map((v, i) => (
                <i key={i} style={{ height: `${v <= 0 ? 2 : Math.max(8, v / mxw * 100)}%`, background: v < 0 ? '#f87171' : colorFor(c.team), opacity: v === 0 ? 0.2 : 0.8 }} />
              ))}</div>
            </td>
          </tr>
        ))}</tbody>
      </table>
      </div>
      <div className="note">Tip: scroll the table sideways on mobile to see the full trend.</div>
    </div>
  );
}

function Stats({ d }: { d: SeasonPayload }) {
  const top = [...d.contestants].sort((a, b) => b.total - a.total);
  let bestWk = { p: '', v: -Infinity, wk: 0 };
  d.contestants.forEach(c => c.weeks.forEach((v, i) => { if (v > bestWk.v) bestWk = { p: c.name, v, wk: weekLabel(d, i) }; }));
  const spread = d.teamTotals.length ? d.teamTotals[0].total - d.teamTotals[d.teamTotals.length - 1].total : 0;
  const allPts = d.contestants.reduce((a, c) => a + c.total, 0);
  const negs = d.contestants.flatMap(c => c.weeks.map((v, i) => ({ c: c.name, v, wk: weekLabel(d, i) }))).filter(x => x.v < 0).sort((a, b) => a.v - b.v);
  return (
    <>
      <div className="panel"><h2>Season Records</h2>
        <div className="stats">
          <Stat k="Leader" v={d.teamTotals[0]?.team} dd={`${d.teamTotals[0]?.total} pts`} c={colorFor(d.teamTotals[0]?.team || '')} />
          <Stat k="Top Contestant" v={top[0]?.name} dd={`${top[0]?.total} pts · ${top[0]?.team}`} />
          <Stat k="Biggest Single Week" v={String(bestWk.v)} dd={`${bestWk.p} · Week ${bestWk.wk}`} />
          <Stat k="Margin (1st–last)" v={String(spread)} dd="points" />
          <Stat k="Total Points" v={String(allPts)} dd={`${d.contestants.length} contestants`} />
        </div>
      </div>
      <div className="panel"><h2>Top 5 Contestants</h2>
        <table><thead><tr><th>#</th><th>Contestant</th><th>Team</th><th className="num">Pts</th></tr></thead>
          <tbody>{top.slice(0, 5).map((c, i) => (
            <tr key={c.name}><td>{i + 1}</td><td>{c.name}</td>
              <td><span className="teamtag"><span className="dot" style={{ background: colorFor(c.team) }} />{c.team}</span></td>
              <td className="num"><b>{c.total}</b></td></tr>
          ))}</tbody></table>
      </div>
      {negs.length > 0 && (
        <div className="panel"><h2>Negative Weeks</h2>
          <table><thead><tr><th>Contestant</th><th className="num">Week</th><th className="num">Pts</th></tr></thead>
            <tbody>{negs.map((n, i) => <tr key={i}><td>{n.c}</td><td className="num">{n.wk}</td><td className="num neg">{n.v}</td></tr>)}</tbody></table>
        </div>
      )}
    </>
  );
}
function Stat({ k, v, dd, c }: { k: string; v?: string; dd?: string; c?: string }) {
  return <div className="stat"><div className="k">{k}</div><div className="v" style={c ? { color: c } : undefined}>{v ?? '—'}</div><div className="d">{dd}</div></div>;
}

function History({ d }: { d: SeasonPayload }) {
  const bySeason: Record<number, { team: string; place: number; points: number }[]> = {};
  d.history.forEach(h => { (bySeason[h.season] ??= []).push(h); });
  const seasons = Object.keys(bySeason).map(Number).sort((a, b) => b - a);
  // all-time titles + avg
  const agg: Record<string, { titles: number; sum: number; n: number; high: number }> = {};
  d.history.forEach(h => {
    const a = (agg[h.team] ??= { titles: 0, sum: 0, n: 0, high: 0 });
    if (h.place === 1) a.titles++; a.sum += h.points; a.n++; a.high = Math.max(a.high, h.points);
  });
  const alltime = Object.entries(agg).map(([team, v]) => ({ team, titles: v.titles, avg: v.sum / v.n, high: v.high }))
    .sort((a, b) => b.titles - a.titles || b.avg - a.avg);
  return (
    <>
      {alltime.length > 0 && (
        <div className="panel"><h2>All-Time</h2>
          <table><thead><tr><th>Team</th><th className="num">🏆</th><th className="num">Avg</th><th className="num">Best</th></tr></thead>
            <tbody>{alltime.map(t => (
              <tr key={t.team}><td><span className="teamtag"><span className="dot" style={{ background: colorFor(t.team) }} />{t.team}</span></td>
                <td className="num"><b>{t.titles}</b></td><td className="num">{t.avg.toFixed(1)}</td><td className="num">{t.high}</td></tr>
            ))}</tbody></table>
        </div>
      )}
      {seasons.map(s => (
        <div key={s} className="panel"><h2>Season {s}</h2>
          <div className="grid">{bySeason[s].sort((a, b) => a.place - b.place).map(r => (
            <div key={r.team} className={`stand ${r.place === 1 ? 'win' : ''}`}>
              <div className="bar" style={{ background: colorFor(r.team) }} />
              <div className="rk">{r.place}</div><div className="nm">{r.team}</div><div className="pts">{r.points}<span> pts</span></div>
            </div>
          ))}</div>
        </div>
      ))}
    </>
  );
}

/* ── styles (shared with prototype/index.html) ── */
const CSS = `
#app{max-width:1080px;margin:0 auto;padding:0 16px 64px}
.topnav{padding:14px 0 0}
.topnav a{color:#a8a29e;font-size:13px;font-weight:600;text-decoration:none}
.topnav a:hover{color:#f59e0b}
.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
table.wide{min-width:480px}
.note{font-size:12px;color:#78716c;margin-top:10px}
.header{text-align:center;padding:32px 0 14px}
.torch{font-size:40px}
.header h1{font-size:28px;font-weight:800;letter-spacing:-.02em;margin-top:6px;background:linear-gradient(90deg,#f59e0b,#f97316);-webkit-background-clip:text;background-clip:text;color:transparent}
.header .sub{color:#a8a29e;font-size:14px;margin-top:4px}
.header .thru{display:inline-block;margin-top:8px;font-size:12px;font-weight:600;color:#d6d3d1;background:#1c1917;border:1px solid #2f2a27;border-radius:999px;padding:3px 11px}
.weeknav{display:flex;flex-direction:column;align-items:center;gap:4px}
.thru.stepper{display:inline-flex;align-items:center;gap:6px;padding:2px 4px;font-size:13px}
.thru.stepper span{min-width:118px;text-align:center}
.thru.stepper button{background:none;border:none;color:#fafaf9;font-size:20px;line-height:1;width:30px;height:28px;border-radius:999px;cursor:pointer}
.thru.stepper button:hover:not(:disabled){background:#262220}
.thru.stepper button:disabled{color:#44403c;cursor:default}
.thru.stepper.past{border-color:#f59e0b;color:#fcd34d}
.weeknav .latest{background:none;border:none;color:#a8a29e;font-size:12px;font-weight:600;cursor:pointer;padding:2px 6px}
.weeknav .latest:hover{color:#fafaf9}
.refresh{margin-top:12px;background:#1c1917;color:#fafaf9;border:1px solid #2f2a27;border-radius:999px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer}
.refresh:disabled{opacity:.6;cursor:default}
.tabs{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin:8px 0 22px;position:sticky;top:0;background:linear-gradient(#0c0a09,#0c0a09 70%,transparent);padding:10px 0;z-index:20}
.tab{cursor:pointer;font-size:14px;font-weight:600;color:#a8a29e;padding:8px 16px;border-radius:999px;border:1px solid transparent}
.tab:hover{color:#fafaf9;background:#1c1917}
.tab.active{color:#1c1917;background:linear-gradient(90deg,#f59e0b,#f97316)}
.panel{background:#1c1917;border:1px solid #2f2a27;border-radius:16px;padding:20px;margin-bottom:16px}
.panel h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#a8a29e;margin-bottom:14px;font-weight:700}
.grid{display:grid;gap:12px}
.stand{display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:14px;background:#262220;border:1px solid #2f2a27;position:relative;overflow:hidden}
button.stand{width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent}
.stand .bar{position:absolute;left:0;top:0;bottom:0;width:6px}
.stand .rk{font-size:20px;font-weight:800;width:34px;text-align:center;color:#78716c}
.stand.win .rk{color:#fcd34d}
.stand .nm{font-weight:700;font-size:16px;flex:1}
.stand .nm small{display:block;font-size:12px;font-weight:600;color:#a8a29e;margin-top:2px}
.stand .nm small.neg{color:#f87171}
.stand .rk.tie{font-size:15px}
.stand .pts{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums}
.stand .pts span{font-size:12px;color:#a8a29e;font-weight:600}
.stand .chev{color:#78716c;font-size:13px;margin-left:-6px;transition:transform .15s}
.standgrp.open .stand{border-bottom-left-radius:0;border-bottom-right-radius:0}
.standgrp.open .stand .chev{transform:rotate(180deg)}
.standroster{background:#1f1b19;border:1px solid #2f2a27;border-top:none;border-radius:0 0 14px 14px;padding:2px 16px 14px 22px}
.chartwrap{overflow-x:auto}svg{display:block}
.legend{display:flex;flex-wrap:wrap;gap:14px;margin-top:12px}
.legend .item{display:flex;align-items:center;gap:7px;font-size:13px;color:#a8a29e}
.legend .dot,.teamtag .dot{width:11px;height:11px;border-radius:3px}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{padding:9px 10px;text-align:left;border-bottom:1px solid #2f2a27}
th{color:#a8a29e;font-size:11px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;cursor:pointer;user-select:none;white-space:nowrap}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
tr:last-child td{border-bottom:none}
.teamtag{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#a8a29e}
.elim{color:#78716c}.neg{color:#f87171}
.teamcard h3{font-size:16px;display:flex;align-items:center;gap:9px}
.teamcard .sq{width:12px;height:12px;border-radius:4px;display:inline-block}
.teamcard .tot{margin-left:auto;font-size:20px;font-weight:800;font-variant-numeric:tabular-nums}
.roster{margin-top:12px;display:grid;gap:7px}
.player{display:flex;align-items:center;gap:10px;font-size:14px}
.player .pn{width:96px;flex:none;font-weight:600}
.player .pn small{display:block;font-size:10.5px;font-weight:500;color:#57534e;margin-top:1px}
.player.out .pp{color:#78716c}
.teamcard .left{font-size:12px;color:#a8a29e;margin:-4px 0 8px 21px}
.player .track{flex:1;height:9px;background:#262220;border-radius:6px;overflow:hidden}
.player .fill{height:100%;border-radius:6px}
.player .wk{width:34px;flex:none;text-align:right;font-size:12px;color:#a8a29e;font-variant-numeric:tabular-nums}
.player .wk.neg{color:#f87171}
.hls{display:grid;gap:10px}
.hl{display:flex;gap:12px;padding:12px 14px;background:#262220;border:1px solid #2f2a27;border-radius:12px}
.hl .wkb{flex:none;width:46px;font-weight:800;font-size:13px;color:#fafaf9;padding-top:1px}
.hl .hlb{flex:1;display:grid;gap:5px;font-size:14px;min-width:0}
.hl .ln{display:flex;gap:8px;align-items:baseline}
.hl .lbl{flex:none;width:38px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#78716c;font-weight:700}
.hl .names{display:inline-flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline}
.hl .hlteam{color:#fafaf9;font-size:14px}
.hl .outn{color:#f87171;font-weight:600}
.muted{color:#78716c}
.tiebtn{background:none;border:1px solid #2f2a27;color:#fafaf9;border-radius:999px;padding:1px 9px;font-size:13px;font-weight:600;cursor:pointer}
.player .pp{width:40px;text-align:right;font-variant-numeric:tabular-nums;font-weight:700}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
.stat{background:#262220;border:1px solid #2f2a27;border-radius:14px;padding:16px}
.stat .k{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#a8a29e;font-weight:700}
.stat .v{font-size:24px;font-weight:800;margin-top:6px;line-height:1.1}
.stat .d{font-size:12px;color:#78716c;margin-top:4px}
.spark{display:flex;align-items:flex-end;gap:2px;height:26px}
.spark i{flex:1;border-radius:1px;min-height:2px}
@media(max-width:560px){.player .pn{width:74px}.header h1{font-size:23px}}
`;

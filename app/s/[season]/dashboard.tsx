'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SeasonPayload, Contestant } from '@/lib/types';

// Stable team colors. Add new teams here if names change between seasons.
const TEAM_COLORS: Record<string, string> = {
  'Kenny + Lena': '#fb7185',
  'Tony + Karina': '#f59e0b',
  'Megan + Jake': '#2dd4bf',
  'Will + Kathleen + Anna': '#a78bfa',
};
const FALLBACK = ['#fb7185', '#f59e0b', '#2dd4bf', '#a78bfa', '#60a5fa', '#f472b6'];
function colorFor(team: string, i = 0) { return TEAM_COLORS[team] ?? FALLBACK[i % FALLBACK.length]; }

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

  async function load(sync = false) {
    sync ? setRefreshing(true) : setLoading(true);
    try {
      const res = await fetch(`/api/season/${season}${sync ? '?sync=1' : ''}`);
      setData(await res.json());
    } finally { setLoading(false); setRefreshing(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [season]);

  if (loading) return <Shell><div style={{ textAlign: 'center', color: '#a8a29e', padding: 60 }}>Loading…</div></Shell>;
  if (!data?.meta) return <Shell><div style={{ textAlign: 'center', color: '#a8a29e', padding: 60 }}>Season not found.</div></Shell>;

  return (
    <Shell
      title={data.meta.name || `Season ${season}`}
      onRefresh={() => load(true)} refreshing={refreshing}
      tab={tab} setTab={setTab}
    >
      {tab === 'leaderboard' && <Leaderboard d={data} />}
      {tab === 'teams' && <Teams d={data} />}
      {tab === 'contestants' && <Contestants d={data} />}
      {tab === 'stats' && <Stats d={data} />}
      {tab === 'history' && <History d={data} />}
    </Shell>
  );
}

/* ── layout shell ── */
function Shell(props: { children: React.ReactNode; title?: string; onRefresh?: () => void; refreshing?: boolean; tab?: Tab; setTab?: (t: Tab) => void }) {
  return (
    <>
      <style>{CSS}</style>
      <div id="app">
        <div className="topnav"><a href="/">‹ All seasons</a></div>
        <div className="header">
          <div className="torch">🔥</div>
          <h1>{props.title ?? 'Fantasy Survivor'}</h1>
          <div className="sub">Friends League</div>
          {props.onRefresh && (
            <button className="refresh" onClick={props.onRefresh} disabled={props.refreshing}>
              {props.refreshing ? 'Syncing…' : '↻ Refresh'}
            </button>
          )}
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
  return (
    <>
      <div className="panel">
        <h2>Standings</h2>
        <div className="grid">
          {tt.map((t, i) => (
            <div key={t.team} className={`stand ${i === 0 ? 'win' : ''}`}>
              <div className="bar" style={{ background: colorFor(t.team, i) }} />
              <div className="rk">{i + 1}</div>
              <div className="nm">{t.team}{i === 0 && d.meta.status === 'final' ? ' 👑' : ''}</div>
              <div className="pts">{t.total}<span> pts</span></div>
            </div>
          ))}
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
      {d.highlights.length > 0 && (
        <div className="panel">
          <h2>Weekly Highlights</h2>
          <table><thead><tr><th>Wk</th><th>Top Contestant</th><th className="num">Pts</th><th>Top Team</th><th className="num">Pts</th></tr></thead>
            <tbody>{d.highlights.map(h => (
              <tr key={h.week}><td>{h.week}</td><td>{h.top_contestant}</td><td className="num">{h.top_contestant_pts}</td>
                <td><span className="teamtag"><span className="dot" style={{ background: colorFor(h.top_team || '') }} />{h.top_team}</span></td>
                <td className="num">{h.top_team_pts}</td></tr>
            ))}</tbody></table>
        </div>
      )}
    </>
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
        <text key={i} x={x(i)} y={H - 8} fill="#78716c" fontSize="10" textAnchor="middle">{i + 1}</text>
      ))}
      {teams.map((team, ti) => {
        const arr = d.ranks[team] || [];
        const pts = arr.map((r, i) => `${x(i)},${y(r)}`).join(' ');
        return (
          <g key={team}>
            <polyline points={pts} fill="none" stroke={colorFor(team, ti)} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.92} />
            {arr.map((r, i) => <circle key={i} cx={x(i)} cy={y(r)} r={i === arr.length - 1 ? 4 : 2.5} fill={colorFor(team, ti)} />)}
          </g>
        );
      })}
    </svg>
  );
}

function Teams({ d }: { d: SeasonPayload }) {
  return (
    <>
      {d.teamTotals.map((t, i) => {
        const roster = d.contestants.filter(c => c.team === t.team).sort((a, b) => b.total - a.total);
        const mx = Math.max(...roster.map(c => c.total), 1);
        return (
          <div key={t.team} className="panel teamcard">
            <h3><span className="sq" style={{ background: colorFor(t.team, i) }} />{t.team}<span className="tot">{t.total}</span></h3>
            <div className="roster">
              {roster.map(c => {
                const elim = c.total === 0;
                return (
                  <div key={c.name} className="player">
                    <div className={`pn ${elim ? 'elim' : ''}`}>{c.name}</div>
                    <div className="track"><div className="fill" style={{ width: `${Math.max(2, c.total / mx * 100)}%`, background: colorFor(t.team, i), opacity: elim ? 0.25 : 0.85 }} /></div>
                    <div className="pp">{c.total}</div>
                  </div>
                );
              })}
            </div>
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
            <td className={c.total === 0 ? 'elim' : ''}>{c.name}</td>
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
  d.contestants.forEach(c => c.weeks.forEach((v, i) => { if (v > bestWk.v) bestWk = { p: c.name, v, wk: i + 1 }; }));
  const spread = d.teamTotals.length ? d.teamTotals[0].total - d.teamTotals[d.teamTotals.length - 1].total : 0;
  const allPts = d.contestants.reduce((a, c) => a + c.total, 0);
  const negs = d.contestants.flatMap(c => c.weeks.map((v, i) => ({ c: c.name, v, wk: i + 1 }))).filter(x => x.v < 0).sort((a, b) => a.v - b.v);
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
.stand .bar{position:absolute;left:0;top:0;bottom:0;width:6px}
.stand .rk{font-size:20px;font-weight:800;width:34px;text-align:center;color:#78716c}
.stand.win .rk{color:#fcd34d}
.stand .nm{font-weight:700;font-size:16px;flex:1}
.stand .pts{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums}
.stand .pts span{font-size:12px;color:#a8a29e;font-weight:600}
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
.player .track{flex:1;height:9px;background:#262220;border-radius:6px;overflow:hidden}
.player .fill{height:100%;border-radius:6px}
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

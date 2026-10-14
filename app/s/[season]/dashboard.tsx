'use client';

// Season dashboard. Mobile-first: compact app bar, full-width week picker, one swipeable row of
// tabs. Each tab shows the answer people come for up top; deeper data sits one tap away.
// Design reference: the "Survivor Dash — UX Mockups" canvas + the Fantasy Survivor design system.

import { useEffect, useRef, useState } from 'react';
import type { SeasonPayload } from '@/lib/types';
import PushToggle from './PushToggle';
import { CSS } from './dash/styles';
import { IconBack, IconNext, IconPrev, IconRefresh, IconRules } from './dash/bits';
import { asOf, weekLabel } from './dash/model';
import Leaderboard from './dash/Leaderboard';
import Teams from './dash/Teams';
import Contestants from './dash/Contestants';
import Draft from './dash/Draft';
import Stats from './dash/Stats';
import History from './dash/History';

type Tab = 'leaderboard' | 'teams' | 'contestants' | 'draft' | 'stats' | 'history';
const TABS: [Tab, string][] = [
  ['leaderboard', 'Leaderboard'], ['teams', 'Teams'], ['contestants', 'Contestants'],
  ['draft', 'Draft'], ['stats', 'Stats'], ['history', 'History'],
];
const isTab = (v: string | null): v is Tab => !!v && TABS.some(([id]) => id === v);

export default function Dashboard({ season }: { season: number }) {
  const [data, setData] = useState<SeasonPayload | null>(null);
  const [tab, setTabState] = useState<Tab>('leaderboard');
  const [focusTeam, setFocusTeam] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<number | null>(null);  // position in scored_weeks; null = latest
  const [hint, setHint] = useState<string | null>(null);
  const tabsRef = useRef<HTMLElement | null>(null);

  // keep the active tab visible in the swipeable row (e.g. opening ?tab=history on a phone)
  useEffect(() => {
    const el = tabsRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    const row = tabsRef.current;
    if (el && row) row.scrollTo({ left: Math.max(0, el.offsetLeft - (row.clientWidth - el.offsetWidth) / 2), behavior: 'smooth' });
  }, [tab, data]);

  async function load(sync = false) {
    sync ? setRefreshing(true) : setLoading(true);
    try {
      const res = await fetch(`/api/season/${season}${sync ? '?sync=1' : ''}`);
      setData(await res.json());
    } catch { /* keep what we have */ }
    finally { setLoading(false); setRefreshing(false); }
  }
  useEffect(() => {
    // ?sync=1 (score-notification taps) bypasses the 3-min cache so the new week shows; then drop it from the URL
    const url = new URL(window.location.href);
    const sync = url.searchParams.get('sync') === '1';
    if (sync) { url.searchParams.delete('sync'); window.history.replaceState(null, '', url); }
    const t = url.searchParams.get('tab');
    if (isTab(t)) setTabState(t);
    // ?tab=teams&team=X (homepage standings rows) opens that team's breakdown; drop the param once read
    const team = url.searchParams.get('team');
    if (team) {
      if (t === 'teams') setFocusTeam(team);
      url.searchParams.delete('team'); window.history.replaceState(null, '', url);
    }
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

  function setParam(key: string, value: string | null) {
    const url = new URL(window.location.href);
    if (value === null) url.searchParams.delete(key); else url.searchParams.set(key, value);
    window.history.replaceState(null, '', url.toString());
  }
  function setTab(t: Tab, team: string | null = null) {
    setTabState(t);
    setFocusTeam(team);
    setParam('tab', t === 'leaderboard' ? null : t);
    window.scrollTo({ top: 0 });
  }
  function goTo(k: number | null) {
    setView(k);
    const sw = data?.meta.scored_weeks ?? [];
    setParam('week', k === null || k >= sw.length - 1 ? null : String(weekLabel(data!, sw[k])));
  }

  const title = data?.meta?.name || `Season ${season}`;
  const appBar = (
    <header className="appbar">
      <a className="iconbtn" href="/" aria-label="All seasons"><IconBack /></a>
      <div className="brand"><span className="torch" aria-hidden>🔥</span><h1>{title}</h1></div>
      <a className="iconbtn" href="/scoring" aria-label="Scoring rules" title="Scoring rules"><IconRules /></a>
      <button type="button" className={`iconbtn ${refreshing ? 'spin' : ''}`} onClick={() => load(true)} disabled={refreshing || loading}
        aria-label={refreshing ? 'Syncing scores' : 'Refresh scores'} title="Refresh scores"><IconRefresh /></button>
      <PushToggle variant="icon" onHint={setHint} />
    </header>
  );

  if (loading || !data?.meta) return (
    <div className="dash">
      <style>{CSS}</style>
      {appBar}
      <div className="wrap">
        {loading
          ? <main aria-busy="true" aria-label="Loading"><div className="skel" style={{ height: 48, borderRadius: 999 }} /><div className="skel" style={{ height: 160 }} /><div className="skel" style={{ height: 320 }} /></main>
          : <div className="empty" style={{ marginTop: 24 }}>Season not found.</div>}
      </div>
    </div>
  );

  const sw = data.meta.scored_weeks ?? [];
  const last = sw.length - 1;
  const k = view === null ? last : Math.min(view, last);
  const v = view === null ? data : asOf(data, k);  // what every tab renders
  const tabs = TABS.filter(([id]) => id !== 'draft' || !!data.draft);
  const cur: Tab = tab === 'draft' && !data.draft ? 'leaderboard' : tab;
  const live = data.meta.status === 'active' && k === last;
  const label = sw.length === 0 ? 'No episodes scored yet'
    : k === last && data.meta.status === 'final' ? 'Final standings'
    : <>Week {weekLabel(data, sw[k])} <span className="muted" style={{ fontWeight: 600 }}>of {weekLabel(data, sw[last])}</span></>;

  return (
    <div className="dash">
      <style>{CSS}</style>
      {appBar}
      {hint && <p className="hint" role="status">{hint}</p>}
      <div className="wrap">
        <nav className={`weekbar ${k < last ? 'past' : ''}`} aria-label="Week">
          <button type="button" className="iconbtn" aria-label="Previous week" disabled={sw.length === 0 || k <= 0} onClick={() => goTo(k - 1)}><IconPrev /></button>
          <div className="lbl" aria-live="polite">{label}{live && <span className="live">Live</span>}{k < last && <span className="sr"> (earlier week)</span>}</div>
          <button type="button" className="iconbtn" aria-label="Next week" disabled={sw.length === 0 || k >= last} onClick={() => goTo(k + 1 >= last ? null : k + 1)}><IconNext /></button>
        </nav>
        {k < last && <button type="button" className="latest" onClick={() => goTo(null)}>Back to latest (Week {weekLabel(data, sw[last])}) »</button>}

        <div className="tabsbar">
          <nav className="tabs" aria-label="Dashboard sections" ref={tabsRef}>
            {tabs.map(([id, l]) => (
              <button key={id} type="button" className="tab" aria-current={cur === id ? 'page' : undefined} onClick={() => setTab(id)}>{l}</button>
            ))}
          </nav>
        </div>

        <main>
          {cur === 'leaderboard' && <Leaderboard d={v} goTeams={team => setTab('teams', team)} />}
          {cur === 'teams' && <Teams d={v} focusTeam={focusTeam} />}
          {cur === 'contestants' && <Contestants d={v} />}
          {cur === 'draft' && data.draft && <Draft d={v} />}
          {cur === 'stats' && <Stats d={v} />}
          {cur === 'history' && <History d={v} />}
        </main>
      </div>
    </div>
  );
}

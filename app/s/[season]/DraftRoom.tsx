'use client';

// Live multi-device draft room. Shared state lives in Supabase (one row per
// season) and every device stays in sync via Supabase Realtime plus a polling
// fallback. Devices pick a role in the lobby (a team, or Watch); the
// commissioner opens the page with ?key=<COMMISSIONER_KEY> to get setup and
// override controls. All writes go through /api/live-draft/[season].

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { LEAGUE, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/draftConfig';

// ── team colors (shared with the dashboard) ──
const PRESET: Record<string, string> = {
  'Kenny + Lena': '#fb7185', 'Tony + Karina': '#f59e0b',
  'Megan + Jake': '#2dd4bf', 'Will + Kathleen + Anna': '#a78bfa',
};
const FALLBACK = ['#fb7185', '#f59e0b', '#2dd4bf', '#a78bfa', '#60a5fa', '#f472b6'];
const colorFor = (t: string, i = 0) => PRESET[t] ?? FALLBACK[i % FALLBACK.length];

interface LivePick { overall: number; round: number; teamIndex: number; contestant: string; }
interface LiveState {
  phase: 'setup' | 'drafting' | 'done';
  teams: string[]; cast: string[]; order: number[]; picks: LivePick[];
  rounds: number; clockSecs: number;
  deadline: string | null; pausedRemaining: number | null;
}
interface LiveDraft { season: number; state: LiveState; version: number; }

type Role = { kind: 'commish'; teamIndex: number | null } | { kind: 'team'; index: number } | { kind: 'watch' };

export default function DraftRoom({ season }: { season: number }) {
  const [configured, setConfigured] = useState(true);
  const [draft, setDraft] = useState<LiveDraft | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [role, setRole] = useState<Role | null>(null);
  const [commishKey, setCommishKey] = useState('');
  const [muted, setMuted] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [splash, setSplash] = useState<LivePick | null>(null);
  const [turnSplash, setTurnSplash] = useState(false);

  const splashTimer = useRef<number | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const confettiRef = useRef<HTMLCanvasElement | null>(null);
  const prevPicksLen = useRef<number | null>(null);
  const prevPhase = useRef<string | null>(null);
  const prevSecs = useRef<number | null>(null);
  const turnTimers = useRef<number[]>([]);
  const createdOnce = useRef(false);

  const roleKey = `survivor-live-role-s${season}`;
  const keyKey = 'survivor-commish-key';

  // ── role + commissioner key (from URL or storage) ──
  useEffect(() => {
    try {
      const urlKey = new URLSearchParams(window.location.search).get('key');
      if (urlKey) localStorage.setItem(keyKey, urlKey);
      const storedKey = localStorage.getItem(keyKey) || '';
      setCommishKey(storedKey);
      const r = localStorage.getItem(roleKey);
      if (r?.startsWith('commish') && storedKey) {
        const t = r.includes(':') ? parseInt(r.split(':')[1], 10) : NaN;
        setRole({ kind: 'commish', teamIndex: isNaN(t) ? null : t });
      }
      else if (r === 'watch') setRole({ kind: 'watch' });
      else if (r?.startsWith('t')) { const i = parseInt(r.slice(1), 10); if (!isNaN(i)) setRole({ kind: 'team', index: i }); }
    } catch { /* ignore */ }
  }, [roleKey]);

  function chooseRole(r: Role | null) {
    setRole(r);
    try {
      if (!r) localStorage.removeItem(roleKey);
      else localStorage.setItem(roleKey, r.kind === 'team' ? `t${r.index}` : r.kind === 'commish' ? (r.teamIndex != null ? `commish:${r.teamIndex}` : 'commish') : 'watch');
    } catch { /* ignore */ }
  }

  // ── data: fetch + realtime + polling fallback ──
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/live-draft/${season}`, { cache: 'no-store' });
      const j = await res.json();
      if (j.configured === false) setConfigured(false);
      else if (j.draft !== undefined) setDraft(j.draft);
      if (j.error && res.status >= 500) setError(j.error);
    } catch { /* transient; the next poll retries */ }
    setLoaded(true);
  }, [season]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => { // realtime push
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const ch = client.channel(`draft-${season}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drafts', filter: `season=eq.${season}` },
        payload => {
          const row = payload.new as LiveDraft & { league?: string; updated_at?: string };
          if (row && row.state && row.league === LEAGUE) setDraft(d => (!d || row.version >= d.version) ? { season: row.season, state: row.state, version: row.version } : d);
        })
      .subscribe();
    return () => { client.removeChannel(ch); };
  }, [season]);

  useEffect(() => { // polling fallback + refetch on focus
    const id = setInterval(() => { if (!document.hidden) refresh(); }, 3000);
    const onVis = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [refresh]);

  // ── actions ──
  const act = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    try {
      const body: Record<string, unknown> = { action, version: draft?.version, ...extra };
      if (commishKey) body.key = commishKey;
      const res = await fetch(`/api/live-draft/${season}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const j = await res.json();
      if (j.draft !== undefined && j.draft !== null) setDraft(j.draft);
      if (!res.ok && j.error && j.error !== 'stale') {
        setNotice(j.error);
        if (noticeTimer.current) clearTimeout(noticeTimer.current);
        noticeTimer.current = window.setTimeout(() => setNotice(''), 3500);
      }
    } catch { setNotice('connection problem — retrying'); }
  }, [season, draft?.version, commishKey]);

  const isCommish = role?.kind === 'commish';

  useEffect(() => { // the commissioner's device auto-creates the draft row
    if (commishKey && configured && loaded && !draft && !createdOnce.current) {
      createdOnce.current = true;
      act('create');
    }
  }, [commishKey, configured, loaded, draft, act]);

  // ── derived state ──
  const s = draft?.state;
  const teams = useMemo(() => s?.teams ?? [], [s]);
  const cast = useMemo(() => s?.cast ?? [], [s]);
  const picks = useMemo(() => s?.picks ?? [], [s]);
  const order = useMemo(() => s?.order ?? [], [s]);
  const phase = s?.phase ?? 'setup';
  const rounds = s?.rounds ?? 0;
  const clockSecs = s?.clockSecs ?? 45;
  const maxRounds = teams.length ? Math.floor(cast.length / teams.length) : 0;
  const totalPicks = rounds * teams.length;
  const overall = picks.length;
  const currentRound = teams.length ? Math.floor(overall / teams.length) + 1 : 0;
  const paused = phase === 'drafting' && !s?.deadline;

  const onClockTeam = useMemo(() => {
    if (phase !== 'drafting' || overall >= totalPicks || !teams.length) return -1;
    const round = Math.floor(overall / teams.length);
    const pos = overall % teams.length;
    const roundOrder = round % 2 === 0 ? order : [...order].reverse();
    return roundOrder[pos];
  }, [phase, overall, totalPicks, teams.length, order]);

  const draftedNames = useMemo(() => new Set(picks.map(p => p.contestant)), [picks]);
  const available = useMemo(() => cast.filter(c => !draftedNames.has(c)), [cast, draftedNames]);

  const myTeamIndex = role?.kind === 'team' ? role.index : role?.kind === 'commish' ? (role.teamIndex ?? -1) : -1;
  const myTurn = phase === 'drafting' && !paused && (myTeamIndex === onClockTeam || isCommish);

  // overall index of this device's team's next pick (-1 = none left)
  const myNextPick = useMemo(() => {
    if (phase !== 'drafting' || myTeamIndex < 0 || !teams.length) return -1;
    for (let i = overall; i < totalPicks; i++) {
      const round = Math.floor(i / teams.length);
      const pos = i % teams.length;
      const ro = round % 2 === 0 ? order : [...order].reverse();
      if (ro[pos] === myTeamIndex) return i;
    }
    return -1;
  }, [phase, myTeamIndex, teams.length, overall, totalPicks, order]);

  // shared clock: everyone computes from the same stored deadline
  const secondsLeft = useMemo(() => {
    if (phase !== 'drafting') return clockSecs;
    if (!s?.deadline) return s?.pausedRemaining ?? clockSecs;
    return Math.max(0, Math.ceil((new Date(s.deadline).getTime() - now) / 1000));
  }, [phase, s?.deadline, s?.pausedRemaining, clockSecs, now]);

  // the server pads each deadline with a few "announcement" seconds; hold the
  // displayed clock at full until that lead has run down, so nobody loses time
  // to the splash screens
  const displaySecs = Math.min(secondsLeft, clockSecs);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 300);
    return () => clearInterval(id);
  }, []);

  // ── sound ──
  function beep(freq: number, dur = 0.12, type: OscillatorType = 'sine', vol = 0.18) {
    if (muted) return;
    try {
      const ac = audioRef.current ?? (audioRef.current = new (window.AudioContext || (window as any).webkitAudioContext)());
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.value = freq; g.gain.value = vol;
      o.connect(g); g.connect(ac.destination);
      o.start(); o.stop(ac.currentTime + dur);
      g.gain.setValueAtTime(vol, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    } catch { /* ignore */ }
  }
  const pickDing = () => { beep(660, 0.1); setTimeout(() => beep(990, 0.16), 90); };
  const tick = () => beep(440, 0.05, 'square', 0.1);
  const buzzer = () => { beep(200, 0.5, 'sawtooth', 0.2); };
  const fanfare = () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.22, 'triangle', 0.2), i * 140)); };

  useEffect(() => { // countdown ticks + buzzer, from the shared clock
    if (phase !== 'drafting' || paused) { prevSecs.current = displaySecs; return; }
    const prev = prevSecs.current;
    if (prev !== null && displaySecs < prev) {
      if (displaySecs > 0 && displaySecs <= 10) tick();
      if (displaySecs === 0 && prev > 0) buzzer();
    }
    prevSecs.current = displaySecs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displaySecs, phase, paused]);

  useEffect(() => { // new pick arriving (from any device) → ding + splash
    const len = picks.length;
    if (prevPicksLen.current === null) { prevPicksLen.current = len; return; }
    if (len > prevPicksLen.current) {
      const last = picks[len - 1];
      setSplash(last);
      if (splashTimer.current) clearTimeout(splashTimer.current);
      splashTimer.current = window.setTimeout(() => setSplash(null), 2400);
      pickDing();
    }
    if (len < prevPicksLen.current) setSplash(null); // undo
    prevPicksLen.current = len;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picks]);

  useEffect(() => { // draft completion → confetti + fanfare on every device
    if (prevPhase.current === 'drafting' && phase === 'done') { launchConfetti(); fanfare(); }
    prevPhase.current = phase;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => { // "you're on the clock" splash, only on this team's device
    const clearTurn = () => { turnTimers.current.forEach(t => clearTimeout(t)); turnTimers.current = []; };
    clearTurn();
    if (phase === 'drafting' && myTeamIndex >= 0 && onClockTeam === myTeamIndex) {
      // keyed on `overall` too, so a snake double-pick announces the second turn as well
      const delay = overall > 0 ? 2600 : 400; // let the pick announcement finish first
      turnTimers.current.push(window.setTimeout(() => {
        setTurnSplash(true);
        beep(784, 0.12, 'triangle', 0.2); setTimeout(() => beep(1047, 0.2, 'triangle', 0.2), 120);
        turnTimers.current.push(window.setTimeout(() => setTurnSplash(false), 2200));
      }, delay));
    } else {
      setTurnSplash(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClockTeam, overall, phase, myTeamIndex]);

  // ── commissioner actions ──
  function rollOrder() {
    const idx = teams.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    beep(523, 0.08); setTimeout(() => beep(784, 0.12), 80);
    act('configure', { settings: { order: idx } });
  }
  function resetDraft() {
    if (!confirm('Reset the entire draft for everyone? This clears all picks and the order.')) return;
    act('reset');
  }

  // ── confetti ──
  function launchConfetti() {
    const c = confettiRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    c.width = window.innerWidth; c.height = window.innerHeight;
    const colors = ['#f59e0b', '#fb7185', '#2dd4bf', '#a78bfa', '#fcd34d'];
    const parts = Array.from({ length: 160 }, () => ({
      x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.4,
      r: 4 + Math.random() * 6, c: colors[Math.floor(Math.random() * colors.length)],
      vy: 2 + Math.random() * 4, vx: -2 + Math.random() * 4, rot: Math.random() * 6,
    }));
    const start = Date.now();
    (function frame() {
      const t = Date.now() - start;
      ctx.clearRect(0, 0, c.width, c.height);
      parts.forEach(p => {
        p.y += p.vy; p.x += p.vx; p.rot += 0.1;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r); ctx.restore();
      });
      if (t < 3500) requestAnimationFrame(frame); else ctx.clearRect(0, 0, c.width, c.height);
    })();
  }

  // ── exports ──
  const contestantsExport = useMemo(
    () => picks.map(p => `${p.contestant}\t${teams[p.teamIndex]}`).join('\n'),
    [picks, teams]);
  const draftBoardExport = useMemo(() => {
    if (!teams.length) return '';
    const head = order.map(ti => teams[ti]).join('\t');
    const lines = [head];
    for (let r = 0; r < rounds; r++) {
      const cells = order.map(ti => {
        const pk = picks.find(p => p.round === r + 1 && p.teamIndex === ti);
        return pk ? pk.contestant : '';
      });
      lines.push(cells.join('\t'));
    }
    return lines.join('\n');
  }, [picks, order, teams, rounds]);

  // ── render ──
  if (!configured) return <Shell><div className="msg err">The live draft backend isn’t configured yet — the commissioner needs to set the Supabase service key in Vercel.</div></Shell>;
  if (error) return <Shell><div className="msg err">Couldn’t load the draft: {error}</div></Shell>;
  if (!loaded) return <Shell><div className="msg">Loading draft…</div></Shell>;

  // lobby: pick who you are
  if (!role) {
    return (
      <Shell sub="Live Snake Draft">
        <div className="panel center">
          <h2>{commishKey ? 'Commissioner — pick your team' : 'Pick your team'}</h2>
          {commishKey ? (
            <p className="dim">You’ll draft like everyone else when your team is on the clock, with commissioner controls on top.</p>
          ) : draft ? (
            <p className="dim">Your team drafts from this device when it’s on the clock.</p>
          ) : (
            <p className="dim">The commissioner hasn’t opened this draft yet. You can still pick your team and wait here.</p>
          )}
          <div className="lobby">
            {teams.map((t, i) => (
              <button key={t} className="btn lobbybtn"
                onClick={() => chooseRole(commishKey ? { kind: 'commish', teamIndex: i } : { kind: 'team', index: i })}>
                <span className="dot lg" style={{ background: colorFor(t, i) }} />{t}
              </button>
            ))}
            {commishKey
              ? <button className="btn ghost" onClick={() => chooseRole({ kind: 'commish', teamIndex: null })}>🎛 No team — just commissioner</button>
              : <button className="btn ghost" onClick={() => chooseRole({ kind: 'watch' })}>👀 Just watching</button>}
          </div>
          {!teams.length && <p className="dim small">Waiting for the draft to be created to show the teams…</p>}
        </div>
      </Shell>
    );
  }

  const roleLabel = role.kind === 'commish'
    ? (role.teamIndex != null
        ? <>🎛 <span className="dot" style={{ background: colorFor(teams[role.teamIndex] ?? '', role.teamIndex) }} /> {teams[role.teamIndex] ?? 'Commissioner'}</>
        : <>🎛 Commissioner</>)
    : role.kind === 'watch' ? <>👀 Watching</>
    : <><span className="dot" style={{ background: colorFor(teams[role.index] ?? '', role.index) }} /> {teams[role.index] ?? 'Team'}</>;

  return (
    <Shell sub={`Live Snake Draft · ${clockSecs}s clock`}>
      <canvas ref={confettiRef} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 100 }} />

      {splash && (
        <div className="splash" key={splash.overall}>
          <div className="splashcard" style={{ borderColor: colorFor(teams[splash.teamIndex], splash.teamIndex) }}>
            <div className="sp-label">Round {splash.round} · Pick {splash.overall + 1}</div>
            <div className="sp-team" style={{ color: colorFor(teams[splash.teamIndex], splash.teamIndex) }}>{teams[splash.teamIndex]}</div>
            <div className="sp-name">{splash.contestant}</div>
          </div>
        </div>
      )}

      {turnSplash && !splash && (
        <div className="splash" key={`turn-${overall}`}>
          <div className="splashcard" style={{ borderColor: colorFor(teams[myTeamIndex] ?? '', myTeamIndex) }}>
            <div className="sp-label">Round {currentRound} · Pick {overall + 1}</div>
            <div className="sp-team" style={{ color: colorFor(teams[myTeamIndex] ?? '', myTeamIndex) }}>{teams[myTeamIndex]}</div>
            <div className="sp-name">You’re on the clock!</div>
          </div>
        </div>
      )}

      {/* who am I + controls */}
      <div className="bar">
        <span className="rolebadge">{roleLabel}</span>
        <button className="btn ghost tiny2" onClick={() => chooseRole(null)}>switch</button>
        <button className="btn ghost" onClick={() => setMuted(m => !m)}>{muted ? '🔇 Muted' : '🔊 Sound'}</button>
        {isCommish && phase !== 'setup' && (
          <>
            <button className="btn ghost" onClick={() => act('undo')} disabled={!picks.length}>↩ Undo pick</button>
            {phase === 'drafting' && (
              paused
                ? <button className="btn ghost" onClick={() => act('resume')}>▶ Resume</button>
                : <button className="btn ghost" onClick={() => act('pause')}>⏸ Pause</button>
            )}
            <button className="btn ghost danger" onClick={resetDraft}>Reset draft</button>
          </>
        )}
      </div>

      {notice && <div className="noticebar">{notice}</div>}

      {phase === 'drafting' && myTeamIndex >= 0 && onClockTeam !== myTeamIndex && (
        <div className="upnext">
          {myNextPick >= 0
            ? <>Your next pick: <b>{myNextPick - overall} pick{myNextPick - overall === 1 ? '' : 's'} away</b></>
            : <>All of {teams[myTeamIndex]}’s picks are in.</>}
        </div>
      )}

      {!draft && (
        <div className="panel center">
          <h2>Waiting for the commissioner</h2>
          <p className="dim">The draft opens as soon as the commissioner sets it up. This page updates by itself.</p>
        </div>
      )}

      {draft && phase === 'setup' && (
        <div className="panel center">
          <h2>Draft Order</h2>
          {!order.length
            ? <p className="dim">{isCommish ? 'Randomize the order to begin. Snake format — last in round 1 picks first in round 2.' : 'Waiting for the commissioner to set the order and start the draft…'}</p>
            : (
              <ol className="orderlist">
                {order.map((ti, i) => (
                  <li key={ti}><span className="ord">{i + 1}</span>
                    <span className="dot" style={{ background: colorFor(teams[ti], ti) }} />{teams[ti]}</li>
                ))}
              </ol>
            )}
          {isCommish && (
            <>
              <div className="rounds">
                <span className="dim">Picks per team:</span>
                <button className="step" onClick={() => act('configure', { settings: { rounds: Math.max(1, rounds - 1) } })} disabled={rounds <= 1}>−</button>
                <b>{rounds}</b>
                <button className="step" onClick={() => act('configure', { settings: { rounds: Math.min(maxRounds, rounds + 1) } })} disabled={rounds >= maxRounds}>+</button>
              </div>
              <div className="rounds">
                <span className="dim">Pick clock:</span>
                <button className="step" onClick={() => act('configure', { settings: { clockSecs: Math.max(15, clockSecs - 15) } })} disabled={clockSecs <= 15}>−</button>
                <b>{clockSecs}s</b>
                <button className="step" onClick={() => act('configure', { settings: { clockSecs: Math.min(180, clockSecs + 15) } })} disabled={clockSecs >= 180}>+</button>
              </div>
            </>
          )}
          <p className="dim small">
            {cast.length} contestants · {teams.length} teams · {totalPicks} of {cast.length} drafted
            {totalPicks < cast.length ? ` · ${cast.length - totalPicks} left undrafted` : ''}
          </p>
          {isCommish && (
            <div className="row">
              <button className="btn" onClick={rollOrder}>🎲 {order.length ? 'Re-roll' : 'Generate'} order</button>
              {order.length > 0 && <button className="btn primary" onClick={() => act('start')}>Start draft →</button>}
            </div>
          )}
        </div>
      )}

      {phase === 'drafting' && onClockTeam >= 0 && (
        <div className="panel clockpanel" style={{ borderColor: colorFor(teams[onClockTeam], onClockTeam) }}>
          <div className="onclock">
            <div className="oc-label">Round {currentRound} · Pick {overall + 1} of {totalPicks}{paused ? ' · PAUSED' : ''}</div>
            <div className="oc-team" style={{ color: colorFor(teams[onClockTeam], onClockTeam) }}>
              <span className="dot lg" style={{ background: colorFor(teams[onClockTeam], onClockTeam) }} />
              {teams[onClockTeam]} <span className="dim"> is on the clock</span>
            </div>
          </div>
          <div className={`clock ${!paused && displaySecs <= 10 ? 'warn' : ''} ${!paused && displaySecs === 0 ? 'zero' : ''}`}>
            {Math.floor(displaySecs / 60)}:{String(displaySecs % 60).padStart(2, '0')}
          </div>
        </div>
      )}

      {phase === 'done' && draft && (
        <div className="panel center">
          <h2>🏆 Draft complete!</h2>
          <p className="dim">All {totalPicks} picks are in. Copy the results into the sheet below, then set the season’s Status to <b>active</b>.</p>
        </div>
      )}

      {/* available contestants */}
      {phase === 'drafting' && (
        <div className="panel">
          <h2>Available ({available.length})</h2>
          {isCommish && onClockTeam >= 0 && onClockTeam !== myTeamIndex && <p className="dim small" style={{ marginTop: 0, marginBottom: 10 }}>Commissioner: tapping drafts for {teams[onClockTeam]}.</p>}
          {role.kind === 'team' && !myTurn && <p className="dim small" style={{ marginTop: 0, marginBottom: 10 }}>{paused ? 'Draft is paused.' : 'Buttons unlock when you’re on the clock.'}</p>}
          <div className="pool">
            {available.map(name => (
              <button key={name} className={`pick ${myTurn ? '' : 'inactive'}`} disabled={!myTurn}
                onClick={() => act('pick', { teamIndex: role.kind === 'team' ? role.index : onClockTeam, contestant: name })}
                style={{ borderColor: colorFor(teams[onClockTeam] || '', onClockTeam) }}>
                <span>{name}</span>{myTurn && <span className="draftbtn">Draft +</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* draft board grid */}
      {draft && phase !== 'setup' && order.length > 0 && (
        <div className="panel">
          <h2>Draft Board</h2>
          <div className="boardwrap">
            <table className="board">
              <thead><tr><th></th>{order.map((ti) => (
                <th key={ti}><span className="dot" style={{ background: colorFor(teams[ti], ti) }} />{teams[ti]}</th>
              ))}</tr></thead>
              <tbody>
                {Array.from({ length: rounds }, (_, r) => {
                  const reversed = r % 2 === 1;
                  return (
                    <tr key={r}>
                      <td className="rnd">R{r + 1} {reversed ? '←' : '→'}</td>
                      {order.map((ti) => {
                        const pk = picks.find(p => p.round === r + 1 && p.teamIndex === ti);
                        const isCurrent = phase === 'drafting' && onClockTeam === ti && currentRound === r + 1;
                        return (
                          <td key={ti} className={isCurrent ? 'cell now' : 'cell'}
                            style={{
                              borderColor: pk ? colorFor(teams[ti], ti) : undefined,
                              outlineColor: isCurrent ? colorFor(teams[ti], ti) : undefined,
                            }}>
                            {pk ? pk.contestant : (isCurrent ? '⏳' : '')}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* rosters + export */}
      {phase === 'done' && draft && (
        <>
          <div className="panel">
            <h2>Final Rosters</h2>
            <div className="rosters">
              {order.map((ti) => (
                <div key={ti} className="rcard">
                  <h3><span className="dot" style={{ background: colorFor(teams[ti], ti) }} />{teams[ti]}</h3>
                  <ol>{picks.filter(p => p.teamIndex === ti).sort((a, b) => a.round - b.round)
                    .map(p => <li key={p.overall}>{p.contestant}</li>)}</ol>
                </div>
              ))}
            </div>
          </div>
          <ExportBlock title="Paste into your Contestants tab (over columns A–B)" text={contestantsExport} />
          <ExportBlock title="Paste into your Draft tab" text={draftBoardExport} />
        </>
      )}
    </Shell>
  );
}

function ExportBlock({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="panel">
      <div className="exphead"><h2>{title}</h2>
        <button className="btn ghost tiny" onClick={() => {
          navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
        }}>{copied ? 'Copied ✓' : 'Copy'}</button>
      </div>
      <textarea className="export" readOnly value={text} rows={Math.min(8, text.split('\n').length + 1)} />
    </div>
  );
}

function Shell({ children, title, sub }: { children: React.ReactNode; title?: string; sub?: string }) {
  return (
    <div id="app">
      <div className="topnav"><a href="/">‹ All seasons</a></div>
      <div className="header">
        <div className="torch">🔥</div>
        <h1>{title ?? 'Draft Room'}</h1>
        <div className="sub">{sub ?? 'Live Snake Draft'}</div>
      </div>
      {children}
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
#app{max-width:1080px;margin:0 auto;padding:0 16px 80px}
.topnav{padding:14px 0 0}
.topnav a{color:#a8a29e;font-size:13px;font-weight:600;text-decoration:none}
.topnav a:hover{color:#f59e0b}
.header{text-align:center;padding:28px 0 10px}
.torch{font-size:38px}
.header h1{font-size:26px;font-weight:800;letter-spacing:-.02em;margin-top:6px;background:linear-gradient(90deg,#f59e0b,#f97316);-webkit-background-clip:text;background-clip:text;color:transparent}
.header .sub{color:#a8a29e;font-size:13px;margin-top:4px}
.msg{text-align:center;color:#a8a29e;padding:60px 0}.msg.err{color:#f87171}
.bar{display:flex;gap:8px;justify-content:center;align-items:center;flex-wrap:wrap;margin-bottom:14px}
.rolebadge{display:inline-flex;align-items:center;gap:7px;background:#262220;border:1px solid #2f2a27;border-radius:999px;padding:8px 14px;font-size:13px;font-weight:700}
.noticebar{text-align:center;background:#3a2a20;border:1px solid #7c5a2b;color:#fcd34d;border-radius:10px;padding:9px 14px;font-size:13px;font-weight:600;margin-bottom:14px}
.upnext{text-align:center;color:#a8a29e;font-size:13px;font-weight:600;margin:-2px 0 14px}
.lobby{display:grid;gap:10px;max-width:340px;margin:16px auto 0}
.lobbybtn{display:flex;align-items:center;justify-content:center;gap:10px;font-size:16px;padding:14px 18px}
.panel{background:#1c1917;border:1px solid #2f2a27;border-radius:16px;padding:20px;margin-bottom:16px}
.panel.center{text-align:center}
.panel h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#a8a29e;margin-bottom:14px;font-weight:700}
.dim{color:#a8a29e}.small{font-size:12px;margin-top:10px}
.btn{background:#262220;color:#fafaf9;border:1px solid #3a342f;border-radius:10px;padding:10px 18px;font-size:14px;font-weight:700;cursor:pointer}
.btn:hover{background:#2f2a27}.btn:disabled{opacity:.45;cursor:default}
.btn.primary{background:linear-gradient(90deg,#f59e0b,#f97316);color:#1c1917;border:none}
.btn.ghost{background:transparent}.btn.ghost.danger{color:#f87171;border-color:#5b2626}
.btn.tiny{padding:5px 10px;font-size:12px;margin-left:12px}
.btn.tiny2{padding:5px 10px;font-size:12px}
.row{display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap}
.rounds{display:flex;align-items:center;gap:12px;justify-content:center;margin-top:16px;font-size:16px;font-weight:800}
.rounds .step{width:34px;height:34px;border-radius:9px;background:#262220;border:1px solid #3a342f;color:#fafaf9;font-size:18px;font-weight:800;cursor:pointer}
.rounds .step:disabled{opacity:.4;cursor:default}
.orderlist{list-style:none;max-width:360px;margin:0 auto;display:grid;gap:8px}
.orderlist li{display:flex;align-items:center;gap:10px;background:#262220;border:1px solid #2f2a27;border-radius:12px;padding:11px 14px;font-weight:700}
.orderlist .ord{width:22px;color:#78716c}
.dot{width:11px;height:11px;border-radius:3px;display:inline-block;flex:none}.dot.lg{width:15px;height:15px;border-radius:4px}
.clockpanel{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;border-width:2px}
.oc-label{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#a8a29e;font-weight:700}
.oc-team{font-size:22px;font-weight:800;margin-top:4px;display:flex;align-items:center;gap:10px}
.clock{font-size:46px;font-weight:800;font-variant-numeric:tabular-nums;display:flex;align-items:center}
.clock.warn{color:#fbbf24}.clock.zero{color:#f87171;animation:flash .6s steps(2,start) infinite}
@keyframes flash{50%{opacity:.35}}
.pool{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px}
.pick{display:flex;align-items:center;justify-content:space-between;gap:8px;background:#262220;border:1px solid #2f2a27;border-left-width:4px;border-radius:10px;padding:11px 14px;font-size:15px;font-weight:600;color:#fafaf9;cursor:pointer;text-align:left}
.pick:hover{background:#322c28}
.pick.inactive{cursor:default;opacity:.6}.pick.inactive:hover{background:#262220}
.pick .draftbtn{font-size:12px;color:#a8a29e;font-weight:700;white-space:nowrap}
.pick:hover .draftbtn{color:#f59e0b}
.boardwrap{overflow-x:auto}
.board{border-collapse:collapse;width:100%;font-size:13px;min-width:560px}
.board th,.board td{border:1px solid #2f2a27;padding:8px 10px;text-align:left}
.board th{color:#cbd5e1;font-weight:700;font-size:12px;white-space:nowrap}
.board .rnd{color:#78716c;font-weight:700;white-space:nowrap}
.board .cell{border-left-width:3px}
.board .cell.now{background:#2a2520;outline:2px solid;outline-offset:-2px}
.splash{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:90;pointer-events:none;background:rgba(12,10,9,.72);animation:spfade 2.4s ease forwards}
.splashcard{background:#1c1917;border:3px solid #2f2a27;border-radius:20px;padding:28px 44px;text-align:center;max-width:90vw}
.sp-label{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#a8a29e;font-weight:700}
.sp-team{font-size:20px;font-weight:800;margin-top:8px}
.sp-name{font-size:34px;font-weight:800;margin-top:4px;overflow-wrap:anywhere}
@keyframes spfade{0%{opacity:0}8%{opacity:1}82%{opacity:1}100%{opacity:0}}
.rosters{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.rcard{background:#262220;border:1px solid #2f2a27;border-radius:14px;padding:14px}
.rcard h3{font-size:15px;display:flex;align-items:center;gap:8px;margin-bottom:8px}
.rcard ol{margin-left:18px;display:grid;gap:4px;font-size:14px}
.exphead{display:flex;align-items:center;justify-content:space-between}
.export{width:100%;background:#0c0a09;color:#d6d3d1;border:1px solid #2f2a27;border-radius:10px;padding:10px;font-family:ui-monospace,Menlo,monospace;font-size:12px;white-space:pre;margin-top:10px}
@media(max-width:560px){.clock{font-size:36px}.oc-team{font-size:18px}}
`;

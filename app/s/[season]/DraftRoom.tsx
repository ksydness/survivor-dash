'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { DraftData } from '@/lib/types';

// ── team colors (shared with the dashboard) ──
const PRESET: Record<string, string> = {
  'Kenny + Lena': '#fb7185', 'Tony + Karina': '#f59e0b',
  'Megan + Jake': '#2dd4bf', 'Will + Kathleen + Anna': '#a78bfa',
};
const FALLBACK = ['#fb7185', '#f59e0b', '#2dd4bf', '#a78bfa', '#60a5fa', '#f472b6'];
const colorFor = (t: string, i = 0) => PRESET[t] ?? FALLBACK[i % FALLBACK.length];

const PICK_SECONDS = 45;

interface Pick { overall: number; round: number; teamIndex: number; contestant: string; }
interface Persisted { order: number[]; picks: Pick[]; phase: 'setup' | 'drafting' | 'done'; }

export default function DraftRoom({ season }: { season: number }) {
  const [data, setData] = useState<DraftData | null>(null);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<'setup' | 'drafting' | 'done'>('setup');
  const [order, setOrder] = useState<number[]>([]);      // team indices, round-1 order
  const [picks, setPicks] = useState<Pick[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(PICK_SECONDS);
  const [running, setRunning] = useState(false);
  const [muted, setMuted] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const confettiRef = useRef<HTMLCanvasElement | null>(null);
  const loaded = useRef(false);

  const lsKey = `survivor-draft-s${season}`;

  // ── load draft data + any saved progress ──
  useEffect(() => {
    fetch(`/api/draft/${season}`)
      .then(r => r.json())
      .then((d: any) => {
        if (d.error) { setError(d.error); return; }
        setData(d);
      })
      .catch(e => setError(String(e)));
  }, [season]);

  useEffect(() => {
    if (!data || loaded.current) return;
    loaded.current = true;
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        const s: Persisted = JSON.parse(raw);
        setOrder(s.order || []); setPicks(s.picks || []); setPhase(s.phase || 'setup');
      }
    } catch { /* ignore */ }
  }, [data, lsKey]);

  // persist
  useEffect(() => {
    if (!loaded.current) return;
    try { localStorage.setItem(lsKey, JSON.stringify({ order, picks, phase } as Persisted)); } catch { /* ignore */ }
  }, [order, picks, phase, lsKey]);

  const teams = data?.teams ?? [];
  const cast = data?.cast ?? [];
  const picksPerTeam = teams.length ? Math.floor(cast.length / teams.length) : 0;
  const totalPicks = picksPerTeam * teams.length;
  const overall = picks.length;
  const onClockTeam = useMemo(() => {
    if (phase !== 'drafting' || overall >= totalPicks || !teams.length) return -1;
    const round = Math.floor(overall / teams.length);
    const pos = overall % teams.length;
    const roundOrder = round % 2 === 0 ? order : [...order].reverse();
    return roundOrder[pos];
  }, [phase, overall, totalPicks, teams.length, order]);
  const currentRound = teams.length ? Math.floor(overall / teams.length) + 1 : 0;

  const draftedNames = useMemo(() => new Set(picks.map(p => p.contestant)), [picks]);
  const available = useMemo(() => cast.filter(c => !draftedNames.has(c)), [cast, draftedNames]);

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

  // ── clock ──
  useEffect(() => { // reset clock whenever a new team is on the clock
    if (phase === 'drafting' && onClockTeam >= 0) { setSecondsLeft(PICK_SECONDS); setRunning(true); }
  }, [overall, phase, onClockTeam]);

  useEffect(() => {
    if (phase !== 'drafting' || !running || onClockTeam < 0) return;
    const id = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 0) return 0;
        const n = s - 1;
        if (n > 0 && n <= 10) tick();
        if (n === 0) buzzer();
        return n;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase, running, onClockTeam, muted]);

  // ── actions ──
  function shuffleOrder() {
    const idx = teams.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    setOrder(idx);
    beep(523, 0.08); setTimeout(() => beep(784, 0.12), 80);
  }
  function startDraft() { if (order.length) { setPhase('drafting'); setSecondsLeft(PICK_SECONDS); setRunning(true); } }
  function draft(name: string) {
    if (phase !== 'drafting' || onClockTeam < 0) return;
    const p: Pick = { overall, round: currentRound, teamIndex: onClockTeam, contestant: name };
    const next = [...picks, p];
    setPicks(next);
    pickDing();
    if (next.length >= totalPicks) { setPhase('done'); setRunning(false); launchConfetti(); fanfare(); }
  }
  function undo() { if (picks.length) { setPicks(picks.slice(0, -1)); if (phase === 'done') setPhase('drafting'); } }
  function resetDraft() {
    if (!confirm('Reset the entire draft? This clears all picks and the order.')) return;
    setPicks([]); setOrder([]); setPhase('setup'); setRunning(false);
    try { localStorage.removeItem(lsKey); } catch { /* ignore */ }
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
    for (let r = 0; r < picksPerTeam; r++) {
      const cells = order.map(ti => {
        const pk = picks.find(p => p.round === r + 1 && p.teamIndex === ti);
        return pk ? pk.contestant : '';
      });
      lines.push(cells.join('\t'));
    }
    return lines.join('\n');
  }, [picks, order, teams, picksPerTeam]);

  // ── render ──
  if (error) return <Shell><div className="msg err">Couldn’t load draft: {error}</div></Shell>;
  if (!data) return <Shell><div className="msg">Loading draft…</div></Shell>;
  if (!teams.length || !cast.length) return <Shell><div className="msg err">Missing teams or cast. Add the cast to your Contestants tab and the teams to the Seasons tab’s Teams column.</div></Shell>;

  return (
    <Shell title={`${data.meta.name} Draft`}>
      <canvas ref={confettiRef} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 100 }} />

      {/* control bar */}
      <div className="bar">
        <button className="btn ghost" onClick={() => setMuted(m => !m)}>{muted ? '🔇 Muted' : '🔊 Sound'}</button>
        {phase !== 'setup' && <button className="btn ghost" onClick={undo} disabled={!picks.length}>↩ Undo pick</button>}
        {phase !== 'setup' && <button className="btn ghost danger" onClick={resetDraft}>Reset draft</button>}
      </div>

      {phase === 'setup' && (
        <div className="panel center">
          <h2>Draft Order</h2>
          {!order.length
            ? <p className="dim">Randomize the order to begin. Snake format — last in round 1 picks first in round 2.</p>
            : (
              <ol className="orderlist">
                {order.map((ti, i) => (
                  <li key={ti}><span className="ord">{i + 1}</span>
                    <span className="dot" style={{ background: colorFor(teams[ti], ti) }} />{teams[ti]}</li>
                ))}
              </ol>
            )}
          <div className="row">
            <button className="btn" onClick={shuffleOrder}>🎲 {order.length ? 'Re-roll' : 'Generate'} order</button>
            {order.length > 0 && <button className="btn primary" onClick={startDraft}>Start draft →</button>}
          </div>
          <p className="dim small">{cast.length} contestants · {teams.length} teams · {picksPerTeam} rounds</p>
        </div>
      )}

      {phase === 'drafting' && onClockTeam >= 0 && (
        <div className="panel clockpanel" style={{ borderColor: colorFor(teams[onClockTeam], onClockTeam) }}>
          <div className="onclock">
            <div className="oc-label">Round {currentRound} · Pick {overall + 1} of {totalPicks}</div>
            <div className="oc-team" style={{ color: colorFor(teams[onClockTeam], onClockTeam) }}>
              <span className="dot lg" style={{ background: colorFor(teams[onClockTeam], onClockTeam) }} />
              {teams[onClockTeam]} <span className="dim"> is on the clock</span>
            </div>
          </div>
          <div className={`clock ${secondsLeft <= 10 ? 'warn' : ''} ${secondsLeft === 0 ? 'zero' : ''}`}>
            0:{String(secondsLeft).padStart(2, '0')}
            <button className="btn ghost tiny" onClick={() => setRunning(r => !r)}>{running ? 'Pause' : 'Resume'}</button>
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="panel center">
          <h2>🏆 Draft complete!</h2>
          <p className="dim">All {totalPicks} picks are in. Copy the results into your sheet below, then set the season’s Status to <b>active</b>.</p>
        </div>
      )}

      {/* available contestants */}
      {phase === 'drafting' && (
        <div className="panel">
          <h2>Available ({available.length})</h2>
          <div className="pool">
            {available.map(name => (
              <button key={name} className="pick" onClick={() => draft(name)}
                style={{ borderColor: colorFor(teams[onClockTeam] || '', onClockTeam) }}>
                <span>{name}</span><span className="draftbtn">Draft +</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* draft board grid */}
      {phase !== 'setup' && order.length > 0 && (
        <div className="panel">
          <h2>Draft Board</h2>
          <div className="boardwrap">
            <table className="board">
              <thead><tr><th></th>{order.map((ti) => (
                <th key={ti}><span className="dot" style={{ background: colorFor(teams[ti], ti) }} />{teams[ti]}</th>
              ))}</tr></thead>
              <tbody>
                {Array.from({ length: picksPerTeam }, (_, r) => {
                  const reversed = r % 2 === 1;
                  const cols = reversed ? [...order].reverse() : order;
                  return (
                    <tr key={r}>
                      <td className="rnd">R{r + 1} {reversed ? '←' : '→'}</td>
                      {cols.map((ti) => {
                        const pk = picks.find(p => p.round === r + 1 && p.teamIndex === ti);
                        const isCurrent = phase === 'drafting' && onClockTeam === ti && currentRound === r + 1;
                        return (
                          <td key={ti} className={isCurrent ? 'cell now' : 'cell'}
                            style={{ borderColor: pk ? colorFor(teams[ti], ti) : undefined }}>
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
      {phase === 'done' && (
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

function Shell({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <div id="app">
      <div className="header">
        <div className="torch">🔥</div>
        <h1>{title ?? 'Draft Room'}</h1>
        <div className="sub">Snake Draft · 45s clock</div>
      </div>
      {children}
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
#app{max-width:1080px;margin:0 auto;padding:0 16px 80px}
.header{text-align:center;padding:28px 0 10px}
.torch{font-size:38px}
.header h1{font-size:26px;font-weight:800;letter-spacing:-.02em;margin-top:6px;background:linear-gradient(90deg,#f59e0b,#f97316);-webkit-background-clip:text;background-clip:text;color:transparent}
.header .sub{color:#a8a29e;font-size:13px;margin-top:4px}
.msg{text-align:center;color:#a8a29e;padding:60px 0}.msg.err{color:#f87171}
.bar{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:14px}
.panel{background:#1c1917;border:1px solid #2f2a27;border-radius:16px;padding:20px;margin-bottom:16px}
.panel.center{text-align:center}
.panel h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#a8a29e;margin-bottom:14px;font-weight:700}
.dim{color:#a8a29e}.small{font-size:12px;margin-top:10px}
.btn{background:#262220;color:#fafaf9;border:1px solid #3a342f;border-radius:10px;padding:10px 18px;font-size:14px;font-weight:700;cursor:pointer}
.btn:hover{background:#2f2a27}.btn:disabled{opacity:.45;cursor:default}
.btn.primary{background:linear-gradient(90deg,#f59e0b,#f97316);color:#1c1917;border:none}
.btn.ghost{background:transparent}.btn.ghost.danger{color:#f87171;border-color:#5b2626}
.btn.tiny{padding:5px 10px;font-size:12px;margin-left:12px}
.row{display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap}
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
.pick .draftbtn{font-size:12px;color:#a8a29e;font-weight:700;white-space:nowrap}
.pick:hover .draftbtn{color:#f59e0b}
.boardwrap{overflow-x:auto}
.board{border-collapse:collapse;width:100%;font-size:13px;min-width:560px}
.board th,.board td{border:1px solid #2f2a27;padding:8px 10px;text-align:left}
.board th{color:#cbd5e1;font-weight:700;font-size:12px;white-space:nowrap}
.board .rnd{color:#78716c;font-weight:700;white-space:nowrap}
.board .cell{border-left-width:3px}
.board .cell.now{background:#2a2520;outline:2px solid #f59e0b;outline-offset:-2px}
.rosters{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.rcard{background:#262220;border:1px solid #2f2a27;border-radius:14px;padding:14px}
.rcard h3{font-size:15px;display:flex;align-items:center;gap:8px;margin-bottom:8px}
.rcard ol{margin-left:18px;display:grid;gap:4px;font-size:14px}
.exphead{display:flex;align-items:center;justify-content:space-between}
.export{width:100%;background:#0c0a09;color:#d6d3d1;border:1px solid #2f2a27;border-radius:10px;padding:10px;font-family:ui-monospace,Menlo,monospace;font-size:12px;white-space:pre;margin-top:10px}
@media(max-width:560px){.clock{font-size:36px}.oc-team{font-size:18px}}
`;

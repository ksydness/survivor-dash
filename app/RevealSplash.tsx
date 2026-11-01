'use client';

// The spoiler shield's reveal (homepage + dashboard), built to be played on the TV between episodes:
//   1. "Reading the votes…" beat (tap to skip)
//   2. the board as it stood going in (last week's order and totals, "+0" on every row)
//   3. each team's points for the week count up — paced by points (~0.11s a point, slowing at the end,
//      capped at 4s) because a normal week is only ~20 points — and rows overtake each other live
//   4. the board locks: leader glows, the week's headline drops in, then who went out / top scorer /
//      top team underneath
// A night with more hidden weeks chains: "Reveal Week N" replays the count from where the last one landed.
// onStep fires as each week lands (the page writes the cookie then, so stopping after one week keeps the
// next hidden). Replay mode plays an already-revealed week again and writes nothing.
// Nothing is computed from scores here — before/after are the same standings() the pages already show.
// Styles are self-contained (the homepage and dashboard scope theirs separately).
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as RMouseEvent } from 'react';
import type { RevealInfo } from './s/[season]/dash/spoiler';
import { shortName } from '@/lib/teamNames';
import { hit, setSoundOn, soundOn, tick, unlockRevealSound, whoosh } from '@/lib/revealSound';

const CSS = `
.rvl{position:fixed;inset:0;z-index:100;display:flex;overflow-y:auto;padding:max(20px,env(safe-area-inset-top)) 16px max(20px,env(safe-area-inset-bottom));
  --rh:66px;--gap:8px;
  background:radial-gradient(circle at 50% 30%,rgba(245,158,11,.18),rgba(12,10,9,0) 60%),#0c0a09;color:#fafaf9;text-align:center;
  animation:rvin .25s ease-out;-webkit-tap-highlight-color:transparent}
@keyframes rvin{from{opacity:0}to{opacity:1}}
.rvl .rv-box{margin:auto;width:100%;max-width:440px;display:flex;flex-direction:column;align-items:center}
.rvl .rv-mute{position:fixed;top:max(12px,env(safe-area-inset-top));right:12px;z-index:2;width:44px;height:44px;border:1px solid #2f2a27;border-radius:999px;background:#1c1917;color:#fafaf9;font-size:20px;line-height:1;cursor:pointer}
.rvl .rv-mute:focus-visible{outline:2px solid #fcd34d;outline-offset:2px}
.rvl .rv-torch{font-size:84px;line-height:1;animation:rvflick 1.1s ease-in-out infinite;filter:drop-shadow(0 0 22px rgba(249,115,22,.55))}
@keyframes rvflick{0%,100%{transform:scale(1) rotate(-2deg)}25%{transform:scale(1.07) rotate(2deg)}50%{transform:scale(.96) rotate(-1deg)}75%{transform:scale(1.04) rotate(1deg)}}
.rvl .rv-wk{font-size:13px;letter-spacing:.14em;text-transform:uppercase;font-weight:800;color:#a8a29e}
.rvl .rv-big{margin:6px 0 0;font-size:44px;font-weight:900;letter-spacing:-.03em;background:linear-gradient(90deg,#f59e0b,#f97316);-webkit-background-clip:text;background-clip:text;color:transparent}
.rvl .rv-dots{margin:10px 0 0;font-size:15px;color:#d6d3d1}
.rvl i.rv-d{display:inline-block;animation:rvdot 1s infinite;font-style:normal}
.rvl i.rv-d:nth-of-type(2){animation-delay:.2s}.rvl i.rv-d:nth-of-type(3){animation-delay:.4s}
@keyframes rvdot{0%,100%{opacity:.2}50%{opacity:1}}

.rvl .rv-stage{width:100%;display:flex;flex-direction:column;align-items:center;animation:rvup .4s cubic-bezier(.2,.8,.2,1)}
@keyframes rvup{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
.rvl .rv-ttl{margin:6px 0 16px;min-height:2.5em;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:900;line-height:1.2;letter-spacing:-.02em}
.rvl .rv-ttl.rv-wait{font-size:17px;font-weight:700;color:#a8a29e}
.rvl .rv-ttl.rv-on{animation:rvdrop .55s cubic-bezier(.2,1.3,.4,1)}
@keyframes rvdrop{from{opacity:0;transform:translateY(-14px) scale(.94)}to{opacity:1;transform:none}}

.rvl .rv-board{position:relative;width:100%}
.rvl .rv-row{position:absolute;left:0;right:0;top:0;height:var(--rh);display:flex;align-items:center;gap:calc(var(--rh)*.16);padding:0 calc(var(--rh)*.26) 0 calc(var(--rh)*.14);
  border-radius:calc(var(--rh)*.22);background:#1c1917;border:1px solid #2f2a27;box-shadow:inset 5px 0 0 var(--c);text-align:left;
  transition:transform .6s cubic-bezier(.2,.8,.2,1),border-color .3s,box-shadow .3s}
.rvl .rv-rk{flex:none;width:calc(var(--rh)*.56);display:flex;flex-direction:column;align-items:center;line-height:1}
.rvl .rv-rk b{font-size:calc(var(--rh)*.36);font-weight:900;font-variant-numeric:tabular-nums;white-space:nowrap}
.rvl .rv-rk b.tie{font-size:calc(var(--rh)*.26)}
.rvl .rv-rk i{margin-top:3px;font-style:normal;font-size:calc(var(--rh)*.19);font-weight:800;animation:rvin .3s}
.rvl .rv-rk i.up{color:#4ade80}.rvl .rv-rk i.down{color:#f87171}
.rvl .rv-who{flex:1;min-width:0;display:flex;flex-direction:column;gap:calc(var(--rh)*.04)}
.rvl .rv-nm{display:flex;align-items:center;gap:calc(var(--rh)*.12);font-size:calc(var(--rh)*.26);font-weight:800;line-height:1.15;white-space:nowrap}
.rvl .rv-nm span:not(.rv-dot){overflow:hidden;text-overflow:ellipsis}
.rvl .rv-dot{flex:none;width:calc(var(--rh)*.16);height:calc(var(--rh)*.16);border-radius:999px;background:var(--c)}
.rvl .rv-full{display:none}
.rvl .rv-tot{font-size:calc(var(--rh)*.22);font-weight:700;color:#a8a29e;font-variant-numeric:tabular-nums;line-height:1.1}
.rvl .rv-tot b{color:#e7e5e4;font-weight:800}
.rvl .rv-gain{flex:none;font-size:calc(var(--rh)*.44);font-weight:900;font-variant-numeric:tabular-nums;color:var(--c);letter-spacing:-.02em;transition:color .3s}
.rvl .rv-gain.zero{color:#57534e}
.rvl .rv-gain.neg{color:#f87171}
.rvl .rv-row.rv-lead{border-color:#fcd34d;box-shadow:inset 5px 0 0 var(--c),0 0 0 1px #fcd34d,0 0 calc(var(--rh)*.55) rgba(252,211,77,.32);animation:rvlead .9s ease-out}
@keyframes rvlead{0%{filter:brightness(1)}30%{filter:brightness(1.35)}100%{filter:brightness(1)}}

/* facts + buttons are laid out from the start (hidden) so the board never jumps when they appear */
.rvl .rv-after{width:100%;visibility:hidden}
.rvl .rv-after.rv-show{visibility:visible}
.rvl .rv-facts{margin-top:16px;width:100%;display:flex;flex-direction:column;gap:6px}
.rvl .rv-fact{display:flex;align-items:baseline;gap:8px;padding:9px 12px;border-radius:12px;background:#1c1917;border:1px solid #2f2a27;font-size:14px;text-align:left;opacity:0}
.rvl .rv-fact small{flex:none;width:104px;white-space:nowrap;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#a8a29e;font-weight:700}
.rvl .rv-fact b{font-weight:700;overflow-wrap:anywhere}
.rvl .rv-fact.out{border-color:rgba(248,113,113,.35)}
.rvl .rv-btns{margin:18px auto 0;width:100%;display:flex;flex-direction:column;gap:8px;opacity:0}
.rvl .rv-show .rv-fact,.rvl .rv-show .rv-btns{animation:rvup .4s cubic-bezier(.2,.8,.2,1) forwards}
.rvl .rv-show .rv-fact:nth-child(1){animation-delay:.5s}.rvl .rv-show .rv-fact:nth-child(2){animation-delay:.65s}.rvl .rv-show .rv-fact:nth-child(3){animation-delay:.8s}
.rvl .rv-show .rv-btns{animation-delay:.9s}
.rvl .rv-go{width:100%;height:52px;border:0;border-radius:14px;background:linear-gradient(90deg,#f59e0b,#f97316);color:#1c1917;font:inherit;font-size:16px;font-weight:800;cursor:pointer}
.rvl .rv-later{width:100%;height:44px;border:1px solid #3a342f;border-radius:14px;background:transparent;color:#d6d3d1;font:inherit;font-size:15px;font-weight:700;cursor:pointer}
.rvl .rv-go:focus-visible,.rvl .rv-later:focus-visible{outline:2px solid #fcd34d;outline-offset:3px}

@media (max-height:640px){.rvl{--rh:58px;--gap:7px}.rvl .rv-ttl{margin-bottom:10px;font-size:21px}.rvl .rv-facts{margin-top:12px}}
/* TV / laptop / landscape: everything scales with the screen height */
@media (min-width:760px) and (min-aspect-ratio:4/3){
  .rvl{--rh:min(12vh,124px);--gap:min(1.5vh,14px)}
  .rvl .rv-box{max-width:min(1000px,92vw)}
  .rvl .rv-full{display:inline}.rvl .rv-short{display:none}
  .rvl .rv-ttl{font-size:clamp(22px,4.6vh,54px);margin-bottom:2.2vh}
  .rvl .rv-ttl.rv-wait{font-size:clamp(16px,2.8vh,30px)}
  .rvl .rv-wk{font-size:clamp(12px,1.9vh,20px)}
  .rvl .rv-torch{font-size:clamp(84px,16vh,180px)}
  .rvl .rv-big{font-size:clamp(44px,7.5vh,90px)}
  .rvl .rv-dots{font-size:clamp(15px,2.6vh,28px)}
  .rvl .rv-facts{flex-direction:row;flex-wrap:wrap;justify-content:center;gap:1vh 1.2vh;margin-top:2.2vh}
  .rvl .rv-fact{font-size:clamp(14px,2.1vh,24px);padding:1vh 1.6vh}
  .rvl .rv-fact small{width:auto;font-size:clamp(11px,1.5vh,16px)}
  .rvl .rv-btns{flex-direction:row;justify-content:center;max-width:640px;margin-top:2.4vh}
  .rvl .rv-go,.rvl .rv-later{height:clamp(48px,6.5vh,72px);font-size:clamp(15px,2.2vh,22px)}
}
@media (prefers-reduced-motion:reduce){.rvl,.rvl *{animation-duration:.01ms!important;animation-iteration-count:1!important;animation-delay:0s!important;transition:none!important}.rvl .rv-show .rv-fact,.rvl .rv-show .rv-btns{opacity:1}}
`;

/** the "Week N scores are in · Reveal" strip (homepage card + dashboard) */
export const SHIELD_CSS = `
.shieldbar{--sbg:#1c1917;display:flex;align-items:center;gap:12px;margin-top:10px;padding:12px 10px 12px 14px;border-radius:16px;color:#fafaf9;
  background:linear-gradient(var(--sbg),var(--sbg)) padding-box,linear-gradient(90deg,#f59e0b,#f97316) border-box;border:1.5px solid transparent}
.home .shieldbar{--sbg:#262220;margin-top:12px;border-radius:14px;padding-left:12px}
.shieldbar .sic{flex:none;font-size:26px;line-height:1;animation:sbflick 1.6s ease-in-out infinite}
@keyframes sbflick{0%,100%{transform:scale(1) rotate(-3deg)}50%{transform:scale(1.08) rotate(3deg)}}
.shieldbar .stx{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.shieldbar .stx b{font-size:16px;font-weight:800}
.shieldbar .stx span{font-size:13px;color:#a8a29e;line-height:1.35}
.shieldbar .sbtn{flex:none;height:40px;padding:0 16px;border:0;border-radius:999px;background:linear-gradient(90deg,#f59e0b,#f97316);color:#1c1917;font:inherit;font-size:14px;font-weight:800;cursor:pointer}
.shieldbar .sbtn:focus-visible{outline:2px solid #fcd34d;outline-offset:2px}
@media (prefers-reduced-motion:reduce){.shieldbar .sic{animation:none}}
`;

type Phase = 'votes' | 'board' | 'count' | 'settle';

const MS_PER_POINT = 110, MIN_MS = 700, MAX_MS = 4000;
/** how long a team's count runs: paced by points so a normal ~20-point week still takes ~2s */
export const countMs = (gain: number) => (gain === 0 ? 0 : Math.min(MAX_MS, Math.max(MIN_MS, Math.abs(gain) * MS_PER_POINT)));
const easeOut = (p: number) => 1 - (1 - p) * (1 - p);

const totalsOf = (rows: RevealInfo['after']) => Object.fromEntries(rows.map(r => [r.team, r.total])) as Record<string, number>;
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const fmtGain = (n: number) => (n < 0 ? `−${fmt(-n)}` : `+${fmt(n)}`);

export default function RevealSplash({ steps, onStep, onClose, replay = false }: {
  steps: RevealInfo[];                       // the week to reveal, then any later hidden weeks (chained)
  onStep?: (info: RevealInfo) => void;       // a week has landed (write the cookie)
  onClose: () => void;
  replay?: boolean;                          // replaying a revealed week: no cookie, says "Replay"
}) {
  const [si, setSi] = useState(0);
  const step = steps[Math.min(si, steps.length - 1)];
  const [phase, setPhase] = useState<Phase>('votes');
  const [vals, setVals] = useState<Record<string, number>>(() => totalsOf(steps[0].before));
  const [order, setOrder] = useState<string[]>(() => steps[0].before.map(r => r.team));
  const [sound, setSound] = useState(true);
  const landed = useRef(new Set<number>());
  const goBtn = useRef<HTMLButtonElement | null>(null);
  const reduce = useRef(false);

  const after = useMemo(() => new Map(step.after.map(r => [r.team, r])), [step]);
  const before = useMemo(() => totalsOf(step.before), [step]);
  const halves = useMemo(() => [...step.before, ...step.after].some(r => !Number.isInteger(r.total)), [step]);
  const show = (n: number) => (halves ? Math.round(n * 2) / 2 : Math.round(n));

  useEffect(() => {
    reduce.current = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setSound(soundOn());
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // 1 → 2: the beat, then the board as it stood going in
  useEffect(() => {
    if (phase !== 'votes') return;
    const t = setTimeout(() => setPhase('board'), reduce.current ? 300 : si === 0 ? 1700 : 1200);
    return () => clearTimeout(t);
  }, [phase, si]);

  // 2 → 3: hold the old board for a moment ("+0" everywhere), then start counting
  useEffect(() => {
    if (phase !== 'board') return;
    setVals(totalsOf(step.before));
    setOrder(step.before.map(r => r.team));
    whoosh();
    const t = setTimeout(() => setPhase('count'), reduce.current ? 0 : 1000);
    return () => clearTimeout(t);
  }, [phase, step]);

  // 3: count every team at once, each paced by its own points; rows overtake as they pass
  useEffect(() => {
    if (phase !== 'count') return;
    const teams = step.after.map(r => r.team);
    const gain = Object.fromEntries(teams.map(t => [t, (after.get(t)?.total ?? 0) - (before[t] ?? 0)]));
    const dur = Object.fromEntries(teams.map(t => [t, countMs(gain[t])]));
    const longest = Math.max(0, ...Object.values(dur));
    const finish = () => {
      setVals(totalsOf(step.after));
      return setTimeout(() => setPhase('settle'), reduce.current ? 0 : 450);
    };
    if (reduce.current || longest === 0) { const t = finish(); return () => clearTimeout(t); }

    let raf = 0, end: ReturnType<typeof setTimeout> | undefined, lastSum = NaN;
    let cur = step.before.map(r => r.team);
    const t0 = performance.now();
    const frame = (now: number) => {
      const el = now - t0;
      const next: Record<string, number> = {};
      teams.forEach(t => {
        const p = dur[t] ? Math.min(1, el / dur[t]) : 1;
        next[t] = (before[t] ?? 0) + gain[t] * easeOut(p);
      });
      setVals(next);
      // a tick whenever any counter moves to a new number
      const sum = teams.reduce((s, t) => s + show(next[t]), 0);
      if (sum !== lastSum && !Number.isNaN(lastSum)) tick(el / longest);
      lastSum = sum;
      // live order: by the numbers on screen; a tie keeps whoever was ahead
      const sorted = [...cur].sort((a, b) => show(next[b]) - show(next[a]) || cur.indexOf(a) - cur.indexOf(b));
      if (sorted.join('|') !== cur.join('|')) { cur = sorted; setOrder(sorted); }
      if (el < longest) raf = requestAnimationFrame(frame);
      else end = finish();
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); if (end) clearTimeout(end); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, step]);

  // 4: lock to the standings' order (ties as the standings list them), glow, headline; the week is now revealed
  useEffect(() => {
    if (phase !== 'settle') return;
    setOrder(step.after.map(r => r.team));
    hit();
    if (!landed.current.has(si)) { landed.current.add(si); onStep?.(step); }
    goBtn.current?.focus({ preventScroll: true });
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, si]);

  const next = !replay && si + 1 < steps.length ? steps[si + 1] : null;
  function goNext() {
    unlockRevealSound();
    setSi(si + 1);
    setPhase('votes');
  }
  function toggleSound(e: RMouseEvent) {
    e.stopPropagation();
    setSoundOn(!sound);
    setSound(!sound);
  }

  const settled = phase === 'settle';
  const teams = step.after.map(r => r.team);
  const n = teams.length;
  const shown = Object.fromEntries(teams.map(t => [t, show(vals[t] ?? before[t] ?? 0)]));
  const liveRank = (t: string) => 1 + teams.filter(x => shown[x] > shown[t]).length;
  const outLine = step.out.length ? step.out.join(', ') : null;

  return (
    <div className="rvl" role="dialog" aria-modal="true" aria-label={`Week ${step.week} ${replay ? 'replay' : 'reveal'}`}
      onClick={() => phase === 'votes' && setPhase('board')}>
      <style>{CSS}</style>
      <button type="button" className="rv-mute" aria-label={sound ? 'Sound on — tap to mute' : 'Sound off — tap to turn on'} aria-pressed={!sound} onClick={toggleSound}>{sound ? '🔊' : '🔇'}</button>
      <div className="rv-box">
        {phase === 'votes' ? (
          <div key={`v${si}`} className="rv-stage">
            <div className="rv-torch" aria-hidden>🔥</div>
            <div className="rv-wk" style={{ marginTop: 18 }}>Week {step.week}{replay ? ' · Replay' : ''}</div>
            <p className="rv-big">Scores are in</p>
            <p className="rv-dots" aria-live="polite">Reading the votes<i className="rv-d">.</i><i className="rv-d">.</i><i className="rv-d">.</i></p>
          </div>
        ) : (
          <div key={`b${si}`} className="rv-stage">
            <div className="rv-wk">Week {step.week}{replay ? ' · Replay' : ''}</div>
            {settled
              ? <p key="hl" className="rv-ttl rv-on" aria-live="polite">{step.headline}</p>
              : <p key="wait" className="rv-ttl rv-wait">Tallying the points<i className="rv-d">.</i><i className="rv-d">.</i><i className="rv-d">.</i></p>}

            <div className="rv-board" style={{ height: `calc(${n} * var(--rh) + ${Math.max(0, n - 1)} * var(--gap))` }} role="list" aria-label="Standings">
              {teams.map(t => {
                const a = after.get(t)!;
                const pos = Math.max(0, order.indexOf(t));
                const g = shown[t] - show(before[t] ?? 0);
                const rank = settled ? (a.tied ? `T-${a.rank}` : String(a.rank)) : String(liveRank(t));
                const mv = settled && a.move ? (a.move > 0 ? { c: 'up', t: `▲${a.move}` } : { c: 'down', t: `▼${-a.move}` }) : null;
                return (
                  <div key={t} role="listitem" className={`rv-row ${settled && a.rank === 1 ? 'rv-lead' : ''}`}
                    aria-label={settled ? `${t}, ${a.tied ? 'tied ' : ''}${a.rank === 1 ? '1st' : `rank ${a.rank}`}, ${fmt(a.total)} points, ${fmtGain(g)} this week` : undefined}
                    style={{ transform: `translateY(calc(${pos} * (var(--rh) + var(--gap))))`, '--c': a.color } as CSSProperties}>
                    <span className="rv-rk" aria-hidden><b className={rank.length > 2 ? 'tie' : undefined}>{rank}</b>{mv && <i className={mv.c}>{mv.t}</i>}</span>
                    <span className="rv-who" aria-hidden>
                      <span className="rv-nm"><span className="rv-dot" /><span className="rv-full">{t}</span><span className="rv-short">{shortName(t)}</span></span>
                      <span className="rv-tot"><b>{fmt(shown[t])}</b> pts</span>
                    </span>
                    <span className={`rv-gain ${g === 0 ? 'zero' : g < 0 ? 'neg' : ''}`} aria-hidden>{fmtGain(g)}</span>
                  </div>
                );
              })}
            </div>

            <div className={`rv-after ${settled ? 'rv-show' : ''}`} aria-hidden={!settled}>
              {(outLine || step.topScorer || step.topTeam) && (
                <div className="rv-facts">
                  {outLine && <div className="rv-fact out"><small>💨 Out</small><b>{outLine}</b></div>}
                  {step.topScorer && <div className="rv-fact"><small>⭐ Top scorer</small><b>{step.topScorer}</b></div>}
                  {step.topTeam && <div className="rv-fact"><small>🏆 Top team</small><b>{step.topTeam}</b></div>}
                </div>
              )}
              <div className="rv-btns">
                {next
                  ? <>
                    <button ref={goBtn} type="button" className="rv-go" disabled={!settled} onClick={goNext}>Reveal Week {next.week}</button>
                    <button type="button" className="rv-later" disabled={!settled} onClick={onClose}>Done for now</button>
                  </>
                  : <button ref={goBtn} type="button" className="rv-go" disabled={!settled} onClick={onClose}>Done</button>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

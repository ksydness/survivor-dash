'use client';

// The spoiler shield's reveal moment (homepage + dashboard): a short "reading the votes" beat, then
// the week's headline, who went out and the week's top scorer / team. Tap anywhere during the first
// beat to skip it. Styles are self-contained (the homepage and dashboard scope theirs separately).
import { useEffect, useRef, useState } from 'react';
import type { RevealInfo } from './s/[season]/dash/spoiler';

const CSS = `
.rvl{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:24px 16px;
  background:radial-gradient(circle at 50% 36%,rgba(245,158,11,.20),rgba(12,10,9,0) 60%),#0c0a09;color:#fafaf9;
  animation:rvlin .25s ease-out;-webkit-tap-highlight-color:transparent}
@keyframes rvlin{from{opacity:0}to{opacity:1}}
.rvl .box{width:100%;max-width:400px;display:flex;flex-direction:column;align-items:center;text-align:center}
.rvl .torch{font-size:84px;line-height:1;animation:rvlflick 1.1s ease-in-out infinite;filter:drop-shadow(0 0 22px rgba(249,115,22,.55))}
@keyframes rvlflick{0%,100%{transform:scale(1) rotate(-2deg)}25%{transform:scale(1.07) rotate(2deg)}50%{transform:scale(.96) rotate(-1deg)}75%{transform:scale(1.04) rotate(1deg)}}
.rvl .wk{margin-top:18px;font-size:13px;letter-spacing:.14em;text-transform:uppercase;font-weight:800;color:#a8a29e}
.rvl .big{margin:6px 0 0;font-size:44px;font-weight:900;letter-spacing:-.03em;background:linear-gradient(90deg,#f59e0b,#f97316);-webkit-background-clip:text;background-clip:text;color:transparent}
.rvl .dots{margin-top:10px;font-size:15px;color:#d6d3d1}
.rvl .dots i{display:inline-block;animation:rvldot 1s infinite;font-style:normal}
.rvl .dots i:nth-child(2){animation-delay:.2s}.rvl .dots i:nth-child(3){animation-delay:.4s}
@keyframes rvldot{0%,100%{opacity:.2}50%{opacity:1}}
.rvl .res{width:100%;animation:rvlup .45s cubic-bezier(.2,.8,.2,1)}
@keyframes rvlup{from{opacity:0;transform:translateY(18px) scale(.97)}to{opacity:1;transform:none}}
.rvl .hl{margin:8px 0 0;font-size:28px;font-weight:900;line-height:1.2;letter-spacing:-.02em}
.rvl .facts{margin-top:20px;display:flex;flex-direction:column;gap:8px;text-align:left}
.rvl .fact{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;background:#1c1917;border:1px solid #2f2a27;opacity:0;animation:rvlup .4s cubic-bezier(.2,.8,.2,1) forwards}
.rvl .fact:nth-child(1){animation-delay:.25s}.rvl .fact:nth-child(2){animation-delay:.5s}.rvl .fact:nth-child(3){animation-delay:.75s}
.rvl .fact .ic{flex:none;width:30px;text-align:center;font-size:22px}
.rvl .fact .t{display:flex;flex-direction:column;gap:2px;min-width:0}
.rvl .fact small{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#a8a29e;font-weight:700}
.rvl .fact b{font-size:15px;font-weight:700;overflow-wrap:anywhere}
.rvl .fact.out{border-color:rgba(248,113,113,.35)}
.rvl .go{margin-top:22px;width:100%;height:52px;border:0;border-radius:14px;background:linear-gradient(90deg,#f59e0b,#f97316);color:#1c1917;font:inherit;font-size:16px;font-weight:800;cursor:pointer}
.rvl .go:focus-visible{outline:2px solid #fcd34d;outline-offset:3px}
.rvl .more{margin-top:12px;font-size:13px;color:#a8a29e}
@media (prefers-reduced-motion:reduce){.rvl,.rvl *{animation-duration:.01ms!important;animation-iteration-count:1!important;animation-delay:0s!important}.rvl .fact{opacity:1}}
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

export default function RevealSplash({ info, onDone }: { info: RevealInfo; onDone: () => void }) {
  const [stage, setStage] = useState<'votes' | 'result'>('votes');
  const btn = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const t = setTimeout(() => setStage('result'), reduce ? 400 : 1700);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => { if (stage === 'result') btn.current?.focus({ preventScroll: true }); }, [stage]);
  // keep the page behind from scrolling while the splash is up
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const outLine = info.out.length ? info.out.join(', ') : null;
  return (
    <div className="rvl" role="dialog" aria-modal="true" aria-label={`Week ${info.week} reveal`}
      onClick={() => stage === 'votes' && setStage('result')}>
      <style>{CSS}</style>
      <div className="box">
        {stage === 'votes' ? (
          <>
            <div className="torch" aria-hidden>🔥</div>
            <div className="wk">Week {info.week}</div>
            <p className="big">Scores are in</p>
            <div className="dots" aria-live="polite">Reading the votes<i>.</i><i>.</i><i>.</i></div>
          </>
        ) : (
          <div className="res">
            <div className="wk">Week {info.week}</div>
            <p className="hl">{info.headline}</p>
            <div className="facts">
              {outLine && (
                <div className="fact out"><span className="ic" aria-hidden>💨</span>
                  <span className="t"><small>The tribe has spoken</small><b>{outLine}</b></span></div>
              )}
              {info.topScorer && (
                <div className="fact"><span className="ic" aria-hidden>⭐</span>
                  <span className="t"><small>Top scorer</small><b>{info.topScorer}</b></span></div>
              )}
              {info.topTeam && (
                <div className="fact"><span className="ic" aria-hidden>🏆</span>
                  <span className="t"><small>Top team</small><b>{info.topTeam}</b></span></div>
              )}
            </div>
            <button ref={btn} type="button" className="go" onClick={onDone}>See the standings</button>
            {info.more > 0 && <p className="more">{info.more === 1 ? '1 more week' : `${info.more} more weeks`} still hidden</p>}
          </div>
        )}
      </div>
    </div>
  );
}

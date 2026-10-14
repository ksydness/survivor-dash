'use client';

// Pull-to-refresh for the home-screen app. Saved to the home screen, the site runs in standalone
// mode, where neither iOS nor Android give you the browser's own pull-to-refresh — so we draw one.
// In a normal browser tab this does nothing (the browser's native gesture already works there).
//
// A page can take over what "refresh" means with usePullRefresh(fn): the dashboard re-syncs scores
// (same as its Refresh button). Anywhere else — homepage, scoring page, draft room — the page's server
// data is re-rendered with router.refresh(), which keeps client state (a draft in progress is untouched).

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

const EVENT = 'app:pull-refresh';
type Detail = { promise?: Promise<unknown> };

/** Let the current page handle pull-to-refresh itself. `fn` may return a promise; the spinner waits for it. */
export function usePullRefresh(fn: () => unknown) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const h = (e: Event) => { (e as CustomEvent<Detail>).detail.promise = Promise.resolve(ref.current()); };
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
  }, []);
}

const TRIGGER = 70;   // px of (damped) pull needed to refresh
const MAX = 110;      // furthest the indicator travels
const REST = 56;      // where it sits while refreshing

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

export default function PullToRefresh() {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const st = useRef({ active: false, x: 0, y: 0, pull: 0, busy: false });

  useEffect(() => {
    if (!isStandalone()) return;
    const s = st.current;

    const start = (e: TouchEvent) => {
      if (s.busy || e.touches.length !== 1 || window.scrollY > 0) return;
      s.active = true; s.pull = 0;
      s.x = e.touches[0].clientX; s.y = e.touches[0].clientY;
    };
    const move = (e: TouchEvent) => {
      if (!s.active) return;
      const dx = e.touches[0].clientX - s.x, dy = e.touches[0].clientY - s.y;
      // sideways swipes (tab row, draft board) and upward scrolls aren't pulls
      if (dy <= 0 || (s.pull === 0 && Math.abs(dx) > Math.abs(dy)) || window.scrollY > 0) {
        s.active = false; s.pull = 0; setPull(0);
        return;
      }
      s.pull = Math.min(MAX, dy * 0.5);
      setPull(s.pull);
    };
    const end = async () => {
      if (!s.active) return;
      s.active = false;
      if (s.pull < TRIGGER) { s.pull = 0; setPull(0); return; }
      s.busy = true; setBusy(true); setPull(REST);
      const detail: Detail = {};
      window.dispatchEvent(new CustomEvent(EVENT, { detail }));
      const work = detail.promise ?? Promise.resolve(router.refresh());
      try {
        await Promise.all([work, new Promise(r => setTimeout(r, 600))]);  // long enough to see it happen
      } catch { /* the page shows its own errors */ }
      s.busy = false; s.pull = 0; setBusy(false); setPull(0);
    };

    window.addEventListener('touchstart', start, { passive: true });
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
    return () => {
      window.removeEventListener('touchstart', start);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end);
      window.removeEventListener('touchcancel', end);
    };
  }, [router]);

  if (!pull && !busy) return null;
  const ready = pull >= TRIGGER;
  return (
    <div aria-hidden style={{
      position: 'fixed', left: '50%', top: 'env(safe-area-inset-top, 0px)', zIndex: 300, pointerEvents: 'none',
      transform: `translate(-50%, ${pull - 44}px)`, transition: busy || !pull ? 'transform .2s ease' : 'none',
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 999, background: '#1c1917', border: '1px solid #3a342f',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: ready || busy ? '#fafaf9' : '#a8a29e',
        boxShadow: '0 4px 14px rgba(0,0,0,.45)', opacity: busy ? 1 : Math.min(1, pull / TRIGGER),
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: busy ? undefined : `rotate(${(pull / TRIGGER) * 270}deg)`, animation: busy ? 'ptrspin .8s linear infinite' : undefined }}>
          <path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" />
        </svg>
      </div>
      <style>{'@keyframes ptrspin{to{transform:rotate(360deg)}}'}</style>
    </div>
  );
}

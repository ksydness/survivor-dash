'use client';

// 🔔 button: subscribe this device to weekly score notifications (Web Push).
// iPhone only supports push for sites added to the Home Screen, so a Safari tab
// gets install instructions instead. Subscriptions are league-wide (not per season).
// Right after turning on, the phone is asked "who's this phone for?" (everyone on the current teams).
// Score pings go to every device; viewing-night pings only to devices with a voter on them
// (lib/viewing.ts push()), so non-voters like Anna and Dan get scores only.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { VAPID_PUBLIC_KEY, PUSH_BRAND } from '@/lib/pushConfig';

type State = 'loading' | 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on' | 'busy';

// several toggles can share a page (homepage card + top-bar bell): each one announces its settled
// state so the others follow without a reload
const SYNC = 'survivor-push-state';
const CARD_DISMISSED = 'survivor-notify-card-dismissed';
const WHO_SKIPPED = 'survivor-push-who-skipped';  // "Skip" on the who's-this-phone sheet → don't ask again
const VIEWER = 'survivor-viewer';                  // the /viewing page's { me, also[] } — seeded from the sheet
let whoClaimed = false;                            // several toggles per page → only one asks

type League = { names: string[]; voters: string[] };
const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
const doneHint = (people: string[], voters: string[]) => people.some(p => voters.includes(p))
  ? 'You’ll get pings for new scores and Survivor nights.'
  : 'You’ll get pings for new scores. Survivor night pings only go to voters.';

function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const post = (method: 'POST' | 'DELETE', body: unknown) =>
  fetch('/api/push/subscribe', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/**
 * variant "pill" (default) = the original text pill; "icon" = a 44px bell icon button for the
 * compact app bar, which hands its hint text to the parent via onHint so it can show it below the bar;
 * "card" = the homepage's notify card (hidden, like the others, when push isn't available). The card
 * only nudges people who haven't turned notifications on: it hides once they're on (after a one-visit
 * "You're set"), when the browser has blocked them, or for good on that device after its ×.
 */
export default function PushToggle({ variant = 'pill', onHint }: { variant?: 'pill' | 'icon' | 'card'; onHint?: (hint: string | null) => void } = {}) {
  const [state, setState] = useState<State>('loading');
  const [hint, setHint] = useState<string | null>(null);
  const [justOn, setJustOn] = useState(false);       // turned on during this visit → show "You're set" once
  const [dismissed, setDismissed] = useState(false); // card closed with its × on this device
  const [league, setLeague] = useState<League>({ names: [], voters: [] });
  const [ask, setAsk] = useState(false);              // showing "who's this phone for?"
  const askWho = (lg: League, force = false) => {
    if (!lg.names.length || whoClaimed || (!force && lsGet(WHO_SKIPPED) === '1')) return false;
    whoClaimed = true; setAsk(true); return true;
  };
  useEffect(() => { onHint?.(hint); /* eslint-disable-next-line */ }, [hint]);

  useEffect(() => {
    if (variant === 'card') { try { setDismissed(localStorage.getItem(CARD_DISMISSED) === '1'); } catch { /* private mode */ } }
    const follow = (e: Event) => {
      const next = (e as CustomEvent<State>).detail;
      setState(cur => (cur === next || cur === 'loading' || cur === 'unsupported' ? cur : next));
    };
    window.addEventListener(SYNC, follow);
    return () => window.removeEventListener(SYNC, follow);
    /* eslint-disable-next-line */
  }, []);
  useEffect(() => {
    if (state === 'on' || state === 'off' || state === 'denied') window.dispatchEvent(new CustomEvent(SYNC, { detail: state }));
  }, [state]);

  useEffect(() => {
    (async () => {
      const cfg = await fetch('/api/push/subscribe').then(r => r.json()).catch(() => null);
      if (!cfg?.enabled) { setState('unsupported'); return; }
      const lg: League = { names: Array.isArray(cfg.names) ? cfg.names : [], voters: Array.isArray(cfg.voters) ? cfg.voters : [] };
      setLeague(lg);
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
      const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
      if (!supported) { setState(ios && !standalone ? 'ios-install' : 'unsupported'); return; }
      if (Notification.permission === 'denied') { setState('denied'); return; }
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        const sub = await reg.pushManager.getSubscription();
        if (sub && Notification.permission === 'granted') {
          setState('on');
          // keep the server copy fresh; a phone that never said who it's for gets asked once
          post('POST', { subscription: sub.toJSON() }).then(r => r.json())
            .then(j => { if (Array.isArray(j?.people) && !j.people.length) askWho(lg); }).catch(() => {});
        } else setState('off');
      } catch { setState('unsupported'); }
    })();
  }, []);

  async function turnOn() {
    setHint(null);
    // ask first, straight from the tap (iOS requires the prompt to come from a user gesture)
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { setState(perm === 'denied' ? 'denied' : 'off'); return; }
    setState('busy');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription())
        ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
      const res = await post('POST', { subscription: sub.toJSON() });
      if (!res.ok) throw new Error();
      const j = await res.json().catch(() => null);
      const people: string[] = Array.isArray(j?.people) ? j.people : [];
      setState('on');
      setJustOn(true);
      if (people.length || !askWho(league, true)) setHint(doneHint(people, league.voters));
    } catch { setState('off'); setHint('Couldn’t turn on notifications — try again.'); }
  }

  async function saveWho(people: string[]) {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await post('POST', { subscription: sub.toJSON(), people });
      // seed the /viewing page's "who's voting" so it doesn't ask again
      const vs = people.filter(p => league.voters.includes(p));
      if (vs.length && !lsGet(VIEWER)) lsSet(VIEWER, JSON.stringify({ me: vs[0], also: vs.slice(1) }));
    } catch { /* best effort */ }
    setAsk(false);
    setHint(doneHint(people, league.voters));
  }
  function skipWho() { lsSet(WHO_SKIPPED, '1'); setAsk(false); setHint(doneHint([], league.voters)); }

  async function turnOff() {
    setHint(null); setState('busy');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await post('DELETE', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
      setState('off');
    } catch { setState('on'); }
  }

  const sheet = ask && typeof document !== 'undefined'
    ? createPortal(<WhoSheet league={league} onSave={saveWho} onSkip={skipWho} />, document.body) : null;

  if (state === 'loading' || state === 'unsupported') return null;

  const onClick = () => {
    if (state === 'on') return turnOff();
    if (state === 'off') return turnOn();
    if (state === 'ios-install') return setHint(h => h ? null : 'On iPhone: tap Share → Add to Home Screen, open the app from your home screen, then tap 🔔 again.');
    if (state === 'denied') return setHint(h => h ? null : 'Notifications are blocked for this site — allow them in your browser or phone settings, then reload.');
  };
  const label = state === 'on' ? '🔔 On' : state === 'busy' ? '🔔 …' : '🔔 Notify me';
  const title = state === 'on' ? 'Turn off score notifications' : 'Get notified when scores are posted';

  // homepage card (styled by the homepage's .notify rules): bell, one-line pitch, a real button
  if (variant === 'card') {
    const on = state === 'on';
    if (dismissed || state === 'denied' || (on && !justOn)) return sheet;
    const dismiss = () => { setDismissed(true); try { localStorage.setItem(CARD_DISMISSED, '1'); } catch { /* private mode */ } };
    const sub = hint
      ?? (on ? 'This phone gets pings for new scores and Survivor nights.'
        : state === 'ios-install' ? 'On iPhone, add this site to your Home Screen first (Share → Add to Home Screen), then open it from there.'
          : 'New scores each week, plus Survivor night polls and reminders.');
    const canTap = on || state === 'off' || state === 'busy';
    return (<>{sheet}
      <section className="notify" aria-label="Score notifications">
        <span className="bell" aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" fill="none" />
          </svg>
        </span>
        <div className="txt">
          <b>{on ? 'You’re set' : 'Get pings for scores & Survivor nights'}</b>
          <span aria-live="polite">{sub}</span>
          {canTap && (
            <button type="button" className={on ? 'off' : 'go'} onClick={onClick} disabled={state === 'busy'} aria-pressed={on}>
              {state === 'busy' ? '…' : on ? 'Turn off' : 'Notify me'}
            </button>
          )}
        </div>
        <button type="button" className="x" onClick={dismiss} aria-label={on ? 'Close' : 'Not now — hide this card'} title={on ? 'Close' : 'Not now'}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </section>
    </>);
  }

  if (variant === 'icon') return (<>{sheet}
    <button type="button" className={`iconbtn ${state === 'on' ? 'on' : ''}`} onClick={onClick} disabled={state === 'busy'}
      aria-label={title} aria-pressed={state === 'on'} title={title}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill={state === 'on' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" fill="none" />
      </svg>
    </button>
  </>);

  return (
    <>{sheet}
      <button className="refresh" style={{ marginLeft: 8, ...(state === 'on' ? { borderColor: PUSH_BRAND.accent, color: PUSH_BRAND.accent } : {}) }}
        onClick={onClick} disabled={state === 'busy'} title={title}>
        {label}
      </button>
      {hint && <div style={{ margin: '10px auto 0', maxWidth: 300, fontSize: 12, color: '#a8a29e', lineHeight: 1.45 }}>{hint}</div>}
    </>
  );
}

/** Bottom sheet: who uses this phone (multi-select). Portaled to <body>, so colors are literal (no page vars). */
function WhoSheet({ league, onSave, onSkip }: { league: League; onSave: (people: string[]) => void; onSkip: () => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const toggle = (n: string) => setPicked(p => (p.includes(n) ? p.filter(x => x !== n) : [...p, n]));
  return (
    <div role="dialog" aria-modal="true" aria-label="Who’s this phone for?"
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 560, background: '#1c1917', color: '#fafaf9', borderTop: '1px solid #3a342f', borderRadius: '18px 18px 0 0',
        padding: '20px 16px calc(20px + env(safe-area-inset-bottom))', fontFamily: 'inherit' }}>
        <div style={{ fontSize: 19, fontWeight: 800 }}>Who’s this phone for?</div>
        <p style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.45, color: '#a8a29e' }}>
          Pick everyone who uses it. Everyone gets score pings; Survivor night pings only go to voters.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
          {league.names.map(n => {
            const on = picked.includes(n);
            return (
              <button key={n} type="button" aria-pressed={on} onClick={() => toggle(n)}
                style={{ minHeight: 44, padding: '0 16px', borderRadius: 999, fontSize: 15, fontWeight: 700, cursor: 'pointer',
                  border: `1px solid ${on ? '#f59e0b' : '#3a342f'}`, background: on ? 'rgba(245,158,11,.16)' : '#262220', color: on ? '#fcd34d' : '#fafaf9' }}>
                {on ? '✓ ' : ''}{n}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button type="button" onClick={onSkip} disabled={busy}
            style={{ flex: 1, minHeight: 48, borderRadius: 12, border: '1px solid #3a342f', background: 'transparent', color: '#d6d3d1', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            Skip
          </button>
          <button type="button" disabled={busy || !picked.length} onClick={async () => { setBusy(true); await onSave(picked); }}
            style={{ flex: 2, minHeight: 48, borderRadius: 12, border: 0, background: picked.length ? '#f59e0b' : '#57534e', color: '#0c0a09', fontSize: 15, fontWeight: 800, cursor: picked.length ? 'pointer' : 'default' }}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

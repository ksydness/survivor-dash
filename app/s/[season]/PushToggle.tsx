'use client';

// 🔔 button: subscribe this device to weekly score notifications (Web Push).
// iPhone only supports push for sites added to the Home Screen, so a Safari tab
// gets install instructions instead. Subscriptions are league-wide (not per season).

import { useEffect, useState } from 'react';
import { VAPID_PUBLIC_KEY, PUSH_BRAND } from '@/lib/pushConfig';

type State = 'loading' | 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on' | 'busy';

function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const post = (method: 'POST' | 'DELETE', body: unknown) =>
  fetch('/api/push/subscribe', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export default function PushToggle() {
  const [state, setState] = useState<State>('loading');
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const cfg = await fetch('/api/push/subscribe').then(r => r.json()).catch(() => null);
      if (!cfg?.enabled) { setState('unsupported'); return; }
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
          post('POST', { subscription: sub.toJSON() }).catch(() => {}); // keep the server copy fresh
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
      setState('on');
      setHint('You’ll get a notification when each week’s scores are posted.');
    } catch { setState('off'); setHint('Couldn’t turn on notifications — try again.'); }
  }

  async function turnOff() {
    setHint(null); setState('busy');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await post('DELETE', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
      setState('off');
    } catch { setState('on'); }
  }

  if (state === 'loading' || state === 'unsupported') return null;

  const onClick = () => {
    if (state === 'on') return turnOff();
    if (state === 'off') return turnOn();
    if (state === 'ios-install') return setHint(h => h ? null : 'On iPhone: tap Share → Add to Home Screen, open the app from your home screen, then tap 🔔 again.');
    if (state === 'denied') return setHint(h => h ? null : 'Notifications are blocked for this site — allow them in your browser or phone settings, then reload.');
  };
  const label = state === 'on' ? '🔔 On' : state === 'busy' ? '🔔 …' : '🔔 Notify me';

  return (
    <>
      <button className="refresh" style={{ marginLeft: 8, ...(state === 'on' ? { borderColor: PUSH_BRAND.accent, color: PUSH_BRAND.accent } : {}) }}
        onClick={onClick} disabled={state === 'busy'} title={state === 'on' ? 'Turn off score notifications' : 'Get notified when scores are posted'}>
        {label}
      </button>
      {hint && <div style={{ margin: '10px auto 0', maxWidth: 300, fontSize: 12, color: '#a8a29e', lineHeight: 1.45 }}>{hint}</div>}
    </>
  );
}

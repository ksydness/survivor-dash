'use client';

// Viewing-night scheduler page (/viewing): who's voting on this phone, start a poll, vote, lock,
// pick where, can't-make-it. All state lives on the server (lib/viewing.ts); this page posts
// actions and re-renders whatever comes back. Design reference: the "Survivor Dash — Viewing
// Night Scheduler" canvas.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePullRefresh } from '../PullToRefresh';
import PushToggle from '../s/[season]/PushToggle';
import { colorFor } from '../s/[season]/dash/model';
import {
  type Answer, type Roster, type Viewing as V, type ViewingOption, type ViewingState, type Vote,
  type Going,
  tally, waitingOn, goingList, winnerOption, topNights, leadLine, teamsIn, todayET, hourET, addDays, dayLabel, timeLabel, deadlineLabel,
  epLabel, weekdayLong, weekdayShort, optKey, MAX_EPISODES, MAX_TIMES_PER_DAY, addressFor, directionsUrl, placeKey,
} from '@/lib/viewingModel';

const WHO_KEY = 'survivor-viewer';           // { me, also[] } — who votes on this phone
const COMMISH_KEY = 'survivor-commish-key';  // shared with the draft room
const CAL_KEY = 'survivor-cal-subscribed';   // this phone tapped Subscribe → the calendar box says so

type Who = { me: string; also: string[] };
type Screen = 'main' | 'who' | 'start' | 'reopen' | 'add';

const ls = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};

const and = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
/** Lock / pick a night for everyone — big enough to deserve an "are you sure?". */
const sure = (what: string) => confirm(`${what}? Voting ends and everyone sees it as the plan.`);

// 11:00 AM … 10:00 PM in half hours
const TIMES = Array.from({ length: 23 }, (_, i) => { const m = 11 * 60 + i * 30; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${m % 60 ? '30' : '00'}`; });
const TBD = '';

const Chev = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>);
const Check = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12l5 5L20 7" /></svg>);

function Dots({ roster, inTeams, maybeTeams = [] }: { roster: Roster; inTeams: string[]; maybeTeams?: string[] }) {
  return (
    <span className="dots" role="img" aria-label={`${inTeams.length} of ${roster.teams.length} teams in${inTeams.length ? ': ' + inTeams.join(', ') : ''}${maybeTeams.length ? `; maybe: ${maybeTeams.join(', ')}` : ''}`}>
      {roster.teams.map((t, i) => {
        const c = colorFor(t, i);
        // filled = someone on the team said Yes; half-filled = only a Maybe
        const st = inTeams.includes(t) ? { background: c, borderColor: c } : maybeTeams.includes(t) ? { background: `linear-gradient(90deg, ${c} 50%, transparent 50%)`, borderColor: c } : undefined;
        return <i key={t} style={st} />;
      })}
    </span>
  );
}

/** Small "share with the group text" link: the phone's share sheet, or copy to paste. */
function ShareLink({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = `${window.location.origin}/viewing`;
    try {
      if (navigator.share) { await navigator.share({ text, url }); return; }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true); setTimeout(() => setCopied(false), 2500);
    } catch { /* share sheet dismissed */ }
  };
  return (
    <p className="note" style={{ textAlign: 'center', margin: 0 }}>
      <button type="button" className="linkbtn" onClick={share}>{copied ? 'Copied — paste it in the group text' : 'Share with the group text'}</button>
    </p>
  );
}

function Stepper({ label, value, onChange, disabled }: { label: string; value: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <div className="stepper">
      <span>{label}</span>
      <button type="button" aria-label="Fewer episodes" disabled={disabled || value <= 1} onClick={() => onChange(value - 1)}>−</button>
      <b aria-live="polite" className="num">{value}</b>
      <button type="button" aria-label="More episodes" disabled={disabled || value >= MAX_EPISODES} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}

function TimeSelect({ value, onChange, allowTbd = true, label, wide }: { value: string | null; onChange: (t: string | null) => void; allowTbd?: boolean; label: string; wide?: boolean }) {
  return (
    <select className={wide ? undefined : 'chip'} aria-label={label} value={value ?? TBD} onChange={e => onChange(e.target.value === TBD ? null : e.target.value)}>
      {allowTbd && <option value={TBD}>{wide ? 'TBD' : 'Time TBD'}</option>}
      {TIMES.map(t => <option key={t} value={t}>{timeLabel(t)}</option>)}
    </select>
  );
}

export default function Viewing({ initial, go }: { initial: ViewingState; go?: string }) {
  const [st, setSt] = useState<ViewingState>(initial);
  const [who, setWho] = useState<Who | null>(null);
  const [key, setKey] = useState('');
  const [screen, setScreen] = useState<Screen>('main');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [keyBox, setKeyBox] = useState(false);   // hidden commissioner-key field (5 quick taps on the title)
  const taps = useRef<number[]>([]);
  const router = useRouter();

  // who's on this phone + commissioner key (shared with the draft room; ?key= saves it)
  useEffect(() => {
    // a saved name that's no longer a voter (renamed in the sheet, roster changed) is dropped, so this phone
    // gets asked again instead of failing every tap with "Pick who you are first" (skipped if the roster didn't load)
    const names = initial.roster.voters.map(v => v.name);
    const ok = (n: unknown): n is string => typeof n === 'string' && (!names.length || names.includes(n));
    try {
      const w = JSON.parse(ls.get(WHO_KEY) || 'null');
      if (w?.me && ok(w.me)) setWho({ me: w.me, also: Array.isArray(w.also) ? w.also.filter(ok) : [] });
      else if (w) ls.del(WHO_KEY);
    } catch { /* ignore */ }
    const url = new URL(window.location.href);
    const k = url.searchParams.get('key');
    if (k) { ls.set(COMMISH_KEY, k); url.searchParams.delete('key'); window.history.replaceState(null, '', url.toString()); }
    setKey(k || ls.get(COMMISH_KEY) || '');
    // the homepage's Start a poll / We already picked a date links can be stale (a home-screen app resumes an
    // old page) — only open the form if nothing is planned yet; otherwise show what's actually going on
    if (go === 'start' || go === 'add') {
      const cur = initial.viewing;
      if (!cur || cur.status === 'closed') setScreen(go);
      else setFlash(cur.status === 'polling' ? `${cur.created_by} already started a poll — vote below.` : 'The next Survivor night is already set — here it is.');
    }
  }, [go]); // eslint-disable-line react-hooks/exhaustive-deps

  const people = useMemo(() => (who ? [who.me, ...who.also] : []), [who]);

  // tell the server who's on this device, so vote reminders reach the right phones
  const syncDevice = useCallback(async (ps: string[]) => {
    if (!ps.length || !('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) await fetch('/api/viewing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'whoami', as: ps, endpoint: sub.endpoint }) });
    } catch { /* best effort */ }
  }, []);
  useEffect(() => { syncDevice(people); }, [people, syncDevice]);
  useEffect(() => {
    const on = (e: Event) => { if ((e as CustomEvent).detail === 'on') syncDevice(people); };
    window.addEventListener('survivor-push-state', on);
    return () => window.removeEventListener('survivor-push-state', on);
  }, [people, syncDevice]);

  const load = useCallback(async (fresh = false) => {
    try {
      const r = await fetch(`/api/viewing${fresh ? '?sync=1' : ''}`, { cache: 'no-store' });
      if (r.ok) setSt(await r.json());
    } catch { /* keep what we have */ }
  }, []);
  usePullRefresh(() => load(true));
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible' && screen === 'main') load(); }, 20000);
    const vis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis); };
  }, [load, screen]);

  const act = useCallback(async (action: string, extra: Record<string, unknown> = {}, done?: string) => {
    setBusy(true); setErr(null); setFlash(null);
    try {
      const r = await fetch('/api/viewing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, me: who?.me, as: people, key: key || undefined, ...extra }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error || 'Something went wrong — try again.'); if (r.status === 409) load(); window.scrollTo({ top: 0, behavior: 'smooth' }); return false; }
      setSt(j); setScreen('main');
      // the homepage copy held in the app's router cache still shows the old answer ("Are you coming?");
      // refresh drops it so Home redraws from the server
      router.refresh();
      if (done) { setFlash(done); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      return true;
    } catch { setErr('Couldn’t reach the server — check your connection.'); return false; }
    finally { setBusy(false); }
  }, [who, people, key, load, router]);

  const rememberWho = (w: Who) => { setWho(w); ls.set(WHO_KEY, JSON.stringify(w)); };
  const saveWho = (w: Who) => { rememberWho(w); setScreen('main'); };

  // 5 taps on the title within 2s opens the commissioner-key field — nothing visible for anyone else
  const tapTitle = () => {
    if (screen !== 'main') return;
    const now = Date.now();
    taps.current = [...taps.current.filter(t => now - t < 2000), now];
    if (taps.current.length >= 5) { taps.current = []; setKeyBox(true); }
  };
  const saveKey = async (k: string) => {
    setBusy(true); setErr(null); setFlash(null);
    try {
      const r = await fetch('/api/viewing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'checkkey', key: k }) });
      if (!r.ok) { setErr('That key didn’t work.'); return; }
      ls.set(COMMISH_KEY, k); setKey(k); setKeyBox(false); setFlash('Commissioner key saved on this phone.');
    } catch { setErr('Couldn’t reach the server — check your connection.'); }
    finally { setBusy(false); }
  };
  const removeKey = () => { ls.del(COMMISH_KEY); setKey(''); setFlash('Commissioner key removed from this phone.'); };

  const { roster, viewing: v, votes } = st;
  // whoever started it (on their own phone — not a phone that votes for them) or the commissioner
  const canLock = !!key || (!!v && who?.me === v.created_by);
  const back = screen === 'main' ? null : () => { setScreen('main'); setErr(null); };

  return (
    <>
      <header className="bar">
        {back
          ? <button type="button" className="iconbtn" aria-label="Back" onClick={back}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 18l-6-6 6-6" /></svg></button>
          : <Link className="iconbtn" href="/" aria-label="Home"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 18l-6-6 6-6" /></svg></Link>}
        <h1 onClick={tapTitle} style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>{screen === 'who' ? 'Who’s voting?' : screen === 'start' ? 'Start a poll' : screen === 'reopen' ? 'Add more nights' : screen === 'add' ? 'Add the date' : 'Survivor night'}</h1>
        <PushToggle variant="icon" onHint={setHint} />
      </header>
      {hint && <p className="hint" role="status">{hint}</p>}

      <main>
        {err && <div className="err" role="alert">{err}</div>}
        {flash && <div className="flash" role="status">{flash}</div>}
        {!st.configured && <div className="err">The scheduler isn’t connected yet.</div>}

        {screen === 'who' && <WhoPicker roster={roster} who={who} onSave={saveWho} />}
        {(screen === 'start' || screen === 'add') && <WhoInline roster={roster} who={who} onPick={rememberWho} verb={screen === 'start' ? 'starting this poll' : 'adding the date'} />}
        {screen === 'start' && <PollForm mode="start" busy={busy} existing={[]} episodes={2} needWho={!who}
          onSubmit={(p) => act('start', p, 'The poll is live. Now add your own votes below.')} />}
        {screen === 'reopen' && v && <PollForm mode="reopen" busy={busy} existing={v.options} episodes={v.episodes}
          onSubmit={(p) => act('reopen', p, 'The poll is open again.')} />}
        {screen === 'add' && <AddDateForm busy={busy} places={st.places} needWho={!who} onSubmit={(p) => act('add_date', p, 'It’s set.')} />}

        {screen === 'main' && keyBox && <KeyBox busy={busy} onSave={saveKey} onCancel={() => setKeyBox(false)} />}

        {screen === 'main' && (<>
          {!v && <Idle onStart={() => setScreen('start')} onAdd={() => setScreen('add')} />}
          {v?.status === 'polling' && <Polling v={v} votes={votes} roster={roster} bar={st.bar} who={who} people={people} canLock={canLock}
            busy={busy} act={act} onPick={rememberWho} />}
          {v?.status === 'closed' && <Closed v={v} votes={votes} roster={roster} bar={st.bar} canLock={canLock} busy={busy} act={act}
            onReopen={() => setScreen('reopen')} onAdd={() => setScreen('add')} onStart={() => setScreen('start')} />}
          {v?.status === 'locked' && <Locked v={v} votes={votes} roster={roster} bar={st.bar} places={st.places} addresses={st.addresses ?? {}} who={who} people={people} canLock={canLock} busy={busy} act={act}
            onPick={rememberWho} />}
          {v?.status !== 'locked' && <CalendarFooter />}
          {who && (
            <p className="note" style={{ textAlign: 'center' }}>
              This phone votes for <b style={{ color: 'var(--text)' }}>{people.join(' + ')}</b> · <button type="button" className="linkbtn" onClick={() => setScreen('who')}>Change</button>
            </p>
          )}
          {key && (
            <p className="note" style={{ textAlign: 'center' }}>
              Commissioner ✓ · <button type="button" className="linkbtn" onClick={removeKey}>Remove</button>
            </p>
          )}
        </>)}
      </main>
    </>
  );
}

/* ── who's starting this (shown on Start a poll / Add the date) ─────────── */

// Links like the homepage's "Start a poll" land straight on the form, so the name is asked right here —
// one tap, no detour, and nothing typed into the form is lost. Couples can add their partner later
// ("This phone votes for … · Change").
function WhoInline({ roster, who, onPick, verb }: { roster: Roster; who: Who | null; onPick: (w: Who) => void; verb: string }) {
  const [editing, setEditing] = useState(false);
  const [askMates, setAskMates] = useState<string[]>([]);   // just picked a name → "voting for Karina too?"
  if (!roster.voters.length) return null;
  const color = (team: string) => colorFor(team, roster.teams.indexOf(team));
  if (who && askMates.length) return (
    <div className="who"><span className="t">Also answering for <b>{and(askMates)}</b>? Their own answers always win.</span>
      <button type="button" className="chipbtn" onClick={() => { onPick({ me: who.me, also: askMates }); setAskMates([]); }}>Yes</button>
      <button type="button" className="chipbtn" onClick={() => setAskMates([])}>Just me</button></div>
  );
  if (who && !editing) return (
    <div className="who"><span className="t">You’re {verb} as <b>{[who.me, ...who.also].join(' + ')}</b></span>
      <button type="button" className="chipbtn" onClick={() => setEditing(true)}>Not you?</button></div>
  );
  // people on the teams who don't vote (Colt, Anna, Dan) — so they know there's nothing to do
  const others = [...new Set(roster.teams.flatMap(t => t.split(/\s*(?:\+|&|,|\band\b)\s*/i).map(x => x.trim()).filter(Boolean)))]
    .filter(n => !roster.voters.some(v => v.name.toLowerCase() === n.toLowerCase()));
  const pick = (name: string, team: string) => {
    const mates = roster.voters.filter(x => x.team === team && x.name !== name).map(x => x.name);
    onPick({ me: name, also: who?.me === name ? who.also : [] });
    setEditing(false);
    if (mates.length && who?.me !== name) setAskMates(mates);
  };
  return (
    <section className="card hi" aria-label="Who are you?">
      <h2 className="title" style={{ fontSize: 20 }}>Who are you?</h2>
      <p className="lede">Tap your name — this phone remembers it.</p>
      <div className="chips" style={{ marginTop: 12 }}>
        {roster.voters.map(v => (
          <button key={v.name} type="button" className="tog" aria-pressed={who?.me === v.name} onClick={() => pick(v.name, v.team)}>
            <span className="dots" aria-hidden><i style={{ background: color(v.team), borderColor: color(v.team) }} /></span>{v.name}
          </button>
        ))}
      </div>
      {others.length > 0 && <p className="note" style={{ marginTop: 10 }}>{and(others)} {others.length === 1 ? 'doesn’t' : 'don’t'} vote on Survivor nights — nothing to do here.</p>}
    </section>
  );
}

/* ── hidden commissioner key ────────────────────────────────────────── */

function KeyBox({ busy, onSave, onCancel }: { busy: boolean; onSave: (k: string) => void; onCancel: () => void }) {
  const [k, setK] = useState('');
  return (
    <section className="card hi" aria-label="Commissioner key">
      <h2 className="eyebrow">Commissioner key</h2>
      <p className="lede">Saved on this phone only. It lets you lock or cancel any poll.</p>
      <input type="password" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false}
        style={{ marginTop: 12 }} placeholder="Paste your key" aria-label="Commissioner key" value={k} onChange={e => setK(e.target.value)} />
      <div className="row2" style={{ marginTop: 12 }}>
        <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="cta sm" disabled={busy || !k.trim()} onClick={() => onSave(k.trim())}>Save</button>
      </div>
    </section>
  );
}

/* ── who's on this phone ─────────────────────────────────────────────── */

function WhoPicker({ roster, who, onSave }: { roster: Roster; who: Who | null; onSave: (w: Who) => void }) {
  const [me, setMe] = useState(who?.me ?? '');
  const [also, setAlso] = useState<string[]>(who?.also ?? []);
  const pickMe = (n: string) => { setMe(n); setAlso(a => a.filter(x => x !== n)); };
  const toggle = (n: string) => setAlso(a => (a.includes(n) ? a.filter(x => x !== n) : [...a, n]));
  return (<>
    <div>
      <h2 className="title" style={{ marginTop: 4 }}>Who are you?</h2>
      <p className="lede">Then pick anyone else you’re voting for. This phone remembers it — change it any time.</p>
    </div>
    {roster.teams.map((t, i) => (
      <section key={t} className="card" aria-label={t}>
        <div className="hrow" style={{ justifyContent: 'flex-start' }}>
          <span className="dots"><i style={{ background: colorFor(t, i), borderColor: colorFor(t, i) }} /></span>
          <h3 className="eyebrow">{t}</h3>
        </div>
        <div className="chips" style={{ marginTop: 12 }}>
          {roster.voters.filter(v => v.team === t).map(v => {
            const isMe = me === v.name; const on = isMe || also.includes(v.name);
            return (
              <button key={v.name} type="button" className="tog" aria-pressed={on}
                onClick={() => (!me ? pickMe(v.name) : isMe ? setMe('') : toggle(v.name))}>
                <span className="ck" aria-hidden>{on && <Check />}</span>{v.name}{isMe && <small style={{ color: 'var(--gold)', fontWeight: 800 }}>· you</small>}
              </button>
            );
          })}
        </div>
      </section>
    ))}
    <p className="note">{me ? <>Voting as <b style={{ color: 'var(--text)' }}>{[me, ...also].join(' + ')}</b>. Anyone you vote for can still vote on their own phone — their own vote always wins.</> : 'Tap your own name first.'}</p>
    <button type="button" className="cta" disabled={!me} onClick={() => onSave({ me, also })}>Save</button>
  </>);
}

/* ── nothing planned ─────────────────────────────────────────────────── */

function Idle({ onStart, onAdd }: { onStart: () => void; onAdd: () => void }) {
  return (
    <section className="card hi">
      <h2 className="eyebrow">Next Survivor night</h2>
      <h2 className="title">Nothing on the calendar</h2>
      <p className="lede">Anyone can get the next one going.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
        <button type="button" className="cta" onClick={onStart}>Start a poll</button>
        <button type="button" className="ghost" onClick={onAdd}>We already picked a date</button>
      </div>
    </section>
  );
}

/* ── poll open ───────────────────────────────────────────────────────── */

type Act = (action: string, extra?: Record<string, unknown>, done?: string) => Promise<boolean>;

function Polling({ v, votes, roster, bar, who, people, canLock, busy, act, onPick }: {
  v: V; votes: Vote[]; roster: Roster; bar: number; who: Who | null; people: string[]; canLock: boolean; busy: boolean; act: Act; onPick: (w: Who) => void;
}) {
  const t = tally(v.options, votes, roster);
  const leader = t[0];
  const waiting = waitingOn(v.options, votes, roster);
  const byDate = [...t].sort((a, b) => optKey(a.option).localeCompare(optKey(b.option)));
  const [adding, setAdding] = useState(false);
  const [eps, setEps] = useState(v.episodes);
  useEffect(() => setEps(v.episodes), [v.episodes]);
  // how far this phone's voter is: answers save as they tap — "Done" just moves them on to the results
  const answered = who ? v.options.filter(o => votes.some(x => x.option_id === o.id && x.person === who.me)).length : 0;
  const total = v.options.length;
  // answers someone else gave for this phone's person (Tony voting for Karina) — she gets to check them first
  const byOthers = who ? votes.filter(x => x.person === who.me && x.cast_by !== who.me && v.options.some(o => o.id === x.option_id)) : [];
  const [showResults, setShowResults] = useState(() => !!who && total > 0 && answered === total && byOthers.length === 0);
  // someone who already answered everything comes back to the results (once, when the phone's name loads)
  const autoShown = useRef(false);
  useEffect(() => {
    if (!who || autoShown.current) return;
    autoShown.current = true;
    if (total > 0 && answered === total && byOthers.length === 0) setShowResults(true);
  }, [who]); // eslint-disable-line react-hooks/exhaustive-deps
  // "Looks right": re-save those answers as their own (so nobody else's tap can change them later)
  const keepMine = async () => {
    if (!who) return;
    for (const a of ['y', 'm', 'n'] as Answer[]) {
      const ids = byOthers.filter(x => x.answer === a).map(x => x.option_id);
      if (ids.length && !(await act('vote', { option_ids: ids, answer: a, as: [who.me] }))) return;
    }
  };
  const lockIt = (o: ViewingOption) => { if (sure(`Lock ${dayLabel(o.date)}${o.time ? ` at ${timeLabel(o.time)}` : ''}`)) act('lock', { option_id: o.id, episodes: eps }, `Set: ${dayLabel(o.date)}.`); };
  const toTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  // "everyone has voted" means every night answered — so finishing with skipped nights saves them as No
  // (otherwise you'd stay on "Waiting on …", get the evening-before nudge, and the poll couldn't lock early)
  const finish = async () => {
    const left = who ? v.options.filter(o => !votes.some(x => x.option_id === o.id && x.person === who.me)).map(o => o.id) : [];
    if (left.length && !(await act('vote', { option_ids: left, answer: 'n' }))) return;
    setShowResults(true); toTop();
  };

  if (showResults && who) return (
    <Results v={v} votes={votes} roster={roster} bar={bar} t={t} waiting={waiting} me={who.me} answered={answered}
      canLock={canLock} busy={busy} eps={eps} act={act} onChange={() => { setShowResults(false); toTop(); }} />
  );

  return (<>
    <section className="card hi">
      <div className="hrow"><h2 className="eyebrow">Next Survivor night</h2><span className="pill"><i />Poll open</span></div>
      <h2 className="title">Pick a night for the next {epLabel(v.episodes)}</h2>
      <p className="lede">{v.created_by} started it · vote by <b>{v.deadline ? deadlineLabel(v.deadline) : '—'}</b></p>
      <div className="facts">
        <span className="num">{roster.voters.length - waiting.length} of {roster.voters.length} voted</span>
        {waiting.length > 0 && <span>Waiting on <b>{waiting.join(', ')}</b></span>}
      </div>
      {answered === 0 && <p className="note" style={{ marginTop: 10 }}>Once everyone has voted, the night with the most teams saying Yes locks itself (needs {bar} of {roster.teams.length}). If it’s a tie or people don’t vote, {v.created_by} picks after the deadline.</p>}
    </section>

    {(!who || !answered) && <WhoInline roster={roster} who={who} onPick={onPick} verb="voting" />}
    {byOthers.length > 0 && (
      <div className="who" role="status"><span className="t"><b>{and([...new Set(byOthers.map(x => x.cast_by))])}</b> answered for you — check them below and tap to change any.</span>
        <button type="button" className="chipbtn" disabled={busy} onClick={keepMine}>Looks right</button></div>
    )}
    {who && (
      <div className="who" role="status"><span className="t">
        {answered === 0 ? <>Tap <b>Yes</b>, <b>Maybe</b> or <b>No</b> for each night — each tap saves.</>
          : <><b>{answered} of {total}</b> answered · saved ✓</>}
      </span></div>
    )}

    {byDate.map(row => (
      <OptionCard key={row.option.id} row={row} votes={votes} roster={roster} people={people} me={who?.me ?? null}
        lead={leader?.option.id === row.option.id && leader.yes.length > 0} canLock={canLock} busy={busy}
        onVote={(a) => act('vote', { option_id: row.option.id, answer: a })}
        onLock={() => lockIt(row.option)} />
    ))}

    {adding
      ? <AddNight v={v} busy={busy} onCancel={() => setAdding(false)} onAdd={async (o) => { if (await act('add_option', o, `Added ${dayLabel(o.date)}.`)) setAdding(false); }} />
      : who && <button type="button" className="dashed" onClick={() => setAdding(true)}>+ None of these work? Add a night</button>}

    {who && (<>
      <button type="button" className="cta" disabled={busy || answered === 0} onClick={finish}>
        {answered === 0 ? 'Vote on a night to finish' : answered < total ? `Done — count the other ${total - answered === 1 ? 'one' : total - answered} as No` : 'Done — see results'}
      </button>
      {answered > 0 && answered < total && <p className="note" style={{ textAlign: 'center', marginTop: -4 }}>{total - answered} night{total - answered === 1 ? '' : 's'} still unanswered — finishing counts {total - answered === 1 ? 'it' : 'them'} as No, so the poll isn’t left waiting on you.</p>}
    </>)}

    {canLock && (
      <section className="card">
        <Stepper label="Episodes" value={eps} disabled={busy} onChange={(n) => { setEps(n); act('set_episodes', { episodes: n }); }} />
        {leader && (<>
          <p className="note" style={{ marginTop: 12 }}>{who?.me === v.created_by ? 'You started this poll' : 'You have the commissioner key'}, so you can lock it early:</p>
          <button type="button" className="ghost" style={{ marginTop: 10 }} disabled={busy} onClick={() => lockIt(leader.option)}>
            Lock {dayLabel(leader.option.date)}{leader.option.time ? ` · ${timeLabel(leader.option.time)}` : ''} now
          </button>
        </>)}
      </section>
    )}
    <ShareLink text={pollShareText(v)} />
    {canLock && <button type="button" className="linkbtn danger" onClick={() => { if (confirm('Cancel this poll for everyone?')) act('cancel', {}, 'Poll cancelled.'); }}>Cancel this poll</button>}
  </>);
}

function pollShareText(v: V) {
  const days = [...new Set(v.options.map(o => o.date))].sort().map(dayLabel);
  const list = days.length <= 1 ? days.join('') : `${days.slice(0, -1).join(', ')} or ${days[days.length - 1]}`;
  return `Vote on the next Survivor night (${list})${v.deadline ? ` by ${weekdayShort(todayET(new Date(v.deadline)))} 9 PM` : ''}:`;
}

/* ── after voting: where it stands ────────────────────────────────────── */

function Results({ v, votes, roster, bar, t, waiting, me, answered, canLock, busy, eps, act, onChange }: {
  v: V; votes: Vote[]; roster: Roster; bar: number; t: ReturnType<typeof tally>; waiting: string[]; me: string; answered: number;
  canLock: boolean; busy: boolean; eps: number; act: Act; onChange: () => void;
}) {
  const leader = t[0];
  const allIn = waiting.length === 0;
  return (<>
    <section className="card hi">
      <div className="hrow"><h2 className="eyebrow">Your votes are in</h2><span className="pill"><i />Poll open</span></div>
      <h2 className="title">Thanks, {me} ✓</h2>
      <p className="lede">{allIn ? 'Everyone has voted.'
        : <>Votes are due <b>{v.deadline ? deadlineLabel(v.deadline) : 'soon'}</b>. If everyone votes and one night is ahead, it locks itself — otherwise {v.created_by} picks.</>}</p>
      <div className="facts">
        <span className="num">{roster.voters.length - waiting.length} of {roster.voters.length} voted</span>
        {waiting.length > 0 && <span>Waiting on <b>{waiting.join(', ')}</b></span>}
      </div>
    </section>

    <section className="card" aria-label="Where it stands">
      <div className="hrow"><h3 className="eyebrow">Where it stands</h3><span className="note">needs {bar} of {roster.teams.length} teams</span></div>
      <p className="note" style={{ marginTop: 4 }}>Tap a night to see who voted.</p>
      <NightRows t={t} votes={votes} roster={roster} me={me} tag={(row, i) => (i === 0 && leader.yes.length > 0 ? 'Leading' : null)} />
    </section>

    {answered < v.options.length && <p className="note" style={{ textAlign: 'center' }}>{v.options.length - answered === 1 ? 'A night was' : `${v.options.length - answered} nights were`} added since you voted — tap Change my votes to answer.</p>}
    <button type="button" className="ghost" onClick={onChange}>Change my votes</button>
    {canLock && leader && (
      <button type="button" className="ghost" disabled={busy}
        onClick={() => { const o = leader.option; if (sure(`Lock ${dayLabel(o.date)}${o.time ? ` at ${timeLabel(o.time)}` : ''}`)) act('lock', { option_id: o.id, episodes: eps }, `Set: ${dayLabel(o.date)}.`); }}>
        Lock {dayLabel(leader.option.date)}{leader.option.time ? ` · ${timeLabel(leader.option.time)}` : ''} now
      </button>
    )}
    <ShareLink text={pollShareText(v)} />
    <Link className="linkbtn" href="/" style={{ textAlign: 'center' }}>Back to the leaderboard</Link>
  </>);
}

/** Each night ranked, with team dots; tap one to see everyone's answer team by team. */
function NightRows({ t, votes, roster, me, tag }: {
  t: ReturnType<typeof tally>; votes: Vote[]; roster: Roster; me: string | null;
  tag: (row: ReturnType<typeof tally>[number], i: number) => string | null;
}) {
  const word = { y: 'Yes', m: 'Maybe', n: 'No' } as const;
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div style={{ marginTop: 2 }}>
      {t.map((row, i) => {
        const mine = me ? votes.find(x => x.option_id === row.option.id && x.person === me)?.answer : undefined;
        const isOpen = open === row.option.id;
        const label = tag(row, i);
        return (<div key={row.option.id}>
          <button type="button" className="trow" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : row.option.id)}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', background: 'none', border: 0, borderBottom: '1px solid var(--line)', color: 'inherit', textAlign: 'left', font: 'inherit', cursor: 'pointer' }}>
            <div style={{ minWidth: 0 }}>
              <b style={{ display: 'block' }}>{dayLabel(row.option.date)} · {timeLabel(row.option.time)}{label && <span className="lead-tag" style={{ color: 'var(--gold)', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', marginLeft: 8 }}>{label}</span>}</b>
              <span className="note">{row.yes.length} yes · {row.maybe.length} maybe · {row.no.length} no{me && <> · you said <b style={{ color: 'var(--text)' }}>{mine ? word[mine] : '—'}</b></>}</span>
            </div>
            <div style={{ textAlign: 'right', flex: 'none' }}>
              <Dots roster={roster} inTeams={row.teamsIn} maybeTeams={row.teamsMaybe} />
              <div className="note num" style={{ color: row.clears ? 'var(--gold)' : undefined }}>{row.teamsIn.length} of {roster.teams.length}{row.clears ? ' ✓' : ''}</div>
            </div>
            <span style={{ flex: 'none', color: 'var(--muted)', display: 'flex', transform: isOpen ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }}><Chev /></span>
          </button>
          {isOpen && <div className="tray" style={{ borderTop: 0, borderRadius: 12, margin: '8px 0 6px' }}>
            <VoteTray optionId={row.option.id} teamsIn={row.teamsIn} votes={votes} roster={roster} />
          </div>}
        </div>);
      })}
    </div>
  );
}

function OptionCard({ row, votes, roster, people, me, lead, canLock, busy, onVote, onLock, lockLabel = 'Lock this one', pickLabel }: {
  row: ReturnType<typeof tally>[number]; votes: Vote[]; roster: Roster; people: string[]; me: string | null; lead: boolean; canLock: boolean; busy: boolean;
  onVote?: (a: Answer) => void; onLock: () => void; lockLabel?: string;
  pickLabel?: string; // shown right on the card (votes are in, someone picks) instead of tucked in the tray
}) {
  const [open, setOpen] = useState(false);
  const o = row.option;
  const mine = me ? votes.find(x => x.option_id === o.id && x.person === me)?.answer : undefined;
  // someone this phone votes for cast their own, different vote — theirs stands
  const splits = people.slice(1).map(p => votes.find(x => x.option_id === o.id && x.person === p))
    .filter((x): x is Vote => !!x && x.cast_by === x.person && x.answer !== mine);
  const word = { y: 'Yes', m: 'Maybe', n: 'No' } as const;
  return (
    <section className={`opt ${lead ? 'lead' : ''}`} aria-label={`${dayLabel(o.date)}, ${timeLabel(o.time)}`}>
      <div className="top">
        <div className="d"><b>{dayLabel(o.date)}{lead && <span className="lead-tag">Leading</span>}</b><span>{timeLabel(o.time)}{o.time ? '' : ' · any time that day'}</span></div>
        <div className={`cnt ${row.clears ? 'clear' : ''}`}><Dots roster={roster} inTeams={row.teamsIn} maybeTeams={row.teamsMaybe} /><span className="num">{row.teamsIn.length} of {roster.teams.length} teams</span></div>
      </div>
      {onVote && me && (
        <div className="ans" role="group" aria-label={`Your answer for ${dayLabel(o.date)}`}>
          {(['y', 'm', 'n'] as Answer[]).map(a => (
            <button key={a} type="button" className={mine === a ? a : ''} aria-pressed={mine === a} disabled={busy} onClick={() => onVote(a)}>{word[a]}</button>
          ))}
        </div>
      )}
      {pickLabel && <div style={{ padding: '12px 14px 0' }}><button type="button" className="cta sm" style={{ width: '100%' }} disabled={busy} onClick={onLock}>{pickLabel}</button></div>}
      {splits.map(s => (
        <div key={s.person} className="split"><span>{s.person}’s own vote is <b>{word[s.answer]}</b> — it stays.</span></div>
      ))}
      <button type="button" className="more" aria-expanded={open} onClick={() => setOpen(x => !x)}>
        <span className="num">{row.yes.length} yes · {row.maybe.length} maybe · {row.no.length} no</span><Chev />
      </button>
      {open && (
        <div className="tray">
          <VoteTray optionId={o.id} teamsIn={row.teamsIn} votes={votes} roster={roster} />
          {canLock && !pickLabel && <button type="button" className="ghost" style={{ marginTop: 12 }} disabled={busy} onClick={onLock}>{lockLabel}</button>}
        </div>
      )}
    </section>
  );
}

/** Everyone's answer for one night, team by team ("by Kenny" when someone voted for them). */
function VoteTray({ optionId, teamsIn, votes, roster }: { optionId: string; teamsIn: string[]; votes: Vote[]; roster: Roster }) {
  const word = { y: 'Yes', m: 'Maybe', n: 'No' } as const;
  return (<>
    {roster.teams.map((t, i) => (
      <div key={t} className="tteam">
        <div className="th"><span className="dots"><i style={{ background: colorFor(t, i), borderColor: colorFor(t, i) }} /></span>{t}{teamsIn.includes(t) && <em>In</em>}</div>
        <div className="ps">
          {roster.voters.filter(x => x.team === t).map(p => {
            const vt = votes.find(x => x.option_id === optionId && x.person === p.name);
            return (
              <span key={p.name} className="pchip">{p.name} <b className={vt?.answer ?? 'q'}>{vt ? word[vt.answer] : 'no vote'}</b>
                {vt && vt.cast_by !== p.name && <small>by {vt.cast_by}</small>}</span>
            );
          })}
        </div>
      </div>
    ))}
  </>);
}

function AddNight({ v, busy, onAdd, onCancel }: { v: V; busy: boolean; onAdd: (o: { date: string; time: string | null }) => void; onCancel: () => void }) {
  const dueDay = v.deadline ? todayET(new Date(v.deadline)) : todayET();
  const [date, setDate] = useState(addDays(dueDay, 1));
  const [time, setTime] = useState<string | null>('19:00');
  return (
    <section className="card">
      <h3 className="eyebrow">Add a night</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 10, marginTop: 12 }}>
        <label className="field">Date<input type="date" value={date} min={addDays(dueDay, 1)} onChange={e => setDate(e.target.value)} /></label>
        <label className="field">Time<TimeSelect wide value={time} onChange={setTime} label="Time" /></label>
      </div>
      <p className="note" style={{ marginTop: 8 }}>Has to be after the vote deadline.</p>
      <div className="row2" style={{ marginTop: 12 }}>
        <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="cta sm" disabled={busy || !date} onClick={() => onAdd({ date, time })}>Add it</button>
      </div>
    </section>
  );
}

/* ── poll closed, nothing cleared the bar ────────────────────────────── */

function Closed({ v, votes, roster, bar, canLock, busy, act, onReopen, onAdd, onStart }: {
  v: V; votes: Vote[]; roster: Roster; bar: number; canLock: boolean; busy: boolean; act: Act; onReopen: () => void; onAdd: () => void; onStart: () => void;
}) {
  const today = todayET();
  const t = tally(v.options.filter(o => o.date >= today), votes, roster);
  const top = topNights(t);
  const missed = waitingOn(v.options, votes, roster);
  const voted = roster.voters.length - missed.length;
  const lock = (o: ViewingOption, anyway: boolean) => {
    if (sure(`Lock ${dayLabel(o.date)}${o.time ? ` at ${timeLabel(o.time)}` : ''}${anyway ? ' anyway' : ''}`)) act('lock', { option_id: o.id }, `Set: ${dayLabel(o.date)}.`);
  };
  // at least one night cleared the bar, but it wasn't a clean sweep (people didn't vote, or a tie): someone picks
  if (top.length) return (<>
    <section className="card hi">
      <div className="hrow"><h2 className="eyebrow">Next Survivor night</h2><span className="pill"><i />Votes are in</span></div>
      <h2 className="title">{canLock ? 'Pick the night' : `${v.created_by} picks the night`}</h2>
      <p className="lede">{leadLine(top, roster.teams.length)} · {voted} of {roster.voters.length} voted</p>
      {missed.length > 0 && <p className="note" style={{ marginTop: 8 }}>Didn’t vote: <b style={{ color: 'var(--text)' }}>{and(missed)}</b></p>}
      {!canLock && <p className="note" style={{ marginTop: 8 }}>It didn’t lock itself because {missed.length ? 'not everyone voted' : 'no single night was ahead'}.</p>}
    </section>
    {t.map(row => (
      <OptionCard key={row.option.id} row={row} votes={votes} roster={roster} people={[]} me={null} lead={top.includes(row) && top.length === 1}
        canLock={canLock} busy={busy}
        pickLabel={canLock && row.clears ? `Pick ${weekdayShort(row.option.date)}${row.option.time ? ` ${timeLabel(row.option.time)}` : ''}` : undefined}
        lockLabel={`Lock ${weekdayShort(row.option.date)} anyway`}
        onLock={() => lock(row.option, !row.clears)} />
    ))}
    <button type="button" className="ghost" onClick={onReopen}>Add more nights &amp; reopen</button>
    <button type="button" className="linkbtn" onClick={onAdd}>We picked a date in person</button>
  </>);
  return (<>
    <section className="card hi">
      <div className="hrow"><h2 className="eyebrow">Next Survivor night</h2><span className="pill grey">Poll closed</span></div>
      <h2 className="title">No night got {bar} of {roster.teams.length} teams</h2>
      <p className="lede">{v.created_by}’s poll · {missed.length === 0 ? `all ${roster.voters.length} voted` : `${voted} of ${roster.voters.length} voted`}</p>
    </section>
    {t.map(row => (
      <OptionCard key={row.option.id} row={row} votes={votes} roster={roster} people={[]} me={null} lead={false} canLock={canLock} busy={busy}
        lockLabel={`Lock ${weekdayShort(row.option.date)} anyway`}
        onLock={() => lock(row.option, true)} />
    ))}
    {canLock && <p className="note">Open a night’s votes to lock it anyway.</p>}
    <button type="button" className="cta sm" onClick={onReopen}>Add more nights &amp; reopen</button>
    <button type="button" className="ghost" onClick={onAdd}>We picked a date in person</button>
    <button type="button" className="linkbtn" onClick={onStart}>Start a fresh poll instead</button>
  </>);
}

/* ── locked ──────────────────────────────────────────────────────────── */

function Locked({ v, votes, roster, bar, places, addresses, who, people, canLock, busy, act, onPick }: {
  v: V; votes: Vote[]; roster: Roster; bar: number; places: string[]; addresses: Record<string, string>; who: Who | null; people: string[]; canLock: boolean; busy: boolean; act: Act; onPick: (w: Who) => void;
}) {
  const date = v.lock_date!;
  const going = goingList(v, votes, roster);
  const coming = going.filter(g => g.s === 'in');
  const unsure = going.filter(g => g.s === 'unsure');
  const cant = going.filter(g => g.s === 'out');
  const inTeams = teamsIn(coming.map(g => g.name), roster);
  const [eps, setEps] = useState(v.episodes);
  useEffect(() => setEps(v.episodes), [v.episodes]);
  const [other, setOther] = useState('');
  const [editPlace, setEditPlace] = useState(false);
  const [time, setTime] = useState<string | null>('19:00');
  const [cal, setCal] = useState(false);
  const [moving, setMoving] = useState(false);
  const [showVotes, setShowVotes] = useState(false);
  const votesRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (showVotes) votesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [showVotes]);
  // why this night: its team count, whether it beat the rest, and turnout (only for a night that came from a poll)
  const why = (() => {
    const w = winnerOption(v);
    if (!w) return null;
    const t = tally(v.options, votes, roster);
    const r = t.find(x => x.option.id === w.id);
    if (!r) return null;
    const best = t.filter(x => x !== r).every(x => x.teamsIn.length < r.teamsIn.length);
    const voted = roster.voters.filter(x => votes.some(y => y.person === x.name)).length;
    return `${r.teamsIn.length} of ${roster.teams.length} teams said Yes${best && t.length > 1 ? ' — the most of any night' : ''} · ${voted} of ${roster.voters.length} voted`;
  })();
  const [newDate, setNewDate] = useState(date);
  const [newTime, setNewTime] = useState<string | null>(v.lock_time);
  const openMove = () => { setNewDate(date); setNewTime(v.lock_time); setMoving(true); };
  const unchanged = newDate === date && newTime === v.lock_time;
  const [, m, d] = date.split('-').map(Number);
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const isPreset = !!v.place && places.some(p => placeKey(p) === placeKey(v.place!));
  const address = addressFor(v.place, addresses);
  const [apple, setApple] = useState(true); // Apple Maps on iPhone/iPad/Mac, Google Maps elsewhere
  useEffect(() => { setApple(/iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent)); }, []);
  const dest = address ?? (v.place && !isPreset ? v.place : null);
  const mine = going.filter(g => people.includes(g.name));
  const anyUnsure = mine.some(g => g.s === 'unsure');
  const tonight = date === todayET();
  const shareText = `Survivor night: ${weekdayLong(date)}, ${dayLabel(date).split(', ')[1]}${v.lock_time ? ` at ${timeLabel(v.lock_time).replace(':00', '')}` : ''}${v.place ? ` at ${v.place}` : ''}.`;
  const names = (gs: typeof going) => gs.map(g => `${g.name}${g.s === 'unsure' && g.said === 'm' ? ' (said Maybe)' : ''}${g.by !== 'vote' && g.by !== g.name ? ` (by ${g.by})` : ''}`).join(', ');

  return (<>
    <section className="card hi">
      <div className="hrow"><h2 className="eyebrow">Next Survivor night</h2><span className="pill"><i />{tonight ? 'Tonight' : 'Set'}</span></div>
      <div className="when">
        <div className="tile" aria-hidden><div>{MON[m - 1]}</div><b className="num">{d}</b></div>
        <div style={{ minWidth: 0 }}>
          <div className="big">{weekdayLong(date)}{v.lock_time ? ` · ${timeLabel(v.lock_time)}` : ''}</div>
          <div className="lede" style={{ marginTop: 3 }}>{v.locked_by === 'auto' ? 'Picked by vote' : v.locked_by ? `Set by ${v.locked_by}` : 'Set'} · {epLabel(v.episodes)}</div>
          {why && <div className="note" style={{ marginTop: 3 }}>{why}</div>}
          <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 14 }}>
            {v.options.length > 0 && <button type="button" className="linkbtn" style={{ paddingBottom: 0 }} aria-expanded={showVotes} onClick={() => setShowVotes(x => !x)}>{showVotes ? 'Hide the votes' : 'See the votes'}</button>}
            {canLock && !moving && <button type="button" className="linkbtn" style={{ paddingBottom: 0 }} onClick={openMove}>Change date or time</button>}
          </div>
        </div>
      </div>

      {showVotes && v.options.length > 0 && (() => {
        const t = tally(v.options, votes, roster);
        const picked = winnerOption(v);
        const missed = roster.voters.map(x => x.name).filter(n => !votes.some(x => x.person === n));
        return (
          <div ref={votesRef} className="box" aria-label="How everyone voted" style={{ scrollMarginTop: 12 }}>
            <div className="hrow"><div className="t">How everyone voted</div><span className="note">needed {bar} of {roster.teams.length} teams</span></div>
            <div className="s">{v.created_by}’s poll · tap a night to see who said what.</div>
            <NightRows t={t} votes={votes} roster={roster} me={who?.me ?? null} tag={(row) => (picked && row.option.id === picked.id ? 'Picked' : null)} />
            {missed.length > 0 && <div className="s" style={{ marginTop: 10 }}>Didn’t vote: <b style={{ color: 'var(--text)' }}>{and(missed)}</b></div>}
          </div>
        );
      })()}

      {moving && (
        <div className="box">
          <div className="t">Move it</div>
          <div className="s">Everyone sees the new date, and subscribed calendars update. On a new day, anyone who said they can’t make it goes back to “not sure”.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 10, marginTop: 12 }}>
            <label className="field">Date<input type="date" value={newDate} min={todayET()} onChange={e => setNewDate(e.target.value)} /></label>
            <label className="field">Time<TimeSelect wide value={newTime} onChange={setNewTime} label="Time" /></label>
          </div>
          <div className="row2" style={{ marginTop: 12 }}>
            <button type="button" className="ghost" onClick={() => setMoving(false)}>Never mind</button>
            <button type="button" className="cta sm" disabled={busy || !newDate || unchanged}
              onClick={async () => { if (await act('reschedule', { date: newDate, time: newTime }, `Moved to ${dayLabel(newDate)}.`)) setMoving(false); }}>Move it</button>
          </div>
        </div>
      )}

      {!v.lock_time && !moving && (
        <div className="box">
          <div className="t">What time?</div>
          <div className="s">No start time yet.</div>
          <div className="chips"><TimeSelect value={time} onChange={setTime} allowTbd={false} label="Start time" />
            <button type="button" className="chipbtn" disabled={busy || !time} onClick={() => act('set_time', { time }, 'Time set.')}>Set time</button></div>
        </div>
      )}

      <div className="box">
        {v.place && !editPlace ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flex: 'none' }}><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="t">At {v.place}</div>
              {address && <div className="s" style={{ overflowWrap: 'anywhere' }}>{address}</div>}
              {dest && <a className="s" style={{ display: 'inline-block', textDecoration: 'underline', color: 'var(--accent)', fontWeight: 700, marginTop: 2 }} href={directionsUrl(dest, apple)} target="_blank" rel="noreferrer">Get directions</a>}
            </div>
            <button type="button" className="chipbtn" onClick={() => setEditPlace(true)}>Change</button>
          </div>
        ) : (<>
          <div className="t">Where is it?</div>
          <div className="s">Anyone can set it.</div>
          <div className="chips">
            {places.map(p => <button key={p} type="button" className="tog" disabled={busy} onClick={async () => { if (await act('set_place', { place: p }, 'Where is set.')) setEditPlace(false); }}>{p}</button>)}
          </div>
          <div className="inrow">
            <input type="text" placeholder="Somewhere else…" value={other} onChange={e => setOther(e.target.value)} aria-label="Somewhere else" />
            <button type="button" disabled={busy || !other.trim()} onClick={async () => { if (await act('set_place', { place: other }, 'Where is set.')) { setOther(''); setEditPlace(false); } }}>Set</button>
          </div>
          {editPlace && <button type="button" className="linkbtn" onClick={() => setEditPlace(false)}>Keep {v.place}</button>}
        </>)}
      </div>

      {canLock && (
        <div style={{ marginTop: 14 }}>
          <Stepper label="Episodes" value={eps} disabled={busy} onChange={(n) => { setEps(n); act('set_episodes', { episodes: n }); }} />
        </div>
      )}

      {/* who's coming: starts from the poll (Yes → coming, No → can't make it, Maybe / no vote → not sure) */}
      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Dots roster={roster} inTeams={inTeams} />
        <span className="num" style={{ fontWeight: 700, color: inTeams.length >= bar ? 'var(--text)' : 'var(--neg)' }}>
          {inTeams.length} of {roster.teams.length} teams · {coming.length} coming{unsure.length ? ` · ${unsure.length} not sure` : ''}
        </span>
      </div>

      {who && mine.length > 0 && (
        <div className="box" style={anyUnsure ? { border: '1.5px solid var(--accent)', background: 'rgba(245,158,11,.08)' } : undefined}>
          <div className="t">{mine.length > 1 ? 'Who’s coming from this phone?' : mine[0].s === 'in' ? 'You’re in ✓' : mine[0].s === 'out' ? 'You can’t make it' : 'Are you coming?'}</div>
          {mine.map(g => {
            const ownElsewhere = g.name !== who.me && g.by === g.name; // they answered on their own phone — theirs stands
            const set = (to: Going) => act('rsvp', { people: [g.name], status: to });
            return (
              <div key={g.name} style={{ marginTop: 10 }}>
                {mine.length > 1 && <div className="s" style={{ marginBottom: 6, fontWeight: 700, color: 'var(--text)' }}>{g.name}</div>}
                <div className="ans" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))', padding: 0 }} role="group" aria-label={`${g.name}: coming?`}>
                  <button type="button" className={g.s === 'in' ? 'in' : ''} aria-pressed={g.s === 'in'} disabled={busy || ownElsewhere} onClick={() => set('in')}>{g.s === 'in' && <Check />}I’m in</button>
                  <button type="button" className={g.s === 'out' ? 'n' : ''} aria-pressed={g.s === 'out'} disabled={busy || ownElsewhere} onClick={() => set('out')}>{g.s === 'out' && <Check />}Can’t make it</button>
                </div>
                <div className="s" style={{ marginTop: 6 }}>
                  {ownElsewhere ? `${g.name} answered on their own phone.`
                    : g.s === 'unsure' ? (g.said === 'm' ? `${g.name === who.me ? 'You' : g.name} said Maybe in the poll — let everyone know.` : 'Not answered yet.')
                      : g.by !== 'vote' && g.by !== g.name ? `${g.by} answered for ${g.name}.`
                        : g.by === 'vote' && g.said ? `From ${g.name === who.me ? 'your' : `${g.name}’s`} poll answer (${g.said === 'y' ? 'Yes' : 'No'}) — change it any time.` : 'Change it any time.'}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!who && <div style={{ marginTop: 14 }}><WhoInline roster={roster} who={who} onPick={onPick} verb="answering" /></div>}

      <div className="note" style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {coming.length > 0 && <span><b style={{ color: 'var(--text)' }}>Coming:</b> {names(coming)}</span>}
        {unsure.length > 0 && <span><b style={{ color: 'var(--gold)' }}>Not sure:</b> {names(unsure)}</span>}
        {cant.length > 0 && <span><b style={{ color: 'var(--neg)' }}>Can’t make it:</b> {names(cant)}</span>}
      </div>

      <button type="button" className="ghost" style={{ marginTop: 14 }} aria-expanded={cal} onClick={() => setCal(x => !x)}>Add to calendar</button>
      {cal && <CalendarBox oneOff />}
    </section>
    <ShareLink text={shareText} />
    {canLock && <button type="button" className="linkbtn danger" onClick={() => { if (confirm(`Cancel ${dayLabel(date)} for everyone?`)) act('cancel', {}, 'Cancelled.'); }}>Cancel this Survivor night</button>}
  </>);
}

/* ── calendar: subscribe once (updates itself) or just this night ──────── */

function useCalLinks() {
  const [env, setEnv] = useState({ host: 'survivor-dash.vercel.app', apple: true, subscribed: false });
  useEffect(() => {
    setEnv({ host: window.location.host, apple: /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent), subscribed: ls.get(CAL_KEY) === '1' });
  }, []);
  const webcal = `webcal://${env.host}/calendar.ics`;
  const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;
  const mark = () => { ls.set(CAL_KEY, '1'); setEnv(e => ({ ...e, subscribed: true })); };
  return { ...env, webcal, google, mark };
}

function CalendarBox({ oneOff }: { oneOff?: boolean }) {
  const c = useCalLinks();
  const [primary, other] = c.apple
    ? [{ href: c.webcal, label: 'Subscribe in Calendar' }, { href: c.google, label: 'Google instead' }]
    : [{ href: c.google, label: 'Subscribe in Google Calendar' }, { href: c.webcal, label: 'Apple / Outlook' }];
  return (
    <div className="box" style={{ background: 'var(--sunk)', border: '1px solid var(--line)' }}>
      <div className="t">{c.subscribed ? 'You’re subscribed on this phone' : 'Subscribe once — it keeps itself up to date'}</div>
      <div className="s">Every Survivor night lands in your calendar on its own. If a night moves, gets a time or a place, or is cancelled, your calendar updates — nothing to delete or re-add.{c.apple ? '' : ' Google checks for changes every few hours.'}</div>
      <div className="row2" style={{ marginTop: 12 }}>
        <a className="cta sm" href={primary.href} target="_blank" rel="noreferrer" onClick={c.mark}>{c.subscribed ? 'Subscribe again' : primary.label}</a>
        <a className="ghost" href={other.href} target="_blank" rel="noreferrer" onClick={c.mark} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>{other.label}</a>
      </div>
      {oneOff && <a className="linkbtn" style={{ display: 'inline-block', marginTop: 8 }} href="/api/viewing/ics">Just this night (won’t update)</a>}
    </div>
  );
}

function CalendarFooter() {
  const [open, setOpen] = useState(false);
  return (<>
    <p className="note" style={{ textAlign: 'center' }}>
      📅 Get every Survivor night in your calendar · <button type="button" className="linkbtn" aria-expanded={open} onClick={() => setOpen(x => !x)}>{open ? 'Hide' : 'Subscribe'}</button>
    </p>
    {open && <CalendarBox />}
  </>);
}

/* ── start a poll / reopen ───────────────────────────────────────────── */

function PollForm({ mode, busy, existing, episodes, needWho, onSubmit }: {
  mode: 'start' | 'reopen'; busy: boolean; existing: ViewingOption[]; episodes: number; needWho?: boolean;
  onSubmit: (p: { options: { date: string; time: string | null }[]; deadline: string; episodes: number }) => void;
}) {
  const today = todayET();
  const [sel, setSel] = useState<Record<string, (string | null)[]>>({});
  const [eps, setEps] = useState(episodes);
  const [due, setDue] = useState<string | null>(null);

  // 5 weeks starting this Sunday; tomorrow on are pickable
  const start = addDays(today, -new Date(today + 'T12:00:00Z').getUTCDay());
  const days = Array.from({ length: 35 }, (_, i) => addDays(start, i));
  const taken = new Set(existing.map(o => o.date));
  const picked = Object.keys(sel).sort();
  const options = picked.flatMap(dt => sel[dt].map(time => ({ date: dt, time })));

  // votes are due at 9 PM on a day before the first new night (today only if it's not evening yet)
  const first = picked[0];
  const earliest = hourET() < 20 ? today : addDays(today, 1);
  const dueChoices: string[] = [];
  if (first) for (let d = earliest; d < first && dueChoices.length < 6; d = addDays(d, 1)) dueChoices.push(d);
  const dflt = dueChoices.find(d => d >= addDays(today, 2)) ?? dueChoices[dueChoices.length - 1] ?? null;
  const dueDay = due && dueChoices.includes(due) ? due : dflt;
  // reopening: nights already on the poll that fall on or before the new deadline get dropped (server does the same)
  const dropped = dueDay ? existing.filter(o => o.date >= today && o.date <= dueDay) : [];

  const toggleDay = (d: string) => setSel(s => { const n = { ...s }; if (n[d]) delete n[d]; else n[d] = ['19:00']; return n; });
  const setTime = (d: string, i: number, t: string | null) => setSel(s => ({ ...s, [d]: s[d].map((x, j) => (j === i ? t : x)) }));
  // next time on a day: the first usual start time not already on it
  const addTime = (d: string) => setSel(s => ({ ...s, [d]: [...s[d], ['19:00', '14:00', '17:00', '20:00', '12:00', ...TIMES].find(t => !s[d].includes(t)) ?? '19:00'] }));
  const rmTime = (d: string, i: number) => setSel(s => ({ ...s, [d]: s[d].filter((_, j) => j !== i) }));
  const dupes = picked.some(d => new Set(sel[d]).size !== sel[d].length);

  return (<>
    <div>
      <h2 className="title" style={{ marginTop: 4 }}>{mode === 'start' ? 'Which nights could work?' : 'Add more nights'}</h2>
      <p className="lede">Tap the days. Each one can have one or more start times (up to {MAX_TIMES_PER_DAY}), or “Time TBD”. Where gets decided once a night locks.</p>
    </div>

    {mode === 'start' && <Stepper label="Episodes to watch" value={eps} onChange={setEps} />}
    {mode === 'start' && <p className="note" style={{ marginTop: -6 }}>A starting guess — it can be changed when the night locks.</p>}

    <section className="card" aria-label="Pick days">
      <div className="hrow"><h3 className="eyebrow">Days</h3><span className="note num">{picked.length} day{picked.length === 1 ? '' : 's'} · {options.length} option{options.length === 1 ? '' : 's'}</span></div>
      <div className="cal" style={{ marginTop: 12 }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x, i) => <span key={i} className="h" aria-hidden>{x}</span>)}
        {days.map((d, i) => {
          const [, mm, dd] = d.split('-').map(Number);
          const off = d <= today;
          const showMonth = i === 0 || dd === 1;
          return (
            <button key={d} type="button" disabled={off} aria-pressed={!!sel[d]} className={taken.has(d) ? 'has' : ''}
              aria-label={`${dayLabel(d)}${taken.has(d) ? ' (already on the poll)' : ''}`} onClick={() => toggleDay(d)}>
              {showMonth && <small>{['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][mm - 1]}</small>}
              <span className="num">{dd}</span>
            </button>
          );
        })}
      </div>
      {taken.size > 0 && <p className="note" style={{ marginTop: 10 }}>Outlined days are already on the poll.</p>}
    </section>

    {picked.length > 0 && (
      <section className="card" aria-label="Times">
        <h3 className="eyebrow">Times</h3>
        <div style={{ marginTop: 4 }}>
          {picked.map(d => (
            <div key={d} className="trow">
              <b>{dayLabel(d)}</b>
              <div className="ts">
              {sel[d].map((t, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <TimeSelect value={t} allowTbd={sel[d].length === 1} label={`${dayLabel(d)} time ${i + 1}`} onChange={x => setTime(d, i, x)} />
                  {sel[d].length > 1 && <button type="button" className="x" aria-label={`Remove ${timeLabel(t)} on ${dayLabel(d)}`} onClick={() => rmTime(d, i)}>×</button>}
                </span>
              ))}
              {sel[d].length < MAX_TIMES_PER_DAY && sel[d][0] !== null && <button type="button" className="chipbtn" style={{ borderStyle: 'dashed' }} onClick={() => addTime(d)}>+ time</button>}
              </div>
            </div>
          ))}
        </div>
        {dupes && <p className="note" style={{ color: 'var(--neg)' }}>The same time is on one day twice — change or remove one.</p>}
      </section>
    )}

    {picked.length > 0 && (
      <section className="card" aria-label="Votes due">
        <h3 className="eyebrow">Votes due</h3>
        {dueChoices.length ? (
          <div className="due" role="group" aria-label="Votes due" style={{ marginTop: 12 }}>
            {dueChoices.map(d => (
              <button key={d} type="button" aria-pressed={d === dueDay} onClick={() => setDue(d)}>
                <b>{d === today ? 'Tonight' : dayLabel(d)}</b><span>9 PM</span>
              </button>
            ))}
          </div>
        ) : <p className="note" style={{ marginTop: 10, color: 'var(--neg)' }}>The first night is too soon for a vote — pick a later night, or add the date directly.</p>}
        <p className="note" style={{ marginTop: 10 }}>Has to be before the first night. Closes early once everyone has voted; anyone missing gets a nudge the evening before.</p>
        {dropped.length > 0 && <p className="note" style={{ marginTop: 8, color: 'var(--gold)' }}>
          {dropped.map(o => `${dayLabel(o.date)}${o.time ? ` · ${timeLabel(o.time)}` : ''}`).join(', ')} {dropped.length === 1 ? 'comes' : 'come'} off the poll — {dropped.length === 1 ? 'it’s' : 'they’re'} on or before that deadline.
        </p>}
      </section>
    )}

    {needWho && <p className="note" style={{ textAlign: 'center', color: 'var(--gold)' }}>Tap your name at the top first.</p>}
    <button type="button" className="cta" disabled={busy || needWho || !options.length || !dueDay || dupes}
      onClick={() => dueDay && onSubmit({ options, deadline: dueDay, episodes: eps })}>
      {mode === 'start' ? 'Start the poll' : 'Reopen the poll'}
    </button>
  </>);
}

/* ── already decided → lock a date directly ───────────────────────────── */

function AddDateForm({ busy, places, needWho, onSubmit }: { busy: boolean; places: string[]; needWho?: boolean; onSubmit: (p: { date: string; time: string | null; place: string | null; episodes: number }) => void }) {
  const today = todayET();
  const [date, setDate] = useState(addDays(today, 1));
  const [time, setTime] = useState<string | null>('19:00');
  const [place, setPlace] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const [eps, setEps] = useState(2);
  const isOther = place === '__other';
  return (<>
    <div>
      <h2 className="title" style={{ marginTop: 4 }}>Already decided?</h2>
      <p className="lede">Picked a night in person or over text? Put it in and it’s set — no poll. Everyone starts as coming and can say if they can’t make it. If a poll closed without a winner, this replaces it.</p>
    </div>
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 10 }}>
        <label className="field">Date<input type="date" value={date} min={today} onChange={e => setDate(e.target.value)} /></label>
        <label className="field">Time<TimeSelect wide value={time} onChange={setTime} label="Time" /></label>
      </div>
      <div>
        <div className="field inl">Where <span>· optional, can set later</span></div>
        <div className="chips" style={{ marginTop: 8 }}>
          {[...places, 'Somewhere else'].map(p => {
            const val = p === 'Somewhere else' ? '__other' : p;
            return <button key={p} type="button" className="tog" aria-pressed={place === val} onClick={() => setPlace(x => (x === val ? null : val))}>{p}</button>;
          })}
        </div>
        {isOther && <input type="text" style={{ marginTop: 10 }} placeholder="Where?" value={other} onChange={e => setOther(e.target.value)} aria-label="Where" />}
      </div>
      <Stepper label="Episodes to watch" value={eps} onChange={setEps} />
    </section>
    {needWho && <p className="note" style={{ textAlign: 'center', color: 'var(--gold)' }}>Tap your name at the top first.</p>}
    <button type="button" className="cta" disabled={busy || needWho || !date || (isOther && !other.trim())}
      onClick={() => onSubmit({ date, time, place: isOther ? other.trim() : place, episodes: eps })}>Set it</button>
  </>);
}

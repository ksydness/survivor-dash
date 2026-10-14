// Viewing-night scheduler — server side. Polls, votes and the locked night live in the shared
// bakeoff-drafts Supabase project (tables viewings / viewing_votes, service role only), like the live
// draft. The sheet is only READ (Seasons registry → teams + Voters column); scoring is never touched.
//
// Time-based steps (vote deadline, the evening-before nudge, the morning-of reminder) run in tick(),
// which is safe to call any time: it only does what's due, once. A Supabase pg_cron job calls
// /api/viewing/tick hourly, and every page load runs the deadline check too.

import webpush from 'web-push';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { LEAGUE as BASE_LEAGUE, SUPABASE_URL } from './draftConfig';
import { VAPID_PUBLIC_KEY, PUSH_SUBJECT } from './pushConfig';
import { getSeasons, getDraftData, getPlaces } from './data';
import {
  type Answer, type Roster, type Viewing, type ViewingOption, type ViewingState, type Vote,
  PLACES, addressFor, barFor, buildRoster, tally, waitingOn, attendees, teamsIn, todayET, hourET, etToUtc,
  isYmd, isHhmm, dayLabel, timeLabel, deadlineLabel, epLabel, weekdayLong, optKey,
  DEADLINE_HOUR, NUDGE_LEAD_H, REMINDER_HOUR, MAX_EPISODES, MAX_TIMES_PER_DAY,
} from './viewingModel';

// Preview deployments get their own league so testing never touches the real poll or pings phones.
const LEAGUE = process.env.VERCEL_ENV === 'preview' ? `${BASE_LEAGUE}-preview` : BASE_LEAGUE;
const MEMORY = process.env.VIEWING_DEV_MEMORY === '1' && process.env.NODE_ENV !== 'production';

export function viewingConfigured(): boolean {
  return MEMORY || !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

/* ── store ─────────────────────────────────────────────────────────────── */

type Row = Viewing & { league: string; nudged_at: string | null; reminded_at: string | null; updated_at?: string };
const COLS = 'id,status,created_by,created_at,version,deadline,episodes,options,lock_date,lock_time,locked_at,locked_by,place,drops,nudged_at,reminded_at';

interface Store {
  latest(): Promise<Row | null>;
  lockedRows(): Promise<Row[]>;   // every locked night (calendar feed), newest first
  insert(r: Partial<Row>): Promise<Row>;
  update(id: string, version: number, patch: Partial<Row>): Promise<Row | null>; // null = version conflict
  votes(id: string): Promise<Vote[]>;
  upsertVotes(id: string, vs: Vote[]): Promise<void>;
  subs(): Promise<{ endpoint: string; p256dh: string; auth: string; people: string[] | null }[]>;
  setPeople(endpoint: string, people: string[]): Promise<void>;
  dropSubs(endpoints: string[]): Promise<void>;
}

let admin: SupabaseClient | null = null;
const db = () => (admin ??= createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }));
const must = <T>(r: { data: T; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data; };

const supabaseStore: Store = {
  async latest() {
    return must(await db().from('viewings').select(COLS).eq('league', LEAGUE)
      .in('status', ['polling', 'locked', 'closed']).order('created_at', { ascending: false }).limit(1).maybeSingle()) as Row | null;
  },
  async lockedRows() {
    return must(await db().from('viewings').select(COLS).eq('league', LEAGUE).eq('status', 'locked')
      .order('lock_date', { ascending: false }).limit(30)) as Row[];
  },
  async insert(r) {
    return must(await db().from('viewings').insert({ ...r, league: LEAGUE }).select(COLS).single()) as Row;
  },
  async update(id, version, patch) {
    return must(await db().from('viewings').update({ ...patch, version: version + 1, updated_at: new Date().toISOString() })
      .eq('id', id).eq('version', version).select(COLS).maybeSingle()) as Row | null;
  },
  async votes(id) {
    return must(await db().from('viewing_votes').select('option_id,person,answer,cast_by').eq('viewing_id', id)) as Vote[];
  },
  async upsertVotes(id, vs) {
    if (!vs.length) return;
    must(await db().from('viewing_votes').upsert(vs.map(v => ({ ...v, viewing_id: id, updated_at: new Date().toISOString() }))));
  },
  async subs() {
    return must(await db().from('push_subscriptions').select('endpoint,p256dh,auth,people').eq('league', BASE_LEAGUE)) as
      { endpoint: string; p256dh: string; auth: string; people: string[] | null }[];
  },
  async setPeople(endpoint, people) {
    must(await db().from('push_subscriptions').update({ people }).eq('endpoint', endpoint).eq('league', BASE_LEAGUE));
  },
  async dropSubs(endpoints) {
    if (endpoints.length) must(await db().from('push_subscriptions').delete().in('endpoint', endpoints));
  },
};

// Local development only (VIEWING_DEV_MEMORY=1, never in production): an in-memory stand-in.
const mem = ((globalThis as { __viewingMem?: { rows: Row[]; votes: (Vote & { viewing_id: string })[] } }).__viewingMem ??= { rows: [], votes: [] });
const memoryStore: Store = {
  async latest() { return [...mem.rows].reverse().find(r => ['polling', 'locked', 'closed'].includes(r.status)) ?? null; },
  async lockedRows() { return mem.rows.filter(r => r.status === 'locked').map(r => ({ ...r })); },
  async insert(r) {
    const row = { id: Math.random().toString(36).slice(2), created_at: new Date().toISOString(), version: 0, deadline: null, episodes: 2, options: [],
      lock_date: null, lock_time: null, locked_at: null, locked_by: null, place: null, drops: [], nudged_at: null, reminded_at: null, league: LEAGUE, ...r } as Row;
    mem.rows.push(row); return { ...row };
  },
  async update(id, version, patch) {
    const r = mem.rows.find(x => x.id === id);
    if (!r || r.version !== version) return null;
    Object.assign(r, patch, { version: version + 1 }); return { ...r };
  },
  async votes(id) { return mem.votes.filter(v => v.viewing_id === id).map(({ viewing_id: _, ...v }) => v); },
  async upsertVotes(id, vs) {
    for (const v of vs) {
      const i = mem.votes.findIndex(x => x.viewing_id === id && x.option_id === v.option_id && x.person === v.person);
      if (i >= 0) mem.votes[i] = { ...v, viewing_id: id }; else mem.votes.push({ ...v, viewing_id: id });
    }
  },
  async subs() { return []; },
  async setPeople() { /* no devices locally */ },
  async dropSubs() { /* none */ },
};

const store = (): Store => (MEMORY ? memoryStore : supabaseStore);

/* ── roster (read from the sheet) ──────────────────────────────────────── */

export async function getRoster(fresh = false): Promise<Roster> {
  const seasons = await getSeasons(fresh);
  const cur = seasons.find(s => s.status === 'active' || s.status === 'drafting') ?? seasons[0];
  if (!cur) return { voters: [], teams: [] };
  const teams = cur.teams.length ? cur.teams : (await getDraftData(cur.season, fresh))?.teams ?? [];
  const votersCol = seasons.find(s => s.voters.length)?.voters ?? []; // newest row that lists voters
  return buildRoster(teams, votersCol);
}

/** Everyone in the current season's teams (voters and non-voters) — the "who's this phone for?" list. */
export async function getLeagueNames(): Promise<{ names: string[]; voters: string[] }> {
  const seasons = await getSeasons();
  const cur = seasons.find(s => s.status === 'active' || s.status === 'drafting') ?? seasons[0];
  const teams = cur ? (cur.teams.length ? cur.teams : (await getDraftData(cur.season))?.teams ?? []) : [];
  const names: string[] = [];
  for (const t of teams) for (const n of t.split(/\s*(?:\+|&|,|\band\b)\s*/i).map(x => x.trim()).filter(Boolean)) if (!names.includes(n)) names.push(n);
  return { names, voters: (await getRoster()).voters.map(v => v.name) };
}

/* ── pushes ────────────────────────────────────────────────────────────── */

interface Msg { title: string; body: string; url?: string; tag?: string }

/**
 * Send to the voters' devices (or only the ones `pick` keeps, with a per-device message). Viewing pings go
 * ONLY to devices tagged with at least one current voter (`push_subscriptions.people`, set when the phone
 * turns notifications on or picks "who's voting"). Non-voters (Anna, Dan) and untagged phones still get
 * score pings (lib/push.ts) but never these.
 */
async function push(msg: Msg | ((people: string[]) => Msg | null), pick?: (people: string[]) => boolean) {
  if (LEAGUE !== BASE_LEAGUE || !process.env.VAPID_PRIVATE_KEY) return; // previews and unconfigured envs stay quiet
  try {
    webpush.setVapidDetails(PUSH_SUBJECT, VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    const voters = new Set((await getRoster()).voters.map(v => v.name.toLowerCase()));
    const subs = await store().subs();
    const dead: string[] = [];
    await Promise.all(subs.map(async s => {
      const people = s.people ?? [];
      if (!people.some(p => voters.has(p.toLowerCase()))) return;
      if (pick && !pick(people)) return;
      const m = typeof msg === 'function' ? msg(people) : msg;
      if (!m) return;
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ url: '/viewing', ...m, title: `🔥 ${m.title}` }), { TTL: 60 * 60 * 12, urgency: 'normal' });
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.endpoint);
      }
    }));
    await store().dropSubs(dead);
  } catch { /* a failed ping never fails the action */ }
}

const nightWord = (v: { lock_date: string | null }) => (v.lock_date ? weekdayLong(v.lock_date) : 'the viewing');
const whenShort = (date: string, time: string | null) => `${dayLabel(date)}${time ? ` at ${timeLabel(time).replace(':00', '')}` : ''}`;

/* ── state ─────────────────────────────────────────────────────────────── */

const toViewing = (r: Row): Viewing => ({
  id: r.id, status: r.status, created_by: r.created_by, created_at: r.created_at, version: r.version, deadline: r.deadline,
  episodes: r.episodes, options: r.options ?? [], lock_date: r.lock_date, lock_time: r.lock_time, locked_at: r.locked_at,
  locked_by: r.locked_by, place: r.place, drops: r.drops ?? [],
});

/** Is this row still the "next viewing"? (a past night or a closed poll whose nights all passed is history) */
function isCurrent(r: Row, today: string): boolean {
  if (r.status === 'locked') return !!r.lock_date && r.lock_date >= today;
  if (r.status === 'closed') return (r.options ?? []).some(o => o.date >= today);
  return r.status === 'polling';
}

async function current(roster: Roster): Promise<{ row: Row | null; votes: Vote[] }> {
  let row = await store().latest();
  if (!row || !isCurrent(row, todayET())) return { row: null, votes: [] };
  let votes = await store().votes(row.id);
  if (row.status === 'polling') {
    const done = await finalizeIfDue(row, votes, roster);
    if (done) { row = done; votes = await store().votes(row.id); }
  }
  return { row, votes };
}

/** Quick picks + addresses for "where": the sheet's Places tab, else the built-in names (no addresses). */
async function placeInfo(fresh = false): Promise<{ places: string[]; addresses: Record<string, string> }> {
  const rows = await getPlaces(fresh);
  if (!rows.length) return { places: PLACES, addresses: {} };
  return { places: rows.map(p => p.name), addresses: Object.fromEntries(rows.filter(p => p.address).map(p => [p.name, p.address])) };
}

/** "At Tony & Karina’s · 92 Barnard Ave. Watertown, MA 02472" (address when the Places tab has one). */
async function placeLine(place: string): Promise<string> {
  const addr = addressFor(place, (await placeInfo()).addresses);
  return addr ? `At ${place} · ${addr}` : `At ${place}`;
}

export async function getViewingState(fresh = false): Promise<ViewingState> {
  const [roster, pi] = await Promise.all([getRoster(fresh), placeInfo(fresh)]);
  const base = { roster, bar: barFor(roster.teams.length), ...pi, now: new Date().toISOString() };
  if (!viewingConfigured()) return { ...base, configured: false, viewing: null, votes: [] };
  const { row, votes } = await current(roster);
  return { ...base, configured: true, viewing: row ? toViewing(row) : null, votes };
}

/** Every locked night (past and upcoming, cancelled ones excluded) + addresses, for the calendar feed. */
export async function getCalendarNights(): Promise<{ nights: Viewing[]; addresses: Record<string, string> }> {
  if (!viewingConfigured()) return { nights: [], addresses: {} };
  const [rows, pi] = await Promise.all([store().lockedRows(), placeInfo()]);
  return { nights: rows.map(toViewing), addresses: pi.addresses };
}

/* ── locking ───────────────────────────────────────────────────────────── */

/** Close a poll when its deadline has passed or every voter has answered every option. */
async function finalizeIfDue(row: Row, votes: Vote[], roster: Roster, force = false): Promise<Row | null> {
  const opts = row.options ?? [];
  const pastDeadline = !!row.deadline && Date.now() >= Date.parse(row.deadline);
  const allIn = opts.length > 0 && waitingOn(opts, votes, roster).length === 0;
  if (!force && !pastDeadline && !allIn) return null;
  const best = tally(opts, votes, roster)[0];
  if (best?.clears) return lockRow(row, best.option.date, best.option.time, 'auto', votes, roster);
  const closed = await store().update(row.id, row.version, { status: 'closed' });
  if (closed) {
    await push({ title: `No night got ${barFor(roster.teams.length)} of ${roster.teams.length} teams`,
      body: 'Add more nights or pick a date — or the poll starter can lock one anyway.', tag: `viewing-${row.id}` });
  }
  return closed;
}

async function lockRow(row: Row, date: string, time: string | null, by: string, votes: Vote[], roster: Roster, episodes?: number): Promise<Row | null> {
  const locked = await store().update(row.id, row.version, {
    status: 'locked', lock_date: date, lock_time: time, locked_at: new Date().toISOString(), locked_by: by,
    ...(episodes ? { episodes } : {}),
  });
  if (locked) {
    const v = toViewing(locked);
    const n = teamsIn(attendees(v, votes, roster), roster).length;
    const missing = [!time && 'what time', !locked.place && 'where'].filter(Boolean).join(' and ');
    await push({
      title: `Locked: ${whenShort(date, time)}`,
      body: `${n} of ${roster.teams.length} teams are in · ${epLabel(locked.episodes)}.${missing ? ` Still open: ${missing} — tap to set it.` : ''}`,
      tag: `viewing-${row.id}`,
    });
  }
  return locked;
}

/* ── actions ───────────────────────────────────────────────────────────── */

export class ViewingError extends Error { constructor(msg: string, public status = 400) { super(msg); } }

export interface ActionBody {
  action: string;
  me?: string;              // who is holding the phone
  as?: string[];            // everyone this phone votes for (me first)
  key?: string;             // commissioner key (optional)
  [k: string]: unknown;
}

const rid = () => Math.random().toString(36).slice(2, 8);
const clampEps = (n: unknown, dflt = 2) => { const x = Math.round(Number(n)); return x >= 1 && x <= MAX_EPISODES ? x : dflt; };

function cleanOptions(raw: unknown, today: string): ViewingOption[] {
  if (!Array.isArray(raw)) throw new ViewingError('Pick at least one night');
  const out: ViewingOption[] = [];
  for (const o of raw) {
    const date = (o as ViewingOption)?.date; const time = (o as ViewingOption)?.time ?? null;
    if (!isYmd(date) || date < today) throw new ViewingError('Nights have to be today or later');
    if (time !== null && !isHhmm(time)) throw new ViewingError('Bad time');
    if (out.some(x => x.date === date && x.time === time)) continue;
    if (out.filter(x => x.date === date).length >= MAX_TIMES_PER_DAY) throw new ViewingError(`Up to ${MAX_TIMES_PER_DAY} times per day`);
    if (time === null && out.some(x => x.date === date)) throw new ViewingError('“Time TBD” can’t share a day with a set time');
    if (time !== null && out.some(x => x.date === date && x.time === null)) throw new ViewingError('“Time TBD” can’t share a day with a set time');
    out.push({ id: rid(), date, time });
  }
  if (!out.length) throw new ViewingError('Pick at least one night');
  if (out.length > 12) throw new ViewingError('That’s a lot of options — 12 at most');
  return out.sort((a, b) => optKey(a).localeCompare(optKey(b)));
}

/** Votes are due at 9 PM Eastern on `day`, which has to be before the first night and still ahead of us. */
function deadlineFor(day: unknown, options: ViewingOption[]): string {
  if (!isYmd(day)) throw new ViewingError('Pick when votes are due');
  const first = options.map(o => o.date).sort()[0];
  if (day >= first) throw new ViewingError('Votes have to be due before the first night');
  const t = etToUtc(day, `${DEADLINE_HOUR}:00`);
  if (t.getTime() <= Date.now() + 30 * 60 * 1000) throw new ViewingError('That deadline has already passed');
  return t.toISOString();
}

function needVoter(name: unknown, roster: Roster): string {
  const v = roster.voters.find(x => x.name === name);
  if (!v) throw new ViewingError('Pick who you are first');
  return v.name;
}

const isCommish = (key: unknown) => !!process.env.COMMISSIONER_KEY && key === process.env.COMMISSIONER_KEY;

export async function act(body: ActionBody): Promise<ViewingState> {
  if (!viewingConfigured()) throw new ViewingError('The scheduler isn’t set up yet', 503);
  const roster = await getRoster();
  const today = todayET();
  const people = (Array.isArray(body.as) ? body.as : []).filter((p): p is string => typeof p === 'string' && roster.voters.some(v => v.name === p));
  const { row, votes } = await current(roster);

  // a row changed under us (another phone acted at the same moment) → one quiet retry
  const save = async (patch: Partial<Row>): Promise<Row> => {
    const r = await store().update(row!.id, row!.version, patch);
    if (!r) throw new ViewingError('Someone else just changed this — try again', 409);
    return r;
  };
  const canLock = () => isCommish(body.key) || (!!row && people.includes(row.created_by));

  switch (body.action) {
    case 'checkkey': { // the hidden commissioner-key field: only says whether the key is right
      if (!isCommish(body.key)) throw new ViewingError('That key didn’t work', 403);
      break;
    }

    case 'whoami': {
      if (typeof body.endpoint === 'string' && body.endpoint.startsWith('https://')) await store().setPeople(body.endpoint, people);
      break;
    }

    case 'start': {
      const me = needVoter(body.me, roster);
      if (row?.status === 'polling') throw new ViewingError('There’s already a poll open — add a night to it instead');
      if (row?.status === 'locked') throw new ViewingError('The next viewing is already set');
      const options = cleanOptions(body.options, today);
      const deadline = deadlineFor(body.deadline, options);
      if (row?.status === 'closed') await save({ status: 'superseded' });
      const created = await store().insert({ status: 'polling', created_by: me, deadline, episodes: clampEps(body.episodes), options });
      const days = new Set(options.map(o => o.date)).size;
      await push({
        title: `${me} started a poll for the next viewing`,
        body: `${options.length} option${options.length === 1 ? '' : 's'}${days !== options.length ? ` over ${days} nights` : ''} · ${epLabel(created.episodes)}. Vote by ${deadlineLabel(deadline)}.`,
        tag: `viewing-${created.id}`,
      });
      break;
    }

    case 'add_option': {
      const me = needVoter(body.me, roster);
      if (row?.status !== 'polling') throw new ViewingError('No poll is open');
      const [o] = cleanOptions([{ date: body.date, time: body.time ?? null }], today);
      const dueDay = row.deadline ? todayET(new Date(row.deadline)) : today;
      if (o.date <= dueDay) throw new ViewingError(`New nights have to be after the vote deadline (${dayLabel(dueDay)})`);
      const all = cleanOptions([...row.options, o], today); // re-validates the per-day rules
      const kept = all.map(x => row.options.find(y => y.date === x.date && y.time === x.time) ?? x);
      if (kept.length === row.options.length) throw new ViewingError('That night is already on the poll');
      await save({ options: kept });
      await push({ title: `${me} added ${whenShort(o.date, o.time)}`, body: 'Tap to vote on it.', tag: `viewing-${row.id}-add` });
      break;
    }

    case 'vote': {
      const me = needVoter(body.me, roster);
      if (row?.status !== 'polling') throw new ViewingError('Voting is closed');
      const opt = row.options.find(o => o.id === body.option_id);
      const answer = body.answer as Answer;
      if (!opt || !['y', 'm', 'n'].includes(answer)) throw new ViewingError('Bad vote');
      const targets = [me, ...people.filter(p => p !== me)];
      // a vote someone cast for themselves always wins over one cast for them
      const write = targets.filter(p => p === me || votes.find(v => v.option_id === opt.id && v.person === p)?.cast_by !== p);
      await store().upsertVotes(row.id, write.map(p => ({ option_id: opt.id, person: p, answer, cast_by: me })));
      const fresh = await store().votes(row.id);
      await finalizeIfDue(row, fresh, roster);
      break;
    }

    case 'lock': {
      if (!row || (row.status !== 'polling' && row.status !== 'closed')) throw new ViewingError('Nothing to lock');
      if (!canLock()) throw new ViewingError('Only whoever started the poll (or the commissioner) can lock it early', 403);
      const opt = row.options.find(o => o.id === body.option_id);
      if (!opt) throw new ViewingError('Pick a night to lock');
      const by = people[0] ?? 'commissioner';
      if (!(await lockRow(row, opt.date, opt.time, by, votes, roster, body.episodes ? clampEps(body.episodes) : undefined))) {
        throw new ViewingError('Someone else just changed this — try again', 409);
      }
      break;
    }

    case 'reopen': {
      if (row?.status !== 'closed') throw new ViewingError('Only a closed poll can be reopened');
      const added = cleanOptions(body.options, today);
      const all = cleanOptions([...row.options.filter(o => o.date >= today), ...added], today);
      const kept = all.map(x => row.options.find(y => y.date === x.date && y.time === x.time) ?? x);
      const fresh = kept.filter(x => !row.options.some(y => y.id === x.id));
      if (!fresh.length) throw new ViewingError('Add at least one new night');
      const deadline = deadlineFor(body.deadline, fresh);
      await save({ status: 'polling', options: kept, deadline, nudged_at: null });
      await push({ title: 'The viewing poll is open again', body: `New nights added. Vote by ${deadlineLabel(deadline)}.`, tag: `viewing-${row.id}` });
      break;
    }

    case 'add_date': {
      const me = needVoter(body.me, roster);
      if (row?.status === 'locked') throw new ViewingError('The next viewing is already set');
      const date = body.date; const time = body.time ?? null;
      if (!isYmd(date) || date < today) throw new ViewingError('Pick a date from today on');
      if (time !== null && !isHhmm(time)) throw new ViewingError('Bad time');
      const place = typeof body.place === 'string' && body.place.trim() ? body.place.trim().slice(0, 80) : null;
      if (row) await save({ status: 'superseded' });
      const created = await store().insert({ status: 'locked', created_by: me, episodes: clampEps(body.episodes), options: [],
        lock_date: date, lock_time: time, locked_at: new Date().toISOString(), locked_by: me, place });
      await push({
        title: `Locked: ${whenShort(date, time)}`,
        body: [place ? `At ${place}` : null, epLabel(created.episodes), !place ? 'Where is still open — tap to set it.' : null].filter(Boolean).join(' · '),
        tag: `viewing-${created.id}`,
      });
      break;
    }

    case 'set_place': {
      if (row?.status !== 'locked') throw new ViewingError('Nothing is locked yet');
      const place = typeof body.place === 'string' ? body.place.trim().slice(0, 80) : '';
      const r = await save({ place: place || null });
      if (place) {
        const addr = addressFor(place, (await placeInfo()).addresses);
        await push({ title: `${whenShort(r.lock_date!, r.lock_time)} is at ${place}`,
          body: addr ? `${addr} — tap for directions.` : 'Tap for the details or to add it to your calendar.', tag: `viewing-${row.id}-where` });
      }
      break;
    }

    case 'set_time': {
      if (row?.status !== 'locked') throw new ViewingError('Nothing is locked yet');
      const time = body.time ?? null;
      if (time !== null && !isHhmm(time)) throw new ViewingError('Bad time');
      const r = await save({ lock_time: time });
      if (time) await push({ title: `${nightWord(r)}’s viewing starts at ${timeLabel(time).replace(':00', '')}`, body: r.place ? `At ${r.place}.` : 'Where is still open — tap to set it.', tag: `viewing-${row.id}-time` });
      break;
    }

    case 'reschedule': { // move a locked night in place instead of cancel + re-add
      if (row?.status !== 'locked' || !row.lock_date) throw new ViewingError('Nothing is locked yet');
      if (!canLock()) throw new ViewingError('Only whoever set it up (or the commissioner) can move it', 403);
      const date = body.date; const time = body.time ?? null;
      if (!isYmd(date) || date < today) throw new ViewingError('Pick a date from today on');
      if (time !== null && !isHhmm(time)) throw new ViewingError('Bad time');
      if (date === row.lock_date && time === row.lock_time) throw new ViewingError('That’s already the plan');
      const newDay = date !== row.lock_date;
      // a new day clears "can't make it" (it was about the old day) and re-arms the morning-of reminder
      await save({ lock_date: date, lock_time: time, ...(newDay ? { drops: [], reminded_at: null } : {}) });
      await push({
        title: `Moved: ${whenShort(date, time)}`,
        body: [`Was ${whenShort(row.lock_date, row.lock_time)}`, row.place ? `At ${row.place}` : null,
          newDay && row.drops.length ? 'Can’t make it? Tap to say so again' : null].filter(Boolean).join(' · '),
        tag: `viewing-${row.id}-moved`,
      });
      break;
    }

    case 'set_episodes': {
      if (!row || (row.status !== 'polling' && row.status !== 'locked')) throw new ViewingError('Nothing to change');
      await save({ episodes: clampEps(body.episodes, row.episodes) });
      break;
    }

    case 'drop': {
      if (row?.status !== 'locked') throw new ViewingError('Nothing is locked yet');
      const who = (Array.isArray(body.people) ? body.people : []).filter((p): p is string => people.includes(p as string));
      if (!who.length) throw new ViewingError('Pick who can’t make it');
      const out = body.out !== false;
      const drops = out ? [...new Set([...row.drops, ...who])] : row.drops.filter(p => !who.includes(p));
      const r = await save({ drops });
      if (out) {
        const n = teamsIn(attendees(toViewing(r), votes, roster), roster).length;
        const bar = barFor(roster.teams.length);
        await push({
          title: `${who.join(' and ')} can’t make it ${nightWord(r)}`,
          body: n >= bar ? `Still on — ${n} of ${roster.teams.length} teams.` : `Down to ${n} of ${roster.teams.length} teams — open the app to decide.`,
          tag: `viewing-${row.id}-drop`,
        });
      }
      break;
    }

    case 'cancel': {
      if (!row) throw new ViewingError('Nothing to cancel');
      if (!canLock()) throw new ViewingError('Only whoever started it (or the commissioner) can cancel', 403);
      await save({ status: 'cancelled' });
      if (row.status === 'locked' && row.lock_date) await push({ title: `${dayLabel(row.lock_date)} is off`, body: 'The next viewing was cancelled.', tag: `viewing-${row.id}` });
      else await push({ title: 'The viewing poll was cancelled', body: 'Someone will start a new one.', tag: `viewing-${row.id}` });
      break;
    }

    default: throw new ViewingError('Unknown action');
  }
  return getViewingState();
}

/* ── tick: deadline, nudge, morning-of reminder ────────────────────────── */

export async function tick(): Promise<Record<string, unknown>> {
  if (!viewingConfigured()) return { skipped: 'not configured' };
  const roster = await getRoster(true);
  const { row, votes } = await current(roster); // runs the deadline check
  if (!row) return { status: 'idle' };
  const now = Date.now();

  if (row.status === 'polling' && row.deadline && !row.nudged_at) {
    const nudgeAt = Date.parse(row.deadline) - NUDGE_LEAD_H * 3600_000;
    const startedLongAgo = now - Date.parse(row.created_at) > 6 * 3600_000; // skip for polls started late
    if (now >= nudgeAt && startedLongAgo) {
      const r = await store().update(row.id, row.version, { nudged_at: new Date().toISOString() });
      if (r) {
        const missing = waitingOn(row.options, votes, roster);
        const inCount = roster.voters.length - missing.length;
        await push(people => {
          const mine = people.filter(p => missing.includes(p));
          if (!mine.length) return null;
          return {
            title: `Voting closes ${deadlineLabel(row.deadline!).replace(/^.*? at /, todayET(new Date(row.deadline!)) === todayET() ? 'tonight at ' : 'tomorrow at ')}`,
            body: `${inCount} of ${roster.voters.length} are in — still waiting on ${mine.join(' and ')}.`,
            tag: `viewing-${row.id}-nudge`,
          };
        }, people => people.some(p => missing.includes(p)));
        return { status: 'nudged', missing };
      }
    }
  }

  if (row.status === 'locked' && row.lock_date === todayET() && !row.reminded_at && hourET() >= REMINDER_HOUR) {
    const r = await store().update(row.id, row.version, { reminded_at: new Date().toISOString() });
    if (r) {
      await push({
        title: `Survivor tonight${row.lock_time ? `, ${timeLabel(row.lock_time).replace(':00', '')}` : ''}`,
        body: [row.place ? (await placeLine(row.place)).replace(/^At /, '') : 'Where: not set yet', epLabel(row.episodes)].join(' · '),
        tag: `viewing-${row.id}-today`,
      });
      return { status: 'reminded' };
    }
  }
  return { status: row.status };
}

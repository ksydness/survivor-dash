// Viewing-night scheduler — shared types + pure helpers (used by the server store and the client page).
// Nothing here touches the sheet's scoring; it only decides which night wins a poll.

export const TZ = 'America/New_York';
export const DEADLINE_HOUR = 21;   // votes are due at 9 PM (Eastern) on the chosen day
export const NUDGE_LEAD_H = 27;    // reminder to non-voters 27h before the deadline (≈ 6 PM the evening before)
export const NUDGE_FROM_HOUR = 9;  // the nudge only goes out 9 AM–9 PM Eastern
export const REMINDER_HOUR = 10;   // morning-of reminder at 10 AM
export const MAX_EPISODES = 4;
export const MAX_TIMES_PER_DAY = 4; // start times one poll day can offer (each is its own option)

export type Answer = 'y' | 'm' | 'n';
export type ViewingStatus = 'polling' | 'locked' | 'closed' | 'cancelled' | 'superseded';

/** One choice in a poll: a day, and a start time ("HH:MM", 24h) or null = time TBD. */
export interface ViewingOption { id: string; date: string; time: string | null }

export interface Vote { option_id: string; person: string; answer: Answer; cast_by: string }

/** Coming / can't make it / not sure — for a set night. */
export type Going = 'in' | 'out' | 'unsure';
/**
 * Someone's answer for a set night. Starts from their poll vote on the winning night (Yes → in, No → out,
 * Maybe / no vote → unsure; a night added directly starts everyone as in) and is written out for every voter
 * when the night is set. `by` = who set it ('vote' = carried over from the poll), `said` = their poll answer,
 * `prev`/`at` let a quick undo skip a second ping.
 */
export interface Rsvp { s: Going; by: string; at: string; said?: Answer | null; prev?: Going }

export interface Viewing {
  id: string;
  status: ViewingStatus;
  created_by: string;
  created_at: string;
  version: number;
  deadline: string | null;       // ISO
  episodes: number;
  options: ViewingOption[];
  lock_date: string | null;      // YYYY-MM-DD
  lock_time: string | null;      // HH:MM or null = TBD
  locked_at: string | null;
  locked_by: string | null;      // a name, or "auto"
  place: string | null;
  drops: string[];                // older nights only — "can't make it" before answers were tracked
  rsvp: Record<string, Rsvp>;
}

export interface Voter { name: string; team: string }
export interface Roster { voters: Voter[]; teams: string[] }

export interface ViewingState {
  configured: boolean;
  roster: Roster;
  viewing: Viewing | null;
  votes: Vote[];
  bar: number;          // teams needed for a night to lock
  places: string[];     // quick picks for "where" (the sheet's Places tab, else PLACES)
  addresses: Record<string, string>; // place name → street address, from the Places tab
  now: string;
}

/** Fallback quick picks for where the viewing is, used only when the sheet's Places tab can't be read. */
export const PLACES = ['Kenny & Lena’s', 'Tony & Karina’s'];

/** Compare place names loosely: "Tony & Karina’s" = "Tony + Karina's" = "tony and karina's". */
export const placeKey = (s: string) =>
  s.toLowerCase().replace(/[’‘`]/g, "'").replace(/\s*(?:&|\+|\band\b)\s*/g, '+').replace(/\s+/g, ' ').trim();

/** Street address for a place name (loose match), or null. */
export function addressFor(place: string | null, addresses: Record<string, string>): string | null {
  if (!place) return null;
  const k = placeKey(place);
  for (const [name, addr] of Object.entries(addresses)) if (addr && placeKey(name) === k) return addr;
  return null;
}

/** Turn-by-turn link: Apple Maps on iPhone/iPad/Mac, Google Maps everywhere else. */
export const directionsUrl = (dest: string, apple: boolean) => apple
  ? `https://maps.apple.com/?daddr=${encodeURIComponent(dest)}`
  : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;

/** Teams needed: 3 of 4 (75%, at least 1). */
export const barFor = (teamCount: number) => Math.max(1, Math.ceil(teamCount * 0.75));

/* ── time zone helpers (all scheduling is Eastern) ── */

function etParts(d: Date) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(d)) p[x.type] = x.value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, min: +p.minute, ymd: `${p.year}-${p.month}-${p.day}` };
}
export const todayET = (now = new Date()) => etParts(now).ymd;
export const hourET = (now = new Date()) => etParts(now).h;

/** Eastern wall-clock date + time → UTC Date (DST-safe). */
export function etToUtc(ymd: string, hhmm = '00:00'): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const off = (t: number) => { const p = etParts(new Date(t)); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - t; };
  let t = guess - off(guess);
  const o2 = off(t);
  if (guess - o2 !== t) t = guess - o2;
  return new Date(t);
}

export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
// round-trips through Date so impossible days like 2026-02-30 are rejected (Date.parse would roll them over)
export const isYmd = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s))
  && new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) === s;
export const isHhmm = (s: unknown): s is string => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dow = (ymd: string) => new Date(ymd + 'T12:00:00Z').getUTCDay();
/** "Sat, Oct 24" */
export function dayLabel(ymd: string): string {
  const [, m, d] = ymd.split('-').map(Number);
  return `${DOW[dow(ymd)]}, ${MON[m - 1]} ${d}`;
}
export const weekdayLong = (ymd: string) => DOW_LONG[dow(ymd)];
export const weekdayShort = (ymd: string) => DOW[dow(ymd)];
/** "7:00 PM" / "Time TBD" */
export function timeLabel(t: string | null): string {
  if (!t) return 'Time TBD';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
/** "7 PM" / "7:30 PM" */
export function shortTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}${m ? ':' + String(m).padStart(2, '0') : ''} ${h >= 12 ? 'PM' : 'AM'}`;
}
export const optLabel = (o: { date: string; time: string | null }) => `${dayLabel(o.date)} · ${timeLabel(o.time)}`;
/** e.g. "Sun, Oct 18 at 9 PM" */
export function deadlineLabel(iso: string): string {
  const p = etParts(new Date(iso));
  return `${dayLabel(p.ymd)} at ${shortTime(`${String(p.h).padStart(2, '0')}:${String(p.min).padStart(2, '0')}`)}`;
}
export const epLabel = (n: number) => `${n} episode${n === 1 ? '' : 's'}`;

/** Sort key: date, then time (TBD last within a day). */
export const optKey = (o: { date: string; time: string | null }) => `${o.date} ${o.time ?? '99:99'}`;

/* ── roster ── */

/** Voters from the registry (Voters column), else every first name in the team names ("Kenny + Lena"). */
export function buildRoster(teams: string[], votersCol: string[]): Roster {
  const members = (t: string) => t.split(/\s*(?:\+|&|,|\band\b)\s*/i).map(x => x.trim()).filter(Boolean);
  const teamOf = (name: string) => teams.find(t => members(t).some(m => m.toLowerCase() === name.toLowerCase()));
  const names = votersCol.length ? votersCol : teams.flatMap(members);
  const voters: Voter[] = [];
  for (const n of names) {
    const team = teamOf(n);
    if (team && !voters.some(v => v.name.toLowerCase() === n.toLowerCase())) voters.push({ name: n, team });
  }
  // keep team order, then the order names appear within each team
  voters.sort((a, b) => teams.indexOf(a.team) - teams.indexOf(b.team) || members(a.team).indexOf(a.name) - members(b.team).indexOf(b.name));
  return { voters, teams: teams.filter(t => voters.some(v => v.team === t)) };
}

/* ── tallying ── */

export interface OptionTally {
  option: ViewingOption;
  yes: string[]; maybe: string[]; no: string[];
  teamsIn: string[];
  teamsMaybe: string[];   // teams with no Yes but at least one Maybe — the tiebreak
  rank: number;           // 1 = best
  clears: boolean;        // reaches the bar
}

export function tally(options: ViewingOption[], votes: Vote[], roster: Roster): OptionTally[] {
  const bar = barFor(roster.teams.length);
  const teamOf = new Map(roster.voters.map(v => [v.name, v.team]));
  const rows = options.map(o => {
    const vs = votes.filter(v => v.option_id === o.id && teamOf.has(v.person));
    const pick = (a: Answer) => vs.filter(v => v.answer === a).map(v => v.person);
    const yes = pick('y');
    const maybe = pick('m');
    const teamsIn = roster.teams.filter(t => yes.some(p => teamOf.get(p) === t));
    const teamsMaybe = roster.teams.filter(t => !teamsIn.includes(t) && maybe.some(p => teamOf.get(p) === t));
    return { option: o, yes, maybe, no: pick('n'), teamsIn, teamsMaybe, rank: 0, clears: teamsIn.length >= bar };
  });
  // best = most teams in → then Maybe breaks ties (most teams in-or-maybe) → most Yes → most Maybe → earliest
  const sorted = [...rows].sort((a, b) => b.teamsIn.length - a.teamsIn.length
    || (b.teamsIn.length + b.teamsMaybe.length) - (a.teamsIn.length + a.teamsMaybe.length)
    || b.yes.length - a.yes.length || b.maybe.length - a.maybe.length
    || optKey(a.option).localeCompare(optKey(b.option)));
  sorted.forEach((r, i) => { r.rank = i + 1; });
  return sorted;
}

/** Voters who still haven't answered every option. */
export function waitingOn(options: ViewingOption[], votes: Vote[], roster: Roster): string[] {
  return roster.voters.map(v => v.name).filter(n => options.some(o => !votes.some(v => v.option_id === o.id && v.person === n)));
}

/** The poll option a set night came from (null if it was added directly). */
export function winnerOption(v: Pick<Viewing, 'options' | 'lock_date' | 'lock_time'>): ViewingOption | null {
  return v.options.find(o => o.date === v.lock_date && o.time === v.lock_time) ?? v.options.find(o => o.date === v.lock_date) ?? null;
}

/** Where someone starts on a set night, from their vote on the winning option (directly added → everyone in). */
export function startingRsvp(v: Pick<Viewing, 'options' | 'lock_date' | 'lock_time'>, votes: Vote[], name: string, at: string): Rsvp {
  const w = winnerOption(v);
  if (!w) return { s: 'in', by: 'vote', at, said: null };
  const said = votes.find(x => x.option_id === w.id && x.person === name)?.answer ?? null;
  return { s: said === 'y' ? 'in' : said === 'n' ? 'out' : 'unsure', by: 'vote', at, said };
}

export interface GoingRow { name: string; team: string; s: Going; by: string; said: Answer | null }
/** Every voter's answer for a set night (saved answers; older nights fall back to their poll votes + drops). */
export function goingList(v: Viewing, votes: Vote[], roster: Roster): GoingRow[] {
  return roster.voters.map(({ name, team }) => {
    const r = v.rsvp?.[name] ?? (v.drops.includes(name) ? { s: 'out' as Going, by: name, at: '', said: null } : startingRsvp(v, votes, name, ''));
    return { name, team, s: r.s, by: r.by, said: r.said ?? null };
  });
}

/** Who's coming to a set night. */
export function attendees(v: Viewing, votes: Vote[], roster: Roster): string[] {
  return goingList(v, votes, roster).filter(g => g.s === 'in').map(g => g.name);
}
export function notSure(v: Viewing, votes: Vote[], roster: Roster): string[] {
  return goingList(v, votes, roster).filter(g => g.s === 'unsure').map(g => g.name);
}

/** "Saturday" this week, "Tonight"/"Tomorrow", else "Sat, Oct 31" — for push titles. */
export function nightName(ymd: string, today = todayET()): string {
  if (ymd === today) return 'Tonight';
  if (ymd === addDays(today, 1)) return 'Tomorrow';
  const gap = Math.round((Date.parse(ymd) - Date.parse(today)) / 86_400_000);
  return gap > 0 && gap < 7 ? weekdayLong(ymd) : dayLabel(ymd);
}
/** Same, mid-sentence: "can't make it Saturday" / "tonight" / "on Sat, Oct 31". */
export function nightMid(ymd: string, today = todayET()): string {
  const n = nightName(ymd, today);
  return n === 'Tonight' || n === 'Tomorrow' ? n.toLowerCase() : n.includes(',') ? `on ${n}` : n;
}
export function teamsIn(names: string[], roster: Roster): string[] {
  return roster.teams.filter(t => roster.voters.some(v => v.team === t && names.includes(v.name)));
}

/** One-line summary for link previews (iMessage etc.): what's going on with the next Survivor night. */
export function previewLines(v: Viewing | null): { heading: string; sub: string; detail?: string } {
  if (!v) return { heading: 'Survivor night', sub: 'Nothing planned yet — anyone can start a poll' };
  if (v.status === 'polling' || v.status === 'closed') {
    const days = [...new Set(v.options.map(o => o.date))].sort().map(dayLabel);
    const list = days.length > 3 ? `${days.length} nights to pick from` : days.length <= 1 ? days.join('') : `${days.slice(0, -1).join(', ')} or ${days[days.length - 1]}`;
    if (v.status === 'closed') return { heading: 'Survivor night', sub: 'No night worked yet', detail: list };
    return { heading: 'Vote: next Survivor night', sub: list, detail: v.deadline ? `Vote by ${deadlineLabel(v.deadline)}` : undefined };
  }
  const d = v.lock_date!;
  return {
    heading: 'Survivor night',
    sub: `${weekdayLong(d)}, ${dayLabel(d).split(', ')[1]}${v.lock_time ? ` · ${timeLabel(v.lock_time).replace(':00', '')}` : ''}`,
    detail: v.place ? `At ${v.place}` : undefined,
  };
}

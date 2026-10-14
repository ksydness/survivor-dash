// Viewing-night scheduler — shared types + pure helpers (used by the server store and the client page).
// Nothing here touches the sheet's scoring; it only decides which night wins a poll.

export const TZ = 'America/New_York';
export const DEADLINE_HOUR = 21;   // votes are due at 9 PM (Eastern) on the chosen day
export const NUDGE_LEAD_H = 27;    // reminder to non-voters 27h before the deadline (≈ 6 PM the evening before)
export const REMINDER_HOUR = 10;   // morning-of reminder at 10 AM
export const MAX_EPISODES = 4;
export const MAX_TIMES_PER_DAY = 4; // start times one poll day can offer (each is its own option)

export type Answer = 'y' | 'm' | 'n';
export type ViewingStatus = 'polling' | 'locked' | 'closed' | 'cancelled' | 'superseded';

/** One choice in a poll: a day, and a start time ("HH:MM", 24h) or null = time TBD. */
export interface ViewingOption { id: string; date: string; time: string | null }

export interface Vote { option_id: string; person: string; answer: Answer; cast_by: string }

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
  drops: string[];
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
export const isYmd = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
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
    const teamsIn = roster.teams.filter(t => yes.some(p => teamOf.get(p) === t));
    return { option: o, yes, maybe: pick('m'), no: pick('n'), teamsIn, rank: 0, clears: teamsIn.length >= bar };
  });
  const sorted = [...rows].sort((a, b) => b.teamsIn.length - a.teamsIn.length || b.yes.length - a.yes.length || optKey(a.option).localeCompare(optKey(b.option)));
  sorted.forEach((r, i) => { r.rank = i + 1; });
  return sorted;
}

/** Voters who still haven't answered every option. */
export function waitingOn(options: ViewingOption[], votes: Vote[], roster: Roster): string[] {
  return roster.voters.map(v => v.name).filter(n => options.some(o => !votes.some(v => v.option_id === o.id && v.person === n)));
}

/** Who's coming to a locked night: Yes voters on the winning option (everyone, if it was added directly), minus drops. */
export function attendees(v: Viewing, votes: Vote[], roster: Roster): string[] {
  const winner = v.options.find(o => o.date === v.lock_date && o.time === v.lock_time)
    ?? v.options.find(o => o.date === v.lock_date);
  const base = winner
    ? votes.filter(x => x.option_id === winner.id && x.answer === 'y').map(x => x.person)
    : roster.voters.map(x => x.name);
  return base.filter(n => !v.drops.includes(n) && roster.voters.some(x => x.name === n));
}
export function teamsIn(names: string[], roster: Roster): string[] {
  return roster.teams.filter(t => roster.voters.some(v => v.team === t && names.includes(v.name)));
}

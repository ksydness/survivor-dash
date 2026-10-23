// The situation of the next Survivor night (see GLOSSARY.md): where it stands right now — nothing planned,
// voting, needs a pick, no night worked, or set — and everything that follows from that. Every screen, link
// preview and server step reads this one result instead of re-combining tallies, so the rules live here only.
//
// Pure: never reads the clock (callers pass `today`, Eastern YYYY-MM-DD) or the commissioner key (callers pass
// whether this phone's key checked out). Tested in viewingSituation.test.ts.

import {
  type Answer, type Going, type GoingRow, type Roster, type Viewing, type ViewingOption, type Vote,
  barFor, dayLabel, deadlineLabel, goingList, optKey, shortTime, teamsIn, timeLabel, weekdayLong, weekdayShort, winnerOption,
} from './viewingModel';

export interface SituationInput {
  viewing: Viewing | null;
  votes: Vote[];
  roster: Roster;
  /** Eastern date, YYYY-MM-DD (`todayET(new Date(st.now))` on the client — the server's clock, not the phone's). */
  today: string;
  /** Everyone this phone answers for, the person holding it first. */
  people?: string[];
  /** This phone holds the commissioner key (checked by the server). */
  commissioner?: boolean;
}

/** One night's votes, ranked against the other nights (rank 1 = best). */
export interface NightTally {
  option: ViewingOption;
  yes: string[]; maybe: string[]; no: string[];
  teamsIn: string[];
  teamsMaybe: string[];   // teams with no Yes but at least one Maybe — the tiebreak
  rank: number;
  clears: boolean;        // reaches the bar
}

export interface Preview { heading: string; sub: string; detail?: string }

/** How far one person on this phone has got with the poll. */
export interface MyVotes { name: string; answered: number; total: number; done: boolean }

interface Base {
  teams: number;          // teams in the league
  voters: number;         // voters in the league
  bar: number;            // teams a night needs
  /** Lock / move / cancel / episodes: the starter on their own phone, or the commissioner. */
  mayAct: boolean;
  /** Link-preview lines (iMessage etc.). */
  preview: Preview;
}

interface PollFacts {
  viewing: Viewing;
  /** Ranked best first. */
  nights: NightTally[];
  /** Voters who haven't answered every night yet. */
  waitingOn: string[];
  /** Voters who answered every night. */
  voted: number;
}

export type Situation =
  | (Base & { phase: 'none' })
  | (Base & PollFacts & {
      phase: 'voting';
      everyoneVoted: boolean;
      /** Top night, if anyone has said Yes to it. */
      leading: NightTally | null;
      /** The night that wins outright — only counts once everyone has voted. */
      clearWinner: NightTally | null;
      mine: MyVotes[];
    })
  | (Base & PollFacts & {
      phase: 'needs-pick';
      /** Nights (today on) that cleared the bar with the most teams: 1 = a leader, 2+ = a tie. */
      top: NightTally[];
      /** "Fri 6:30 PM has the most teams (3 of 4)" */
      leadLine: string;
      /** "Fri 6:30 PM has the most teams (3 of 4) · 6 of 8 voted" */
      summary: string;
      /** Why the poll didn't lock itself. */
      didntLock: 'not-everyone-voted' | 'no-single-leader';
    })
  | (Base & PollFacts & { phase: 'no-night' })
  | (Base & {
      phase: 'set';
      viewing: Viewing;
      date: string;
      going: GoingRow[];
      coming: GoingRow[]; unsure: GoingRow[]; out: GoingRow[];
      /** Teams with someone coming. */
      teamsIn: string[];
      /** The poll night it came from (null = added directly). */
      picked: ViewingOption | null;
      /** The poll as it ended, ranked (empty if added directly). */
      nights: NightTally[];
      /** Voters who never answered every night of that poll. */
      waitingOn: string[];
      voted: number;
      /** "3 of 4 teams said Yes — the most of any night · 6 of 8 voted" (null if added directly). */
      why: string | null;
      /** This phone's people, in roster order. */
      mine: GoingRow[];
    });

export type Phase = Situation['phase'];

/* ── internals ───────────────────────────────────────────────────────────────────────── */

function tally(options: ViewingOption[], votes: Vote[], roster: Roster): NightTally[] {
  const bar = barFor(roster.teams.length);
  const teamOf = new Map(roster.voters.map(v => [v.name, v.team]));
  const rows = options.map(o => {
    const vs = votes.filter(v => v.option_id === o.id && teamOf.has(v.person));
    const pick = (a: Answer) => vs.filter(v => v.answer === a).map(v => v.person);
    const yes = pick('y');
    const maybe = pick('m');
    const tIn = roster.teams.filter(t => yes.some(p => teamOf.get(p) === t));
    const tMaybe = roster.teams.filter(t => !tIn.includes(t) && maybe.some(p => teamOf.get(p) === t));
    return { option: o, yes, maybe, no: pick('n'), teamsIn: tIn, teamsMaybe: tMaybe, rank: 0, clears: tIn.length >= bar };
  });
  // best = most teams in → then Maybe breaks ties (most teams in-or-maybe) → most Yes → most Maybe → earliest
  const sorted = [...rows].sort((a, b) => b.teamsIn.length - a.teamsIn.length
    || (b.teamsIn.length + b.teamsMaybe.length) - (a.teamsIn.length + a.teamsMaybe.length)
    || b.yes.length - a.yes.length || b.maybe.length - a.maybe.length
    || optKey(a.option).localeCompare(optKey(b.option)));
  sorted.forEach((r, i) => { r.rank = i + 1; });
  return sorted;
}

/** Clears the bar AND more teams said Yes to it than to any other night. */
function clearWinnerOf(t: NightTally[]): NightTally | null {
  const [a, b] = t;
  return a && a.clears && (!b || a.teamsIn.length > b.teamsIn.length) ? a : null;
}

function topNightsOf(t: NightTally[]): NightTally[] {
  const best = t[0];
  return best?.clears ? t.filter(r => r.teamsIn.length === best.teamsIn.length) : [];
}

function leadLineOf(top: NightTally[], teamCount: number): string {
  if (!top.length) return '';
  const n = `${top[0].teamsIn.length} of ${teamCount}`;
  const lab = (r: NightTally) => `${weekdayShort(r.option.date)}${r.option.time ? ` ${shortTime(r.option.time)}` : ''}`;
  if (top.length === 1) return `${lab(top[0])} has the most teams (${n})`;
  const ls = [...top].sort((a, b) => optKey(a.option).localeCompare(optKey(b.option))).map(lab);
  return `${ls.slice(0, -1).join(', ')} and ${ls[ls.length - 1]} are tied at ${n} teams`;
}

/** "Voted" = answered every night in the poll. */
function waitingOnOf(options: ViewingOption[], votes: Vote[], roster: Roster): string[] {
  return roster.voters.map(v => v.name).filter(n => options.some(o => !votes.some(v => v.option_id === o.id && v.person === n)));
}

function nightsList(options: ViewingOption[]): string {
  const days = [...new Set(options.map(o => o.date))].sort().map(dayLabel);
  return days.length > 3 ? `${days.length} nights to pick from` : days.length <= 1 ? days.join('') : `${days.slice(0, -1).join(', ')} or ${days[days.length - 1]}`;
}

/* ── the situation ───────────────────────────────────────────────────────────────────── */

export function situation({ viewing: v, votes, roster, today, people = [], commissioner = false }: SituationInput): Situation {
  const teams = roster.teams.length;
  const voters = roster.voters.length;
  const bar = barFor(teams);
  const live = v && (v.status === 'polling' || v.status === 'closed' || v.status === 'locked') ? v : null;
  const mayAct = commissioner || (!!live && people[0] === live.created_by);
  const base = { teams, voters, bar, mayAct };

  if (!live) return { ...base, phase: 'none', preview: { heading: 'Survivor night', sub: 'Nothing planned yet — anyone can start a poll' } };

  const waitingOn = waitingOnOf(live.options, votes, roster);
  const voted = voters - waitingOn.length;

  if (live.status === 'polling') {
    const nights = tally(live.options, votes, roster);
    const everyoneVoted = live.options.length > 0 && waitingOn.length === 0;
    const mine = people.map(name => {
      const answered = live.options.filter(o => votes.some(x => x.option_id === o.id && x.person === name)).length;
      return { name, answered, total: live.options.length, done: answered > 0 && answered === live.options.length };
    });
    return {
      ...base, phase: 'voting', viewing: live, nights, waitingOn, voted, everyoneVoted,
      leading: nights[0]?.yes.length ? nights[0] : null,
      clearWinner: everyoneVoted ? clearWinnerOf(nights) : null,
      mine,
      preview: { heading: 'Vote: next Survivor night', sub: nightsList(live.options), detail: live.deadline ? `Vote by ${deadlineLabel(live.deadline)}` : undefined },
    };
  }

  if (live.status === 'closed') {
    // only nights still ahead count — a closed poll whose leading night has passed has nothing left to pick
    const ahead = live.options.filter(o => o.date >= today);
    const nights = tally(ahead, votes, roster);
    const top = topNightsOf(nights);
    const detail = nightsList(ahead);
    if (!top.length) return {
      ...base, phase: 'no-night', viewing: live, nights, waitingOn, voted,
      preview: { heading: 'Survivor night', sub: 'No night worked yet', detail },
    };
    const leadLine = leadLineOf(top, teams);
    return {
      ...base, phase: 'needs-pick', viewing: live, nights, waitingOn, voted, top, leadLine,
      summary: `${leadLine} · ${voted} of ${voters} voted`,
      didntLock: waitingOn.length ? 'not-everyone-voted' : 'no-single-leader',
      preview: { heading: 'Survivor night', sub: `Votes are in — ${live.created_by} picks the night`, detail },
    };
  }

  // set
  const date = live.lock_date!;
  const going = goingList(live, votes, roster);
  const coming = going.filter(g => g.s === 'in');
  const picked = winnerOption(live);
  const nights = live.options.length ? tally(live.options, votes, roster) : [];
  let why: string | null = null;
  if (picked) {
    const r = nights.find(x => x.option.id === picked.id);
    if (r) {
      const best = nights.filter(x => x !== r).every(x => x.teamsIn.length < r.teamsIn.length);
      why = `${r.teamsIn.length} of ${teams} teams said Yes${best && nights.length > 1 ? ' — the most of any night' : ''} · ${voted} of ${voters} voted`;
    }
  }
  const by = (s: Going) => going.filter(g => g.s === s);
  return {
    ...base, phase: 'set', viewing: live, date, going, coming, unsure: by('unsure'), out: by('out'),
    teamsIn: teamsIn(coming.map(g => g.name), roster),
    picked, nights, waitingOn: live.options.length ? waitingOn : [], voted, why,
    mine: going.filter(g => people.includes(g.name)),
    preview: {
      heading: 'Survivor night',
      sub: `${weekdayLong(date)}, ${dayLabel(date).split(', ')[1]}${live.lock_time ? ` · ${timeLabel(live.lock_time).replace(':00', '')}` : ''}`,
      detail: live.place ? `At ${live.place}` : undefined,
    },
  };
}

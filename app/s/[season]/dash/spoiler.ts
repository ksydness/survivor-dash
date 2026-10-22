// Spoiler shield. Kenny sometimes watches (and scores) an episode before everyone else, so a live
// season never shows a phone weeks it hasn't revealed yet. Each phone keeps the last sheet week it
// revealed in a cookie (the server-rendered homepage reads it; the dashboard reads it client-side).
// No cookie yet = everything but the newest scored week, so a first visit never spoils the newest
// week either. Revealing is one tap per week ("Reveal Week 5") with a little splash.
// Final seasons aren't shielded. Nothing is re-scored: the shield is the week stepper's asOf().
// Styles for the reveal strip live in app/RevealSplash.tsx (SHIELD_CSS), shared by homepage + dashboard.
import type { SeasonPayload } from '@/lib/types';
import { asOf, recap, weekLabel } from './model';

export const seenCookie = (season: number) => `survivor-seen-s${season}`;
const YEAR = 60 * 60 * 24 * 365;

/** "5" → 5; 0 = nothing revealed yet; anything else → null (no cookie) */
export function parseSeen(v: string | undefined | null): number | null {
  if (v == null || v === '') return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** client only */
export function readSeen(season: number): number | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${seenCookie(season)}=([^;]*)`));
  return parseSeen(m?.[1]);
}
/** client only — never moves backwards (another tab may have revealed further) */
export function writeSeen(season: number, week: number) {
  if (typeof document === 'undefined') return;
  const cur = readSeen(season);
  if (cur != null && cur >= week) return;
  document.cookie = `${seenCookie(season)}=${week}; path=/; max-age=${YEAR}; samesite=lax`;
}

export interface Shield {
  on: boolean;         // live season with weeks this phone hasn't revealed
  k: number;           // last revealed position in scored_weeks (-1 = none)
  seen: number;        // its sheet week label (0 = none) — what gets written to the cookie
  hidden: number[];    // scored_weeks positions still hidden, oldest first
}

/** where this phone stands; seen = cookie value (null = no cookie) */
export function shieldFor(d: SeasonPayload, seen: number | null): Shield {
  const sw = d.meta.scored_weeks ?? [];
  const last = sw.length - 1;
  if (d.meta.status !== 'active' || !sw.length) return { on: false, k: last, seen: last >= 0 ? weekLabel(d, sw[last]) : 0, hidden: [] };
  let k: number;
  if (seen == null) k = last - 1;  // first visit: hide only the newest week
  else { k = -1; sw.forEach((w, i) => { if (weekLabel(d, w) <= seen) k = i; }); }
  const hidden = sw.map((_, i) => i).filter(i => i > k);
  return { on: hidden.length > 0, k, seen: k >= 0 ? weekLabel(d, sw[k]) : 0, hidden };
}

/**
 * asOf() plus the two cases the shield needs: k = -1 (nothing revealed yet — every week zeroed, nobody out
 * unless their Out cell has no week number) and, at the latest week, a player whose Out week is typed ahead
 * of the scores (Out = 6 while Week 5 is the latest scored) still counts as in.
 */
export function seenAsOf(d: SeasonPayload, k: number): SeasonPayload {
  const sw = d.meta.scored_weeks ?? [];
  if (!sw.length) return d;
  if (k >= sw.length - 1) {
    const last = weekLabel(d, sw[sw.length - 1]);
    const ahead = (c: SeasonPayload['contestants'][number]) => !!d.meta.tracks_eliminations && !!c.eliminated && c.out_week != null && c.out_week > last;
    return d.contestants.some(ahead) ? { ...d, contestants: d.contestants.map(c => (ahead(c) ? { ...c, eliminated: false } : c)) } : d;
  }
  if (k >= 0) return asOf(d, k);
  const contestants = d.contestants.map(c => ({
    ...c, weeks: c.weeks.map(() => 0), total: 0,
    eliminated: !!d.meta.tracks_eliminations && !!c.eliminated && c.out_week == null,
  }));
  const teams = [...new Set(contestants.map(c => c.team))];
  return {
    ...d,
    meta: { ...d.meta, status: 'active', scored_weeks: [] },
    contestants,
    teamTotals: teams.map(team => ({ team, total: 0, rank: 1 })),
    ranks: Object.fromEntries(Object.keys(d.ranks).map(t => [t, []])),
    highlights: [],
  };
}

/** the season as this phone may see it */
export const shielded = (d: SeasonPayload, s: Shield) => (d.meta.status === 'active' ? seenAsOf(d, s.k) : d);

/** what the reveal splash says for scored_weeks position k */
export interface RevealInfo {
  week: number;
  headline: string;
  out: string[];
  topScorer: string | null;   // "Aubry · 14 pts"
  topTeam: string | null;     // "Tony + Karina · 22 pts"
  more: number;               // weeks still hidden after this one
}
export function revealInfo(d: SeasonPayload, k: number): RevealInfo {
  const sw = d.meta.scored_weeks ?? [];
  const at = seenAsOf(d, k);
  const rc = recap(at);
  const wk = weekLabel(d, sw[k]);
  const h = at.highlights.find(x => x.week === wk);
  const names = (xs: string[] | undefined, pts: number | null | undefined) =>
    xs?.length ? `${xs.length > 2 ? `${xs.length}-way tie` : xs.join(' & ')}${pts != null ? ` · ${pts} pts` : ''}` : null;
  return {
    week: wk,
    headline: rc?.headline ?? `Week ${wk} is in`,
    out: h?.out ?? [],
    topScorer: rc?.topScorer ? names(rc.topScorer.names, rc.topScorer.pts) : null,
    topTeam: rc?.topTeam ? names(rc.topTeam.names, rc.topTeam.pts) : null,
    more: sw.length - 1 - k,
  };
}

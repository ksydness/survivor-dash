// Pure helpers + derived data for the dashboard. No React here — everything is computed from the
// SeasonPayload the API returns (the sheet stays the source of truth; nothing is re-scored).
import type { SeasonPayload, Contestant } from '@/lib/types';

/* ── team colors ── */
// Stable team colors. Add new teams here if names change between seasons.
const TEAM_COLORS: Record<string, string> = {
  'Kenny + Lena': '#fb7185',
  'Tony + Karina': '#f59e0b',
  'Megan + Jake': '#2dd4bf',
  'Will + Kathleen + Anna': '#a78bfa',
  'Will': '#a78bfa',  // S46 precursor of Will + Kathleen + Anna — same lineage, same color
  'Megan + Jake + Colt': '#2dd4bf',           // S51 — Megan + Jake lineage
  'Will + Kathleen + Anna + Dan': '#a78bfa',  // S51 — Will + Kathleen + Anna lineage
};
const FALLBACK = ['#fb7185', '#f59e0b', '#2dd4bf', '#a78bfa', '#60a5fa', '#f472b6'];
export function colorFor(team: string, i = 0) { return TEAM_COLORS[team] ?? FALLBACK[i % FALLBACK.length]; }
/** team color at low alpha, for tinted fills (draft cells) */
export function tint(hex: string, alpha = 0.14) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/* ── numbers & labels ── */
export const r2 = (v: number) => Math.round(v * 100) / 100;
export const fmtDelta = (v: number) => (v > 0 ? `+${r2(v)}` : `${r2(v)}`);
export const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
export const initials = (name: string) => name.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || '?';

/* ── weeks ── */
export const weekLabel = (d: SeasonPayload, i: number) => d.meta.week_labels?.[i] ?? i + 1;
export const latestWeek = (d: SeasonPayload) => { const s = d.meta.scored_weeks ?? []; return s.length ? s[s.length - 1] : null; };
/** "this week" deltas only make sense while a season is running (a rewound season counts as running) */
export const liveWeek = (d: SeasonPayload) => (d.meta.status === 'active' ? latestWeek(d) : null);
export const teamWeekPts = (d: SeasonPayload, team: string, i: number) =>
  r2(d.contestants.filter(c => c.team === team).reduce((a, c) => a + (c.weeks[i] ?? 0), 0));

/**
 * The season as it stood right after the k-th scored week (k = position in meta.scored_weeks).
 * Later weeks are zeroed (arrays keep their length so week indexes stay valid), totals/ranks are
 * recomputed with shared ranks on ties, highlights and the rank chart are cut off, and players
 * who went out later count as still in. A rewound season is shown as "active" (so the week's
 * points show and no crown appears) — it wasn't over yet at that point.
 */
export function asOf(d: SeasonPayload, k: number): SeasonPayload {
  const sw = d.meta.scored_weeks ?? [];
  if (!sw.length || k >= sw.length - 1) return d;
  const cut = sw[k];
  const cutLabel = weekLabel(d, cut);
  const contestants = d.contestants.map(c => {
    const weeks = c.weeks.map((v, i) => (i <= cut ? v : 0));
    const total = r2(weeks.reduce((a, b) => a + b, 0));
    const eliminated = d.meta.tracks_eliminations
      ? !!c.eliminated && (c.out_week == null || c.out_week <= cutLabel)
      : total === 0;  // no Out column: same 0-points fallback the data layer uses
    return { ...c, weeks, total, eliminated };
  });
  const tmap: Record<string, number> = {};
  contestants.forEach(c => { tmap[c.team] = r2((tmap[c.team] ?? 0) + c.total); });
  const vals = Object.values(tmap);
  const teamTotals = Object.entries(tmap)
    .map(([team, total]) => ({ team, total, rank: 1 + vals.filter(v => v > total).length }))
    .sort((a, b) => b.total - a.total);
  const ranks = Object.fromEntries(Object.entries(d.ranks).map(([t, r]) => [t, r.slice(0, k + 1)]));
  return {
    ...d,
    meta: { ...d.meta, status: 'active', scored_weeks: sw.slice(0, k + 1) },
    contestants, teamTotals, ranks,
    highlights: d.highlights.slice(0, k + 1),
  };
}

/* ── teams & players ── */
/** team order + color index, in standings order (keeps fallback colors stable per season) */
export function teamIndex(d: SeasonPayload) {
  const idx: Record<string, number> = {};
  d.teamTotals.forEach((t, i) => { idx[t.team] = i; });
  return idx;
}
export const teamColor = (d: SeasonPayload, team: string) => colorFor(team, teamIndex(d)[team] ?? 0);

/** still-in contestants first (by points), eliminated sink to the bottom */
export const rosterOf = (d: SeasonPayload, team: string) => d.contestants.filter(c => c.team === team)
  .sort((a, b) => Number(!!a.eliminated) - Number(!!b.eliminated) || b.total - a.total);

export const playersLeft = (d: SeasonPayload, team: string) =>
  d.contestants.filter(c => c.team === team && !c.eliminated).length;

/** league-wide points rank (shared on ties) */
export function pointsRank(d: SeasonPayload, c: Contestant) {
  return 1 + d.contestants.filter(x => x.total > c.total).length;
}

export function bestWeek(d: SeasonPayload, c: Contestant) {
  const scored = d.meta.scored_weeks ?? c.weeks.map((_, i) => i);
  let best = { pts: 0, label: 0 as number };
  scored.forEach(i => { const v = c.weeks[i] ?? 0; if (v > best.pts || best.label === 0) best = { pts: v, label: weekLabel(d, i) }; });
  return best;
}

/** points per scored week, oldest first (the bars on player cards and team breakdowns) */
export const scoredSeries = (d: SeasonPayload, weeks: number[]) =>
  (d.meta.scored_weeks ?? []).map(i => ({ label: weekLabel(d, i), v: weeks[i] ?? 0 }));

export function teamSeries(d: SeasonPayload, team: string) {
  return (d.meta.scored_weeks ?? []).map(i => ({ label: weekLabel(d, i), v: teamWeekPts(d, team, i) }));
}

/* ── leaderboard ── */
export interface Standing {
  team: string; total: number; rank: number; tied: boolean; color: string;
  move: number | null;   // + = moved up since the previous scored week
  back: number;          // points behind the leader
  week: number | null;   // this week's points (live seasons only)
  left: number; size: number;
}
export function standings(d: SeasonPayload): Standing[] {
  const tt = d.teamTotals;
  const lead = tt[0]?.total ?? 0;
  const li = liveWeek(d);
  return tt.map((t, i) => {
    const rank = t.rank ?? i + 1;
    const r = d.ranks[t.team] ?? [];
    const move = r.length >= 2 ? r[r.length - 2] - r[r.length - 1] : null;
    return {
      team: t.team, total: t.total, rank, color: colorFor(t.team, i),
      tied: tt.filter(x => (x.rank ?? -1) === rank).length > 1,
      move, back: r2(lead - t.total),
      week: li === null ? null : teamWeekPts(d, t.team, li),
      left: playersLeft(d, t.team),
      size: d.contestants.filter(c => c.team === t.team).length,
    };
  });
}

/** The "week recap" card: plain sentences generated from the data for the latest scored week. */
export function recap(d: SeasonPayload) {
  const sw = d.meta.scored_weeks ?? [];
  if (!sw.length || !d.teamTotals.length) return null;
  const k = sw.length - 1;
  const wk = weekLabel(d, sw[k]);
  const final = d.meta.status === 'final';
  const leader = d.teamTotals[0];
  const leaders = d.teamTotals.filter(t => t.total === leader.total).map(t => t.team);
  const prevLeaders = Object.entries(d.ranks).filter(([, r]) => r.length >= 2 && r[r.length - 2] === 1).map(([t]) => t);
  const second = d.teamTotals.find(t => t.total < leader.total);

  let headline: string;
  if (leaders.length > 1) headline = `${leaders.join(' and ')} are tied for 1st`;
  else if (final) headline = `${leader.team} win the season`;
  else if (k > 0 && prevLeaders.length && !prevLeaders.includes(leader.team)) headline = `${leader.team} take the lead`;
  else headline = k === 0 ? `${leader.team} lead after Week ${wk}` : `${leader.team} stay on top`;

  const h = d.highlights.find(x => x.week === wk) ?? d.highlights[d.highlights.length - 1];
  const sentences: string[] = [];
  const tops = h?.top_contestants ?? (h?.top_contestant ? [h.top_contestant] : []);
  if (tops.length === 1 && h?.top_contestant_pts != null) sentences.push(`${tops[0]} led the week with ${h.top_contestant_pts} points.`);
  else if (tops.length > 1 && h?.top_contestant_pts != null) sentences.push(`${tops.length}-way tie for the week's high at ${h.top_contestant_pts} points.`);
  const tookLead = headline.endsWith('take the lead');
  if (tookLead) {
    // the team(s) that lost the lead
    prevLeaders.forEach(t => {
      const tt = d.teamTotals.find(x => x.team === t);
      if (tt) sentences.push(`${t} slip to ${ordinal(tt.rank ?? 2)}, ${r2(leader.total - tt.total)} back.`);
    });
  } else {
    // biggest climb this week (other than the leader holding on)
    const climb = Object.entries(d.ranks).filter(([, r]) => r.length >= 2)
      .map(([t, r]) => ({ t, from: r[r.length - 2], to: r[r.length - 1] }))
      .filter(x => x.to < x.from).sort((a, b) => (b.from - b.to) - (a.from - a.to))[0];
    if (climb) sentences.push(`${climb.t} climbed from ${ordinal(climb.from)} to ${ordinal(climb.to)}.`);
    if (leaders.length === 1 && second) sentences.push(final
      ? `Winning margin: ${r2(leader.total - second.total)} points.`
      : `The lead is ${r2(leader.total - second.total)} points.`);
  }
  if (h?.out?.length) sentences.push(`Out this week: ${h.out.join(', ')}.`);

  const topTeams = h?.top_teams ?? (h?.top_team ? [h.top_team] : []);
  return {
    week: wk, final, headline, body: sentences.join(' '),
    topScorer: tops.length ? { names: tops, pts: h?.top_contestant_pts ?? null, team: tops.length === 1 ? d.contestants.find(c => c.name === tops[0])?.team ?? null : null } : null,
    topTeam: topTeams.length ? { names: topTeams, pts: h?.top_team_pts ?? null } : null,
  };
}

/* ── draft ── */
export interface Pick { round: number; pick: number; team: string; teamIdx: number; name: string | null; c: Contestant | null }
/** Draft board → every pick with its overall number (snake: odd rounds left→right, even right→left). */
export function draftPicks(d: SeasonPayload): Pick[] {
  const b = d.draft;
  if (!b) return [];
  const n = b.teams.length;
  const byName = new Map(d.contestants.map(c => [c.name.toLowerCase(), c]));
  const out: Pick[] = [];
  b.rounds.forEach((row, r) => row.forEach((name, i) => {
    out.push({ round: r + 1, pick: r * n + (r % 2 === 0 ? i + 1 : n - i), team: b.teams[i], teamIdx: i, name, c: name ? byName.get(name.toLowerCase()) ?? null : null });
  }));
  return out;
}
/** Steal = finished furthest above their draft slot; bust = furthest below (by points rank). */
export function stealsAndBusts(d: SeasonPayload, picks: Pick[]) {
  const scored = picks.filter(p => p.c);
  const sorted = [...scored].sort((a, b) => b.c!.total - a.c!.total);
  const rankOf = (p: Pick) => 1 + sorted.filter(x => x.c!.total > p.c!.total).length;
  const withGap = scored.map(p => ({ p, finish: rankOf(p), gap: p.pick - rankOf(p) }));
  const steal = [...withGap].sort((a, b) => b.gap - a.gap || b.p.c!.total - a.p.c!.total)[0] ?? null;
  const bust = [...withGap].sort((a, b) => a.gap - b.gap || a.p.c!.total - b.p.c!.total)[0] ?? null;
  return { steal: steal && steal.gap > 0 ? steal : null, bust: bust && bust.gap < 0 ? bust : null };
}

/* ── history ── */
export function historyModel(d: SeasonPayload) {
  const bySeason: Record<number, { team: string; place: number; points: number }[]> = {};
  d.history.forEach(h => { (bySeason[h.season] ??= []).push(h); });
  const seasons = Object.keys(bySeason).map(Number).sort((a, b) => b - a);
  seasons.forEach(s => bySeason[s].sort((a, b) => a.place - b.place));
  const agg: Record<string, { titles: number[]; sum: number; n: number; places: number; high: number }> = {};
  d.history.forEach(h => {
    const a = (agg[h.team] ??= { titles: [], sum: 0, n: 0, places: 0, high: 0 });
    if (h.place === 1) a.titles.push(h.season);
    a.sum += h.points; a.n++; a.places += h.place; a.high = Math.max(a.high, h.points);
  });
  const teams = Object.entries(agg).map(([team, v]) => ({
    team, titles: v.titles.sort((a, b) => a - b), avg: v.sum / v.n, avgPlace: v.places / v.n, high: v.high, seasons: v.n,
  })).sort((a, b) => b.titles.length - a.titles.length || a.avgPlace - b.avgPlace || b.avg - a.avg);
  const latest = seasons[0];
  const champ = latest != null ? bySeason[latest].find(r => r.place === 1) ?? null : null;
  const all = d.history;
  const best = all.length ? all.reduce((a, b) => (b.points > a.points ? b : a)) : null;
  const worst = all.length ? all.reduce((a, b) => (b.points < a.points ? b : a)) : null;
  const margins = seasons.map(s => {
    const rows = bySeason[s];
    return rows.length >= 2 ? { season: s, margin: r2(rows[0].points - rows[1].points), winner: rows[0].team, runnerUp: rows[1].team } : null;
  }).filter(Boolean) as { season: number; margin: number; winner: string; runnerUp: string }[];
  const closest = margins.length ? margins.reduce((a, b) => (b.margin < a.margin ? b : a)) : null;
  const widest = margins.length ? margins.reduce((a, b) => (b.margin > a.margin ? b : a)) : null;
  return { bySeason, seasons, teams, latest, champ, best, worst, closest, widest };
}

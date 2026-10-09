// Sheet-only data layer. Reads the published Google Sheet CSVs directly — no
// database. The "Seasons" control tab is the registry of which seasons exist;
// each season's own tabs supply the data. Results are cached via Next's fetch
// cache (see fetchCsv); the dashboard Refresh button passes { fresh: true }.
//
// Future migration ("Path B"): swap the bodies of getSeasons/getSeasonPayload
// to read from a database instead. The function signatures and the SeasonPayload
// shape stay the same, so the API routes and dashboard need no changes.

import {
  fetchCsv, parseRegistry, parseHistory, parseEpisodes, parseEpisodeWeeks, parseContestants,
  parseCast, RegistryRow,
} from './sheets';
import type { SeasonPayload, Contestant, SeasonMeta, DraftData } from './types';

const SEASONS_CSV_URL = () => requireEnv('SEASONS_CSV_URL');
const HISTORY_CSV_URL = () => process.env.HISTORY_CSV_URL; // optional

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} must be set (publish the control tab to web as CSV and set its URL)`);
  return v;
}

/** Read the Seasons control tab → list of seasons (newest first). */
export async function getSeasons(fresh = false): Promise<RegistryRow[]> {
  const rows = await fetchCsv(SEASONS_CSV_URL(), { fresh });
  return parseRegistry(rows).sort((a, b) => b.season - a.season);
}

/** Data for the draft room: the cast (contestant names) + the league's teams. */
export async function getDraftData(season: number, fresh = false): Promise<DraftData | null> {
  const reg = await getSeasons(fresh);
  const row = reg.find(r => r.season === season);
  if (!row) return null;
  if (!row.urls.contestants) throw new Error(`Season ${season} is missing its Contestants CSV URL`);

  const coRows = await fetchCsv(row.urls.contestants, { fresh });
  const cast = parseCast(coRows);

  let teams = row.teams.length ? row.teams : [];
  if (!teams.length) {
    // fallback: distinct non-empty team values already in the Contestants tab
    const seen = new Set<string>();
    coRows.slice(1).forEach(r => { const t = (r[1] || '').trim(); if (t) seen.add(t); });
    teams = [...seen];
  }
  return { meta: { season: row.season, name: row.name, status: row.status }, teams, cast };
}

/** Read all-time History tab (tidy: Season | Place | Team | Points). */
async function getHistory(fresh = false) {
  const url = HISTORY_CSV_URL();
  if (!url) return [];
  try { return parseHistory(await fetchCsv(url, { fresh })); }
  catch { return []; }
}

/** Assemble the full payload for one season by reading its sheet tabs. */
export async function getSeasonPayload(season: number, fresh = false): Promise<SeasonPayload | null> {
  const reg = await getSeasons(fresh);
  const row = reg.find(r => r.season === season);
  if (!row) return null;
  if (!row.urls.episodes || !row.urls.contestants) {
    throw new Error(`Season ${season} needs at least Episodes and Contestants CSV URLs in the Seasons tab`);
  }

  // Standings, weekly ranks and weekly highlights are all derived from the Episodes tab
  // (the same weekly points the standings use — no re-scoring), so ties show as ties and
  // seasons without a Leaderboard tab get the rank chart + highlights too. The Leaderboard
  // URL stays optional in the registry; it just isn't needed for the dashboard any more.
  const [epRows, coRows, history] = await Promise.all([
    fetchCsv(row.urls.episodes, { fresh }),
    fetchCsv(row.urls.contestants, { fresh }),
    getHistory(fresh),
  ]);

  const numWeeks = row.num_weeks;
  const { contestants: consRaw, tracksOut } = parseContestants(coRows);
  const scores = parseEpisodes(epRows, numWeeks);
  const { scored, labels } = parseEpisodeWeeks(epRows, numWeeks);
  const scoredIdx = scored.flatMap((s, i) => (s ? [i] : []));

  // Build contestants with weekly arrays + totals
  const byName: Record<string, Contestant> = {};
  for (const c of consRaw) byName[c.name] = { name: c.name, team: c.team, draft_round: c.draft_round, weeks: Array(numWeeks).fill(0), total: 0, eliminated: c.eliminated, out_week: c.out_week };
  for (const s of scores) {
    const c = byName[s.contestant];
    if (c && s.week >= 1 && s.week <= numWeeks) c.weeks[s.week - 1] = s.points;
  }
  const contestants = Object.values(byName);
  contestants.forEach(c => { c.total = c.weeks.reduce((a, b) => a + b, 0); });
  // No Out column (older seasons): keep the old look — 0-point contestants render as eliminated.
  if (!tracksOut) contestants.forEach(c => { c.eliminated = c.total === 0; });

  // Team totals computed from contestant points (authoritative)
  const tmap: Record<string, number> = {};
  contestants.forEach(c => { tmap[c.team] = (tmap[c.team] ?? 0) + c.total; });
  // competition ranking: ties share a rank and the next rank is skipped (1, 1, 3, 4)
  const rankOf = (v: number, all: number[]) => 1 + all.filter(x => x > v).length;
  const round = (v: number) => Math.round(v * 100) / 100;  // keeps Bake Off half-points exact for tie checks
  const teamTotals = Object.entries(tmap).map(([team, total]) => ({ team, total, rank: 0 })).sort((a, b) => b.total - a.total);
  teamTotals.forEach(t => { t.rank = rankOf(t.total, teamTotals.map(x => x.total)); });
  const teams = teamTotals.map(t => t.team);

  // weekly team points (drafted contestants) → cumulative → rank per scored week
  const teamWeek = (team: string, i: number) => contestants.filter(c => c.team === team).reduce((a, c) => a + c.weeks[i], 0);
  const ranks: Record<string, number[]> = Object.fromEntries(teams.map(t => [t, [] as number[]]));
  const cum: Record<string, number> = Object.fromEntries(teams.map(t => [t, 0]));
  for (let i = 0; i < numWeeks; i++) {
    teams.forEach(t => { cum[t] += teamWeek(t, i); });
    if (!scored[i]) continue;
    const vals = teams.map(t => round(cum[t]));
    teams.forEach(t => ranks[t].push(rankOf(round(cum[t]), vals)));
  }

  // weekly highlights: every contestant tied for the week's high (all Episodes rows, drafted or not —
  // same pool the sheet's script uses), every team tied for the high, and who went out that week
  const normHighlights = scoredIdx.map(i => {
    const wkScores = scores.filter(s => s.week === i + 1);
    const hiC = wkScores.length ? Math.max(...wkScores.map(s => s.points)) : null;
    const topC = hiC === null ? [] : [...new Set(wkScores.filter(s => s.points === hiC).map(s => s.contestant))];
    const tw = teams.map(t => ({ t, v: round(teamWeek(t, i)) }));
    const hiT = tw.length ? Math.max(...tw.map(x => x.v)) : null;
    const topT = hiT === null ? [] : tw.filter(x => x.v === hiT).map(x => x.t);
    const out = tracksOut ? contestants.filter(c => c.eliminated && c.out_week === labels[i]).map(c => c.name) : [];
    return {
      week: labels[i],
      top_contestant: topC.length ? topC.join(', ') : null, top_contestant_pts: hiC,
      top_team: topT.length ? topT.join(', ') : null, top_team_pts: hiT,
      top_contestants: topC, top_teams: topT, out,
    };
  });

  const meta: SeasonMeta = { season: row.season, name: row.name, status: row.status, num_weeks: numWeeks, last_synced_at: new Date().toISOString(), tracks_eliminations: tracksOut, week_labels: labels, scored_weeks: scoredIdx };
  return { meta, contestants, teamTotals, ranks, highlights: normHighlights, history };
}

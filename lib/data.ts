// Sheet-only data layer. Reads the published Google Sheet CSVs directly — no
// database. The "Seasons" control tab is the registry of which seasons exist;
// each season's own tabs supply the data. Results are cached via Next's fetch
// cache (see fetchCsv); the dashboard Refresh button passes { fresh: true }.
//
// Future migration ("Path B"): swap the bodies of getSeasons/getSeasonPayload
// to read from a database instead. The function signatures and the SeasonPayload
// shape stay the same, so the API routes and dashboard need no changes.

import {
  fetchCsv, parseRegistry, parseHistory, parseEpisodes, parseContestants,
  parseLeaderboard, RegistryRow,
} from './sheets';
import type { SeasonPayload, Contestant, SeasonMeta } from './types';

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
  if (!row.urls.episodes || !row.urls.contestants || !row.urls.leaderboard) {
    throw new Error(`Season ${season} is missing one or more CSV URLs in the Seasons tab`);
  }

  const [epRows, coRows, lbRows, history] = await Promise.all([
    fetchCsv(row.urls.episodes, { fresh }),
    fetchCsv(row.urls.contestants, { fresh }),
    fetchCsv(row.urls.leaderboard, { fresh }),
    getHistory(fresh),
  ]);

  const numWeeks = row.num_weeks;
  const consRaw = parseContestants(coRows);
  const scores = parseEpisodes(epRows, numWeeks);
  const { ranks, highlights } = parseLeaderboard(lbRows, numWeeks);

  // Build contestants with weekly arrays + totals
  const byName: Record<string, Contestant> = {};
  for (const c of consRaw) byName[c.name] = { name: c.name, team: c.team, draft_round: c.draft_round, weeks: Array(numWeeks).fill(0), total: 0 };
  for (const s of scores) {
    const c = byName[s.contestant];
    if (c && s.week >= 1 && s.week <= numWeeks) c.weeks[s.week - 1] = s.points;
  }
  const contestants = Object.values(byName);
  contestants.forEach(c => { c.total = c.weeks.reduce((a, b) => a + b, 0); });

  // Team totals computed from contestant points (authoritative)
  const tmap: Record<string, number> = {};
  contestants.forEach(c => { tmap[c.team] = (tmap[c.team] ?? 0) + c.total; });
  const teamTotals = Object.entries(tmap).map(([team, total]) => ({ team, total })).sort((a, b) => b.total - a.total);

  const normHighlights = highlights.map(h => ({
    week: h.week,
    top_contestant: h.top_contestant ?? null,
    top_contestant_pts: h.top_contestant_pts ?? null,
    top_team: h.top_team ?? null,
    top_team_pts: h.top_team_pts ?? null,
  }));

  const meta: SeasonMeta = { season: row.season, name: row.name, status: row.status, num_weeks: numWeeks, last_synced_at: new Date().toISOString() };
  return { meta, contestants, teamTotals, ranks, highlights: normHighlights, history };
}

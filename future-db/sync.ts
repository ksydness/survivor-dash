import { supabase } from './supabase';
import {
  fetchCsv, parseEpisodes, parseContestants, parseLeaderboard, parseScoring, SheetUrls,
} from './sheets';

/**
 * Sync one season's Google Sheet into Supabase. Idempotent (upserts only), so
 * it's always safe to re-run. Reads the published-CSV URLs stored on the season
 * row. Returns a small summary for logging.
 */
export async function syncSeason(season: number): Promise<{ contestants: number; scores: number }> {
  const { data: s, error } = await supabase
    .from('seasons').select('season, num_weeks, sheet_csv_urls').eq('season', season).single();
  if (error || !s) throw new Error(`Season ${season} not found`);

  const urls = s.sheet_csv_urls as SheetUrls;
  const numWeeks = s.num_weeks ?? 14;
  if (!urls?.episodes || !urls?.contestants || !urls?.leaderboard) {
    throw new Error(`Season ${season} is missing sheet_csv_urls`);
  }

  // Fetch tabs in parallel
  const [epRows, coRows, lbRows, scRows] = await Promise.all([
    fetchCsv(urls.episodes),
    fetchCsv(urls.contestants),
    fetchCsv(urls.leaderboard),
    urls.scoring ? fetchCsv(urls.scoring) : Promise.resolve(null),
  ]);

  const contestants = parseContestants(coRows);
  const scores = parseEpisodes(epRows, numWeeks);
  const { ranks, highlights, teamTotals } = parseLeaderboard(lbRows, numWeeks);

  // Upsert contestants
  if (contestants.length) {
    await supabase.from('contestants').upsert(
      contestants.map(c => ({ season, name: c.name, team: c.team, draft_round: c.draft_round })),
      { onConflict: 'season,name' });
  }

  // Upsert weekly scores
  if (scores.length) {
    await supabase.from('episode_scores').upsert(
      scores.map(s2 => ({ season, contestant: s2.contestant, week: s2.week, points: s2.points })),
      { onConflict: 'season,contestant,week' });
  }

  // Upsert ranks
  const rankRows = Object.entries(ranks).flatMap(([team, arr]) =>
    arr.map((rank, i) => ({ season, team, week: i + 1, rank })));
  if (rankRows.length) {
    await supabase.from('weekly_ranks').upsert(rankRows, { onConflict: 'season,team,week' });
  }

  // Upsert highlights
  if (highlights.length) {
    await supabase.from('weekly_highlights').upsert(
      highlights.map(h => ({
        season, week: h.week,
        top_contestant: h.top_contestant ?? null, top_contestant_pts: h.top_contestant_pts ?? null,
        top_team: h.top_team ?? null, top_team_pts: h.top_team_pts ?? null,
      })),
      { onConflict: 'season,week' });
  }

  // Scoring rules (optional)
  if (scRows) {
    const rules = parseScoring(scRows);
    if (rules.length) {
      await supabase.from('scoring_rules').upsert(
        rules.map(r => ({ season, action: r.action, points: r.points })),
        { onConflict: 'season,action' });
    }
  }

  await supabase.from('seasons').update({ last_synced_at: new Date().toISOString() }).eq('season', season);

  console.log(`Synced season ${season}: ${contestants.length} contestants, ${scores.length} score rows, ${teamTotals.length} teams`);
  return { contestants: contestants.length, scores: scores.length };
}

/** Sync every season whose status = 'active'. Used by the daily cron. */
export async function syncActiveSeasons(): Promise<number> {
  const { data } = await supabase.from('seasons').select('season').eq('status', 'active');
  let n = 0;
  for (const row of data ?? []) { await syncSeason(row.season); n++; }
  return n;
}

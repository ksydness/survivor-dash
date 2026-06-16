// Port of the Google Apps Script scoring logic (Input × Scoring → weekly points).
// NOT used by the read-only dashboard today — the sheet still does scoring.
// This exists so a future in-app tally UI ("Path B") can compute scores natively
// without re-deriving the rules. Keep in sync with the Scoring tab.

export type ScoringMap = Record<string, number>;

/** A week's tally: action -> { contestant -> count }. */
export type WeeklyTally = Record<string, Record<string, number>>;

/**
 * Compute each contestant's points for one week, mirroring updateSurvivorScores():
 * for each action a contestant did `count` times, add count * scoringMap[action].
 */
export function scoreWeek(tally: WeeklyTally, scoring: ScoringMap): Record<string, number> {
  const points: Record<string, number> = {};
  for (const [action, perContestant] of Object.entries(tally)) {
    const pv = scoring[action] ?? 0;
    for (const [contestant, count] of Object.entries(perContestant)) {
      if (typeof count === 'number' && count !== 0) {
        points[contestant] = (points[contestant] ?? 0) + count * pv;
      }
    }
  }
  return points;
}

/** Cumulative team totals from per-contestant weekly points + a team map. */
export function teamTotals(
  weeklyByContestant: Record<string, number>[],
  teamOf: Record<string, string>,
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const week of weeklyByContestant) {
    for (const [contestant, pts] of Object.entries(week)) {
      const team = teamOf[contestant];
      if (team) totals[team] = (totals[team] ?? 0) + pts;
    }
  }
  return totals;
}

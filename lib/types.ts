export type SeasonStatus = 'active' | 'final' | 'drafting';

export interface SeasonMeta {
  season: number;
  name: string;
  status: SeasonStatus;
  num_weeks: number;
  last_synced_at: string | null;
  /** true when the Contestants tab has a column headed "Out"/"Eliminated" — eliminations are marked explicitly */
  tracks_eliminations?: boolean;
  /** week number per Episodes column (index 0 = col B), matching the sheet's "Week N" headers when they're clean */
  week_labels?: number[];
  /** 0-based indexes of the week columns that have been scored, oldest first */
  scored_weeks?: number[];
}

export interface DraftData {
  meta: { season: number; name: string; status: SeasonStatus };
  teams: string[];   // the league's teams (draft order is randomized client-side)
  cast: string[];    // contestant names available to draft
}

export interface Contestant {
  name: string;
  team: string;
  draft_round?: number | null;
  weeks: number[]; // points per week, index 0 = Week 1
  total: number;
  eliminated?: boolean;        // marked in the Contestants tab's Out column (or 0-pts fallback)
  out_week?: number | null;    // the week typed in the Out column, if it's a number
}

export interface WeeklyHighlight {
  week: number;                       // sheet week number (week_labels)
  top_contestant: string | null;      // all tied names, comma-joined
  top_contestant_pts: number | null;
  top_team: string | null;
  top_team_pts: number | null;
  top_contestants?: string[];         // every contestant tied for the week's high
  top_teams?: string[];               // every team tied for the week's high
  out?: string[];                     // contestants whose Out week is this week
}

export interface SeasonPayload {
  meta: SeasonMeta;
  contestants: Contestant[];
  teamTotals: { team: string; total: number; rank?: number }[];  // rank: shared on ties (1, 1, 3, 4)
  ranks: Record<string, number[]>;      // team -> rank per scored week (ties share a rank)
  highlights: WeeklyHighlight[];
  history: { season: number; team: string; place: number; points: number }[];
}

export type SeasonStatus = 'active' | 'final' | 'drafting';

export interface SeasonMeta {
  season: number;
  name: string;
  status: SeasonStatus;
  num_weeks: number;
  last_synced_at: string | null;
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
}

export interface WeeklyHighlight {
  week: number;
  top_contestant: string | null;
  top_contestant_pts: number | null;
  top_team: string | null;
  top_team_pts: number | null;
}

export interface SeasonPayload {
  meta: SeasonMeta;
  contestants: Contestant[];
  teamTotals: { team: string; total: number }[];
  ranks: Record<string, number[]>;      // team -> rank per week
  highlights: WeeklyHighlight[];
  history: { season: number; team: string; place: number; points: number }[];
}

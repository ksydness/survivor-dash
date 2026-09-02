// Server-side store for the live (multi-device) draft. One row per (league,
// season) in the shared Supabase project; all writes come through the API route using
// the service role key (RLS blocks everyone else). The Google Sheet remains
// the source of truth for scoring — this table only holds in-progress draft
// state, and the finished draft still gets pasted into the sheet by hand.

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { LEAGUE, SUPABASE_URL } from './draftConfig';

export interface LivePick { overall: number; round: number; teamIndex: number; contestant: string; }

export interface LiveState {
  phase: 'setup' | 'drafting' | 'done';
  teams: string[];          // snapshot from the sheet when the draft is created
  cast: string[];           // snapshot from the sheet when the draft is created
  order: number[];          // team indices, round-1 order
  picks: LivePick[];
  rounds: number;           // picks per team
  clockSecs: number;
  deadline: string | null;  // ISO timestamp the current pick's clock expires; null = paused / not drafting
  pausedRemaining: number | null; // seconds left when paused
}

export interface LiveDraft { season: number; state: LiveState; version: number; }

export function liveDraftConfigured(): boolean {
  return !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

let admin: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (!admin) {
    admin = createClient(
      SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
  }
  return admin;
}

export async function getLiveDraft(season: number): Promise<LiveDraft | null> {
  const { data, error } = await db().from('drafts')
    .select('season,state,version').eq('league', LEAGUE).eq('season', season).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as LiveDraft | null) ?? null;
}

/** Insert a fresh draft row. Returns null if one already exists. */
export async function insertLiveDraft(season: number, state: LiveState): Promise<LiveDraft | null> {
  const { data, error } = await db().from('drafts')
    .insert({ league: LEAGUE, season, state, version: 0 })
    .select('season,state,version').maybeSingle();
  if (error) {
    if ((error as { code?: string }).code === '23505') return null; // row already exists
    throw new Error(error.message);
  }
  return data as LiveDraft;
}

/** Optimistic-concurrency update. Returns null on version conflict. */
export async function updateLiveDraft(season: number, state: LiveState, expectedVersion: number): Promise<LiveDraft | null> {
  const { data, error } = await db().from('drafts')
    .update({ state, version: expectedVersion + 1, updated_at: new Date().toISOString() })
    .eq('league', LEAGUE).eq('season', season).eq('version', expectedVersion)
    .select('season,state,version').maybeSingle();
  if (error) throw new Error(error.message);
  return (data as LiveDraft | null) ?? null;
}

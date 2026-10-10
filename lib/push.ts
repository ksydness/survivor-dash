// Web Push: device subscriptions + weekly score notifications.
// Subscriptions and a small send log live in the shared bakeoff-drafts Supabase
// project (tables push_subscriptions / push_sends, keyed by league; service role
// only). Scores themselves are never stored here — the message is built from the
// same SeasonPayload the dashboard renders (lib/data.ts), read from the sheet.

import webpush from 'web-push';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { LEAGUE, SUPABASE_URL } from './draftConfig';
import { VAPID_PUBLIC_KEY, PUSH_BRAND, PUSH_SUBJECT } from './pushConfig';
import type { SeasonPayload } from './types';

export interface PushSub { endpoint: string; keys: { p256dh: string; auth: string } }
export interface PushMessage { title: string; body: string; url: string; tag: string }

export function pushConfigured(): boolean {
  return !!process.env.SUPABASE_SERVICE_ROLE_KEY && !!process.env.VAPID_PRIVATE_KEY;
}

let admin: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (!admin) admin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  return admin;
}

export function isValidSub(s: unknown): s is PushSub {
  const x = s as PushSub;
  return !!x && typeof x.endpoint === 'string' && x.endpoint.startsWith('https://') && x.endpoint.length < 1000
    && !!x.keys && typeof x.keys.p256dh === 'string' && typeof x.keys.auth === 'string'
    && x.keys.p256dh.length < 200 && x.keys.auth.length < 100;
}

export async function saveSubscription(s: PushSub): Promise<void> {
  const { error } = await db().from('push_subscriptions').upsert({
    endpoint: s.endpoint, league: LEAGUE, p256dh: s.keys.p256dh, auth: s.keys.auth, updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function deleteSubscription(endpoint: string): Promise<void> {
  const { error } = await db().from('push_subscriptions').delete().eq('endpoint', endpoint).eq('league', LEAGUE);
  if (error) throw new Error(error.message);
}

/** Record that (season, week) was announced. Returns false if it already was (unless force). */
export async function claimSend(season: number, week: number, force: boolean): Promise<boolean> {
  const row = { league: LEAGUE, season, week, sent_at: new Date().toISOString() };
  const q = force
    ? db().from('push_sends').upsert(row)
    : db().from('push_sends').insert(row);
  const { error } = await q;
  if (error) {
    if ((error as { code?: string }).code === '23505') return false;
    throw new Error(error.message);
  }
  return true;
}

async function recordRecipients(season: number, week: number, recipients: number) {
  await db().from('push_sends').update({ recipients }).eq('league', LEAGUE).eq('season', season).eq('week', week);
}

/** Send one message to every subscribed device in this league; prunes dead subscriptions. */
export async function sendToLeague(msg: PushMessage, season: number, week: number) {
  webpush.setVapidDetails(PUSH_SUBJECT, VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY!);
  const { data, error } = await db().from('push_subscriptions').select('endpoint,p256dh,auth').eq('league', LEAGUE);
  if (error) throw new Error(error.message);
  const subs = (data ?? []) as { endpoint: string; p256dh: string; auth: string }[];
  const payload = JSON.stringify(msg);
  let sent = 0; const dead: string[] = []; const failed: string[] = [];
  await Promise.all(subs.map(async s => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24, urgency: 'normal' });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) dead.push(s.endpoint);
      else failed.push(`${code ?? '?'}`);
    }
  }));
  if (dead.length) await db().from('push_subscriptions').delete().in('endpoint', dead);
  await recordRecipients(season, week, sent);
  return { devices: subs.length, sent, removed: dead.length, failed };
}

// ── message ────────────────────────────────────────────────────────────────

/** Latest scored week as the sheet numbers it (matches the dashboard's "Through Week N"). */
export function latestWeek(d: SeasonPayload): { index: number; label: number } | null {
  const scored = d.meta.scored_weeks ?? [];
  if (!scored.length) return null;
  const index = scored[scored.length - 1];
  return { index, label: d.meta.week_labels?.[index] ?? index + 1 };
}

/** Short heads-up only — tapping opens the dashboard (Leaderboard tab, freshly synced). */
export function buildScoreMessage(d: SeasonPayload): PushMessage | null {
  const lw = latestWeek(d);
  if (!lw) return null;
  return {
    title: `${PUSH_BRAND.emoji} ${PUSH_BRAND.seasonLabel(d.meta.season, d.meta.name)} · Week ${lw.label} scores are in`,
    body: 'Tap to see the leaderboard.',
    url: `/s/${d.meta.season}?sync=1`,
    tag: `scores-${d.meta.season}-${lw.label}`,
  };
}

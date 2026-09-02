// Live draft API: GET returns current shared state; POST applies one action.
// Every state change is validated server-side (whose turn, contestant still
// available, commissioner key for admin actions) and written with a version
// check so simultaneous taps can't corrupt the draft — the loser gets a 409
// with the fresh state.

import { NextRequest, NextResponse } from 'next/server';
import { getDraftData } from '@/lib/data';
import {
  getLiveDraft, insertLiveDraft, updateLiveDraft, liveDraftConfigured,
  LiveState, LiveDraft,
} from '@/lib/liveDraft';

export const maxDuration = 30;

const noStore = { 'Cache-Control': 'no-store' };
const fail = (msg: string, status = 400) =>
  NextResponse.json({ configured: true, error: msg }, { status, headers: noStore });
const ok = (draft: LiveDraft | null) =>
  NextResponse.json({ configured: true, draft }, { headers: noStore });
const stale = (draft: LiveDraft | null) =>
  NextResponse.json({ configured: true, error: 'stale', draft }, { status: 409, headers: noStore });

/** Which team index is on the clock (server-side copy of the snake logic). */
function onClock(s: LiveState): number {
  const nTeams = s.teams.length;
  const total = s.rounds * nTeams;
  const overall = s.picks.length;
  if (s.phase !== 'drafting' || overall >= total || !nTeams) return -1;
  const round = Math.floor(overall / nTeams);
  const pos = overall % nTeams;
  const roundOrder = round % 2 === 0 ? s.order : [...s.order].reverse();
  return roundOrder[pos];
}

async function parseSeason(ctx: { params: Promise<{ season: string }> }): Promise<number> {
  const { season } = await ctx.params;
  return parseInt(season, 10);
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ season: string }> }) {
  const season = await parseSeason(ctx);
  if (!liveDraftConfigured()) return NextResponse.json({ configured: false, draft: null }, { headers: noStore });
  try {
    return ok(await getLiveDraft(season));
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : 'failed to load draft', 500);
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ season: string }> }) {
  const season = await parseSeason(ctx);
  if (!liveDraftConfigured()) return NextResponse.json({ configured: false, error: 'live draft is not configured' }, { status: 503, headers: noStore });

  let body: any;
  try { body = await req.json(); } catch { return fail('bad request'); }
  const action = String(body?.action ?? '');
  const isCommish = !!process.env.COMMISSIONER_KEY && body?.key === process.env.COMMISSIONER_KEY;
  const commishOnly = ['create', 'configure', 'start', 'undo', 'pause', 'resume', 'reset'];
  if (commishOnly.includes(action) && !isCommish) return fail('commissioner key required', 403);

  try {
    if (action === 'create') {
      const existing = await getLiveDraft(season);
      if (existing) return ok(existing);
      const dd = await getDraftData(season);
      if (!dd) return fail('season not found', 404);
      if (!dd.teams.length || !dd.cast.length) return fail('season is missing teams or cast');
      const state: LiveState = {
        phase: 'setup', teams: dd.teams, cast: dd.cast, order: [], picks: [],
        rounds: Math.max(1, Math.floor(dd.cast.length / dd.teams.length)),
        clockSecs: 45, deadline: null, pausedRemaining: null,
      };
      const created = await insertLiveDraft(season, state);
      return ok(created ?? await getLiveDraft(season));
    }

    const draft = await getLiveDraft(season);
    if (!draft) return fail('the commissioner has not opened this draft yet', 404);
    if (typeof body?.version !== 'number' || body.version !== draft.version) return stale(draft);

    const s: LiveState = JSON.parse(JSON.stringify(draft.state));
    const maxRounds = s.teams.length ? Math.floor(s.cast.length / s.teams.length) : 0;
    const now = Date.now();
    // lead = seconds the clock is padded so devices can play the pick/turn
    // announcements before the countdown visibly starts (clients clamp the
    // displayed clock to clockSecs, so the pad reads as a hold at full time)
    const deadlineIn = (leadSecs: number) => new Date(now + (leadSecs + s.clockSecs) * 1000).toISOString();

    switch (action) {
      case 'configure': {
        if (s.phase !== 'setup') return fail('draft already started');
        const { order, rounds, clockSecs } = body?.settings ?? {};
        if (order !== undefined) {
          const valid = Array.isArray(order) && order.length === s.teams.length
            && [...order].sort((a: number, b: number) => a - b).every((v: number, i: number) => v === i);
          if (!valid) return fail('bad order');
          s.order = order;
        }
        if (rounds !== undefined) {
          if (typeof rounds !== 'number' || rounds < 1 || rounds > maxRounds) return fail('bad picks-per-team');
          s.rounds = rounds;
        }
        if (clockSecs !== undefined) {
          if (typeof clockSecs !== 'number' || clockSecs < 15 || clockSecs > 180) return fail('bad clock length');
          s.clockSecs = clockSecs;
        }
        break;
      }
      case 'start': {
        if (s.phase !== 'setup') return fail('draft already started');
        if (!s.order.length) return fail('generate a draft order first');
        s.phase = 'drafting'; s.deadline = deadlineIn(3); s.pausedRemaining = null;
        break;
      }
      case 'pick': {
        if (s.phase !== 'drafting') return fail('the draft is not live');
        if (!s.deadline && !isCommish) return fail('the draft is paused');
        const turn = onClock(s);
        if (turn < 0) return fail('no team is on the clock');
        if (!isCommish && body?.teamIndex !== turn) return fail(`it's ${s.teams[turn]}'s pick`);
        const contestant = String(body?.contestant ?? '');
        if (!s.cast.includes(contestant)) return fail('unknown contestant');
        if (s.picks.some(p => p.contestant === contestant)) return fail('already drafted');
        s.picks.push({
          overall: s.picks.length,
          round: Math.floor(s.picks.length / s.teams.length) + 1,
          teamIndex: turn,
          contestant,
        });
        if (s.picks.length >= s.rounds * s.teams.length) { s.phase = 'done'; s.deadline = null; }
        else { s.deadline = deadlineIn(5); }
        s.pausedRemaining = null;
        break;
      }
      case 'undo': {
        if (!s.picks.length) return fail('nothing to undo');
        s.picks.pop();
        if (s.phase === 'done') s.phase = 'drafting';
        s.deadline = deadlineIn(3); s.pausedRemaining = null;
        break;
      }
      case 'pause': {
        if (s.phase !== 'drafting' || !s.deadline) return fail('nothing to pause');
        s.pausedRemaining = Math.max(0, Math.round((new Date(s.deadline).getTime() - now) / 1000));
        s.deadline = null;
        break;
      }
      case 'resume': {
        if (s.phase !== 'drafting' || s.deadline) return fail('not paused');
        s.deadline = new Date(now + (s.pausedRemaining ?? s.clockSecs) * 1000).toISOString();
        s.pausedRemaining = null;
        break;
      }
      case 'reset': {
        s.phase = 'setup'; s.picks = []; s.order = []; s.deadline = null; s.pausedRemaining = null;
        break;
      }
      default:
        return fail('unknown action');
    }

    const updated = await updateLiveDraft(season, s, draft.version);
    if (!updated) return stale(await getLiveDraft(season));
    return ok(updated);
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : 'draft action failed', 500);
  }
}

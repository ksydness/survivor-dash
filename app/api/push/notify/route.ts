import { NextResponse } from 'next/server';
import { getSeasons, getSeasonPayload } from '@/lib/data';
import { pushConfigured, buildScoreMessage, latestWeek, claimSend, sendToLeague } from '@/lib/push';

export const dynamic = 'force-dynamic';

// Called by the sheet's Apps Script after Update Scores (never by the app itself).
// The sheet's published CSV lags a few minutes behind the sheet, so the script
// passes the week it just scored; until the site sees that week this returns
// { status: 'pending' } and the script retries a minute later. Each
// (season, week) is announced once — 'already_sent' after that unless force.
//
// POST { key, season?, week?, force? }   season defaults to the newest active season.
// GET  ?season=N                          preview the message (sends nothing).

async function resolveSeason(s: unknown): Promise<number | null> {
  const n = typeof s === 'number' ? s : parseInt(String(s ?? ''), 10);
  if (n) return n;
  const active = (await getSeasons(true)).filter(r => r.status === 'active').map(r => r.season);
  return active.length ? Math.max(...active) : null;
}

export async function GET(req: Request) {
  const season = await resolveSeason(new URL(req.url).searchParams.get('season'));
  if (!season) return NextResponse.json({ error: 'No active season' }, { status: 404 });
  const d = await getSeasonPayload(season, true);
  if (!d) return NextResponse.json({ error: 'Unknown season' }, { status: 404 });
  return NextResponse.json({ season, latest_week: latestWeek(d)?.label ?? null, message: buildScoreMessage(d) });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!process.env.COMMISSIONER_KEY || body?.key !== process.env.COMMISSIONER_KEY) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }
  if (!pushConfigured()) return NextResponse.json({ error: 'Notifications are not set up' }, { status: 503 });
  try {
    const season = await resolveSeason(body.season);
    if (!season) return NextResponse.json({ status: 'error', error: 'No active season' }, { status: 404 });
    const d = await getSeasonPayload(season, true);
    if (!d) return NextResponse.json({ status: 'error', error: 'Unknown season' }, { status: 404 });
    const lw = latestWeek(d);
    const want = parseInt(String(body.week ?? ''), 10) || 0;
    if (!lw || lw.label < want) return NextResponse.json({ status: 'pending', season, latest_week: lw?.label ?? null, waiting_for: want });
    const msg = buildScoreMessage(d)!;
    if (!(await claimSend(season, lw.label, !!body.force))) {
      return NextResponse.json({ status: 'already_sent', season, week: lw.label });
    }
    const result = await sendToLeague(msg, season, lw.label);
    return NextResponse.json({ status: 'sent', season, week: lw.label, ...result, message: msg });
  } catch (e) {
    return NextResponse.json({ status: 'error', error: (e as Error).message }, { status: 500 });
  }
}

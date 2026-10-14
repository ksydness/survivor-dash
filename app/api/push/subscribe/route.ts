import { NextResponse } from 'next/server';
import { pushConfigured, isValidSub, saveSubscription, deleteSubscription } from '@/lib/push';
import { getLeagueNames } from '@/lib/viewing';

export const dynamic = 'force-dynamic';

// GET → { enabled, names, voters } (the 🔔 button hides itself until VAPID_PRIVATE_KEY is set; names/voters
//   feed its "who's this phone for?" sheet — viewing-night pings only go to phones with a voter on them).
// POST { subscription, people? } — save this device (people = who uses it, only when the phone answers the
//   sheet) → { ok, people } (who's on file for it). DELETE { endpoint } — forget it.
export async function GET() {
  const league = await getLeagueNames().catch(() => ({ names: [] as string[], voters: [] as string[] }));
  return NextResponse.json({ enabled: pushConfigured(), ...league });
}

export async function POST(req: Request) {
  if (!pushConfigured()) return NextResponse.json({ error: 'Notifications are not set up' }, { status: 503 });
  const body = await req.json().catch(() => null);
  if (!isValidSub(body?.subscription)) return NextResponse.json({ error: 'Bad subscription' }, { status: 400 });
  try {
    let people: string[] | undefined;
    if (Array.isArray(body.people)) {
      const { names } = await getLeagueNames();
      people = body.people.filter((p: unknown): p is string => typeof p === 'string' && names.includes(p)).slice(0, 12);
    }
    return NextResponse.json({ ok: true, people: await saveSubscription(body.subscription, people) });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

export async function DELETE(req: Request) {
  if (!pushConfigured()) return NextResponse.json({ error: 'Notifications are not set up' }, { status: 503 });
  const body = await req.json().catch(() => null);
  if (typeof body?.endpoint !== 'string') return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  try { await deleteSubscription(body.endpoint); return NextResponse.json({ ok: true }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

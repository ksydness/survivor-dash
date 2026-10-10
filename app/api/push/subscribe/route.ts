import { NextResponse } from 'next/server';
import { pushConfigured, isValidSub, saveSubscription, deleteSubscription } from '@/lib/push';

export const dynamic = 'force-dynamic';

// GET → { enabled } (the 🔔 button hides itself until VAPID_PRIVATE_KEY is set).
// POST { subscription } — save this device. DELETE { endpoint } — forget it.
export async function GET() {
  return NextResponse.json({ enabled: pushConfigured() });
}

export async function POST(req: Request) {
  if (!pushConfigured()) return NextResponse.json({ error: 'Notifications are not set up' }, { status: 503 });
  const body = await req.json().catch(() => null);
  if (!isValidSub(body?.subscription)) return NextResponse.json({ error: 'Bad subscription' }, { status: 400 });
  try { await saveSubscription(body.subscription); return NextResponse.json({ ok: true }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

export async function DELETE(req: Request) {
  if (!pushConfigured()) return NextResponse.json({ error: 'Notifications are not set up' }, { status: 503 });
  const body = await req.json().catch(() => null);
  if (typeof body?.endpoint !== 'string') return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  try { await deleteSubscription(body.endpoint); return NextResponse.json({ ok: true }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

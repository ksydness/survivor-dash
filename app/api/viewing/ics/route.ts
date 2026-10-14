import { getViewingState } from '@/lib/viewing';
import { buildIcs } from '@/lib/viewingIcs';

export const dynamic = 'force-dynamic';

// "Just this night": the locked night as a one-off .ics (3 hours; all-day when the time is TBD). It won't
// update itself — the subscribable feed at /calendar.ics does (same UID, so the two describe one event).
export async function GET() {
  const { viewing: v, addresses } = await getViewingState();
  if (!v || v.status !== 'locked' || !v.lock_date) return new Response('No viewing is locked yet.', { status: 404 });
  return new Response(buildIcs([v], addresses, false), { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="survivor-viewing.ics"', 'Cache-Control': 'no-store' } });
}

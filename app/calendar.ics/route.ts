import { getCalendarNights } from '@/lib/viewing';
import { buildIcs } from '@/lib/viewingIcs';

export const dynamic = 'force-dynamic';

// Subscribable calendar of every locked viewing night (webcal://<site>/calendar.ics). Subscribed calendars
// re-fetch it on their own schedule (Apple: hourly-ish via REFRESH-INTERVAL; Google: every several hours),
// so moves, times, places, episodes and cancellations reach people's calendars without re-adding anything.
export async function GET() {
  try {
    const { nights, addresses } = await getCalendarNights();
    return new Response(buildIcs(nights, addresses, true), {
      headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="survivor-viewing-nights.ics"', 'Cache-Control': 'no-store' },
    });
  } catch {
    return new Response('Calendar unavailable — try again shortly.', { status: 503 });
  }
}

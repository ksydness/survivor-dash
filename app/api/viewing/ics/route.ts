import { getViewingState } from '@/lib/viewing';
import { addDays, epLabel, etToUtc } from '@/lib/viewingModel';

export const dynamic = 'force-dynamic';

// "Add to calendar": the locked night as an .ics file (3 hours; all-day when the time is TBD).
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const esc = (s: string) => s.replace(/[\\,;]/g, m => '\\' + m).replace(/\n/g, '\\n');

export async function GET() {
  const { viewing: v } = await getViewingState();
  if (!v || v.status !== 'locked' || !v.lock_date) return new Response('No viewing is locked yet.', { status: 404 });
  const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://survivor-dash.vercel.app';
  const when = v.lock_time
    ? [`DTSTART:${stamp(etToUtc(v.lock_date, v.lock_time))}`, `DTEND:${stamp(new Date(etToUtc(v.lock_date, v.lock_time).getTime() + 3 * 3600_000))}`]
    : [`DTSTART;VALUE=DATE:${v.lock_date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(v.lock_date, 1).replace(/-/g, '')}`];
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//survivor-dash//viewing//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:viewing-${v.id}@survivor-dash`, `DTSTAMP:${stamp(new Date())}`, ...when,
    `SUMMARY:${esc(`Survivor viewing · ${epLabel(v.episodes)}`)}`,
    ...(v.place ? [`LOCATION:${esc(v.place)}`] : []),
    `DESCRIPTION:${esc(`Fantasy Survivor viewing night. Details: ${site}/viewing`)}`,
    `URL:${site}/viewing`, 'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  return new Response(ics, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="survivor-viewing.ics"', 'Cache-Control': 'no-store' } });
}

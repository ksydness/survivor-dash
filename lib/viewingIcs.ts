// Calendar (.ics) for viewing nights — shared by the subscribable feed (/calendar.ics) and the one-off
// "just this night" download (/api/viewing/ics). Each night keeps the same UID (viewing-<row id>) for its
// whole life, and SEQUENCE = the row's version, so a subscribed calendar updates the event in place when
// the night moves, gets a time or a place, changes episodes — and drops it when it's cancelled.

import { addDays, addressFor, epLabel, etToUtc, type Viewing } from './viewingModel';

const SITE = () => process.env.NEXT_PUBLIC_SITE_URL || 'https://survivor-dash.vercel.app';
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const esc = (s: string) => s.replace(/[\\,;]/g, m => '\\' + m).replace(/\n/g, '\\n');
// RFC 5545: lines over 75 octets are folded (CRLF + space); every client reads unfolded lines back
const fold = (line: string) => {
  const out: string[] = []; let cur = ''; let bytes = 0;
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length;
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
};

function vevent(v: Viewing, addresses: Record<string, string>): string[] {
  const date = v.lock_date!;
  const when = v.lock_time
    ? [`DTSTART:${stamp(etToUtc(date, v.lock_time))}`, `DTEND:${stamp(new Date(etToUtc(date, v.lock_time).getTime() + 3 * 3600_000))}`]
    : [`DTSTART;VALUE=DATE:${date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(date, 1).replace(/-/g, '')}`];
  const addr = addressFor(v.place, addresses);
  return [
    'BEGIN:VEVENT', `UID:viewing-${v.id}@survivor-dash`, `SEQUENCE:${v.version}`, `DTSTAMP:${stamp(new Date())}`, ...when,
    `SUMMARY:${esc(`Survivor night · ${epLabel(v.episodes)}`)}`,
    ...(v.place ? [`LOCATION:${esc(addr ?? v.place)}`] : []),
    `DESCRIPTION:${esc(`Fantasy Survivor night${v.place ? ` at ${v.place}` : ''}${v.lock_time ? '' : ' (time TBD)'}. Details: ${SITE()}/viewing`)}`,
    `URL:${SITE()}/viewing`, 'END:VEVENT',
  ];
}

/** A whole calendar: `feed` adds a name + refresh hints so subscribed calendars re-check hourly. */
export function buildIcs(nights: Viewing[], addresses: Record<string, string>, feed: boolean): string {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//survivor-dash//viewing//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    ...(feed ? ['X-WR-CALNAME:Survivor nights', 'X-WR-TIMEZONE:America/New_York',
      'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'] : []),
    ...nights.filter(v => v.lock_date).flatMap(v => vevent(v, addresses)),
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

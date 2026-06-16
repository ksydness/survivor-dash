import { NextResponse } from 'next/server';

// Not used in the sheet-only architecture (no background sync job).
// Data is read on demand from the published Google Sheet and cached briefly.
// Kept as a harmless stub; if you migrate to the database path ("future-db/"),
// reintroduce a real sync here and re-add the cron entry to vercel.json.
export async function GET() {
  return NextResponse.json({ ok: true, note: 'no cron needed in sheet-only mode' });
}

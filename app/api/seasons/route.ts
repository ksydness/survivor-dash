import { NextResponse } from 'next/server';
import { getSeasons } from '@/lib/data';

// List all seasons from the Seasons control tab (for the landing page).
export async function GET() {
  try {
    const seasons = (await getSeasons())
      .map(({ season, name, status, num_weeks }) => ({ season, name, status, num_weeks })); // omit CSV URLs
    return NextResponse.json({ seasons }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    return NextResponse.json({ seasons: [], error: e?.message }, { status: 500 });
  }
}

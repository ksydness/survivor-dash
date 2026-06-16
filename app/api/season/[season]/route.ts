import { NextRequest, NextResponse } from 'next/server';
import { getSeasonPayload } from '@/lib/data';

export const maxDuration = 30;

export async function GET(req: NextRequest, ctx: { params: Promise<{ season: string }> }) {
  const { season: seasonStr } = await ctx.params;
  const season = parseInt(seasonStr, 10);
  const fresh = req.nextUrl.searchParams.get('sync') === '1'; // Refresh button bypasses cache

  try {
    const payload = await getSeasonPayload(season, fresh);
    if (!payload) return NextResponse.json({ error: 'season not found' }, { status: 404 });
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    console.error('season payload failed', e);
    return NextResponse.json({ error: e?.message ?? 'failed to load season' }, { status: 500 });
  }
}

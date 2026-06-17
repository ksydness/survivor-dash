import { NextRequest, NextResponse } from 'next/server';
import { getDraftData } from '@/lib/data';

export const maxDuration = 30;

export async function GET(req: NextRequest, ctx: { params: Promise<{ season: string }> }) {
  const { season: seasonStr } = await ctx.params;
  const season = parseInt(seasonStr, 10);
  const fresh = req.nextUrl.searchParams.get('sync') === '1';
  try {
    const data = await getDraftData(season, fresh);
    if (!data) return NextResponse.json({ error: 'season not found' }, { status: 404 });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'failed to load draft data' }, { status: 500 });
  }
}

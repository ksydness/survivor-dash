import { NextResponse } from 'next/server';
import { act, getViewingState, ViewingError } from '@/lib/viewing';

export const dynamic = 'force-dynamic';

// Viewing-night scheduler. GET → current poll / locked night + the roster (from the sheet).
// POST { action, me, as, key?, ... } → see lib/viewing.ts act(); returns the new state.
export async function GET(req: Request) {
  try {
    const fresh = new URL(req.url).searchParams.has('sync');
    return NextResponse.json(await getViewingState(fresh), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.action !== 'string') return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  try {
    return NextResponse.json(await act(body));
  } catch (e) {
    const status = e instanceof ViewingError ? e.status : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}

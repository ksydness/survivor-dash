import { NextResponse } from 'next/server';
import { tick } from '@/lib/viewing';

export const dynamic = 'force-dynamic';

// Called hourly by a Supabase pg_cron job (and harmless to call any time): closes polls whose
// deadline passed, sends the evening-before vote nudge and the morning-of reminder — each once.
async function run() {
  try { return NextResponse.json(await tick()); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
export const GET = run;
export const POST = run;

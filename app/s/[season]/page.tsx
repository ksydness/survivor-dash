import type { Metadata } from 'next';
import Dashboard from './dashboard';
import DraftRoom from './DraftRoom';
import { getSeasons } from '@/lib/data';

export const dynamic = 'force-dynamic';

// Per-season title/description for link previews (the OG image comes from
// ./opengraph-image.tsx via the file convention).
export async function generateMetadata(ctx: { params: Promise<{ season: string }> }): Promise<Metadata> {
  const { season } = await ctx.params;
  const n = parseInt(season, 10);
  let name = `Season ${n}`, status = '';
  try {
    const row = (await getSeasons()).find(r => r.season === n);
    if (row) { name = row.name || name; status = row.status; }
  } catch { /* keep defaults */ }
  const description = status === 'drafting'
    ? 'Live draft in progress — open on your phone to make your picks.'
    : status === 'final'
      ? 'Final standings, rosters and season stats.'
      : 'Live standings, rosters and weekly stats.';
  const title = `${name} · Fantasy Survivor`;
  return { title, description, openGraph: { title, description } };
}

// Server component — reads the season's status from the registry and renders
// either the live draft room (status = "drafting") or the normal dashboard.
export default async function SeasonPage(ctx: { params: Promise<{ season: string }> }) {
  const { season } = await ctx.params;
  const n = parseInt(season, 10);

  let status = 'active';
  try {
    const row = (await getSeasons()).find(r => r.season === n);
    if (row) status = row.status;
  } catch { /* fall back to dashboard */ }

  if (status === 'drafting') return <DraftRoom season={n} />;
  return <Dashboard season={n} />;
}

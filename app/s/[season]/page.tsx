import Dashboard from './dashboard';
import DraftRoom from './DraftRoom';
import { getSeasons } from '@/lib/data';

export const dynamic = 'force-dynamic';

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

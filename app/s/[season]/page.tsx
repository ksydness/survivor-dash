import Dashboard from './dashboard';

// Server component — passes the season number to the client dashboard,
// which fetches /api/season/[season] (mirrors geosports g/[group_code]/page.tsx).
export default async function SeasonPage(ctx: { params: Promise<{ season: string }> }) {
  const { season } = await ctx.params;
  return <Dashboard season={parseInt(season, 10)} />;
}

import { ogCard, OG_SIZE, OG_BRAND, ogTeamColor } from '@/lib/og';
import { getSeasons, getSeasonPayload } from '@/lib/data';

export const alt = 'Season preview — Fantasy Survivor';
export const size = OG_SIZE;
export const contentType = 'image/png';

// Per-season preview: draft in progress, current leader, or champion.
export default async function Image({ params }: { params: Promise<{ season: string }> }) {
  const { season } = await params;
  const n = parseInt(season, 10);
  try {
    const row = (await getSeasons()).find(r => r.season === n);
    if (!row) return ogCard({ heading: OG_BRAND.name, sub: `Season ${n}` });
    const heading = row.name || `Season ${n}`;
    if (row.status === 'drafting') {
      return ogCard({ heading, sub: `${OG_BRAND.name} · Live Draft`, detail: 'Draft in progress — tap to join' });
    }
    const p = await getSeasonPayload(n);
    const lead = p?.teamTotals[0];
    const firsts = (p?.teamTotals ?? []).filter(t => t.rank === 1);
    const final = row.status === 'final';
    const detail = !lead ? undefined
      : firsts.length > 1 ? `${final ? 'Co-champions' : 'Tied for 1st'}: ${firsts.map(t => t.team).join(' & ')} · ${lead.total} pts`
      : `${final ? 'Champion: ' : 'Leader: '}${lead.team} · ${lead.total} pts`;
    return ogCard({
      heading,
      sub: `${OG_BRAND.name} · ${final ? 'Final standings' : 'Live standings'}`,
      detail,
      detailColor: lead ? ogTeamColor(lead.team, 0) : undefined,
    });
  } catch {
    return ogCard({ heading: OG_BRAND.name, sub: `Season ${n}` });
  }
}

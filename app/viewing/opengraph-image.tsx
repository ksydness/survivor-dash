import { ogCard, OG_SIZE } from '@/lib/og';
import { getViewingState } from '@/lib/viewing';
import { todayET } from '@/lib/viewingModel';
import { situation } from '@/lib/viewingSituation';

export const alt = 'Next Survivor night — Fantasy Survivor';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const dynamic = 'force-dynamic';

// Link preview for /viewing: the poll's nights and deadline, or the night that's set.
export default async function Image() {
  const today = todayET();
  let p = situation({ viewing: null, votes: [], roster: { voters: [], teams: [] }, today }).preview;
  try { const st = await getViewingState(); p = situation({ viewing: st.viewing, votes: st.votes, roster: st.roster, today }).preview; } catch { /* generic card */ }
  return ogCard(p);
}

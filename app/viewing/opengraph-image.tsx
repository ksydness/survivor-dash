import { ogCard, OG_SIZE } from '@/lib/og';
import { getViewingState } from '@/lib/viewing';
import { previewLines } from '@/lib/viewingModel';

export const alt = 'Next Survivor night — Fantasy Survivor';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const dynamic = 'force-dynamic';

// Link preview for /viewing: the poll's nights and deadline, or the night that's set.
export default async function Image() {
  let p = previewLines(null);
  try { const st = await getViewingState(); p = previewLines(st.viewing, st.votes, st.roster); } catch { /* generic card */ }
  return ogCard(p);
}

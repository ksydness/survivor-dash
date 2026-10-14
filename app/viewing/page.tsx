import type { Metadata } from 'next';
import { getViewingState } from '@/lib/viewing';
import type { ViewingState } from '@/lib/viewingModel';
import { PLACES, barFor } from '@/lib/viewingModel';
import Viewing from './Viewing';
import { VW_CSS } from './styles';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Next viewing · Fantasy Survivor',
  description: 'Vote on the next watch night.',
};

export default async function ViewingPage({ searchParams }: { searchParams: Promise<{ go?: string }> }) {
  const { go } = await searchParams;
  let initial: ViewingState;
  try { initial = await getViewingState(); }
  catch {
    initial = { configured: false, roster: { voters: [], teams: [] }, viewing: null, votes: [], bar: barFor(4), places: PLACES, now: new Date().toISOString() };
  }
  return (
    <div className="vw">
      <style dangerouslySetInnerHTML={{ __html: VW_CSS }} />
      <Viewing initial={initial} go={go} />
    </div>
  );
}

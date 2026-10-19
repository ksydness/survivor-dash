import type { Metadata } from 'next';
import { getViewingState } from '@/lib/viewing';
import type { ViewingState } from '@/lib/viewingModel';
import { PLACES, barFor, previewLines } from '@/lib/viewingModel';
import Viewing from './Viewing';
import { VW_CSS } from './styles';

export const dynamic = 'force-dynamic';

// link previews show what's going on ("Vote: next Survivor night · Fri, Oct 30 or Sat, Oct 31")
export async function generateMetadata(): Promise<Metadata> {
  let p = previewLines(null);
  try { const st = await getViewingState(); p = previewLines(st.viewing, st.votes, st.roster); } catch { /* generic preview */ }
  const title = p.heading;
  const description = [p.sub, p.detail].filter(Boolean).join(' · ');
  return { title: `${title} · Fantasy Survivor`, description, openGraph: { title, description } };
}

export default async function ViewingPage({ searchParams }: { searchParams: Promise<{ go?: string }> }) {
  const { go } = await searchParams;
  let initial: ViewingState;
  try { initial = await getViewingState(); }
  catch {
    initial = { configured: false, roster: { voters: [], teams: [] }, viewing: null, votes: [], bar: barFor(4), places: PLACES, addresses: {}, now: new Date().toISOString() };
  }
  return (
    <div className="vw">
      <style dangerouslySetInnerHTML={{ __html: VW_CSS }} />
      <Viewing initial={initial} go={go} />
    </div>
  );
}

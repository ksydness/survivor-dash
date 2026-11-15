import type { Metadata } from 'next';
import { getHistory, getSeasons } from '@/lib/data';
import AppBar from '../AppBar';
import { CSS } from '../s/[season]/dash/styles';
import HistoryView from './HistoryView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'History · Fantasy Survivor',
  description: 'Every champion, every season, and the all-time records.',
};

// The all-time page. Reads the hub's History tab (written by Finalize Season) — nothing is re-scored.
// It used to be a tab inside every season's dashboard; /s/<n>?tab=history redirects here.
export default async function HistoryPage() {
  const [history, seasons] = await Promise.all([getHistory(), getSeasons().catch(() => [])]);
  const open = seasons.filter(s => s.status !== 'drafting').map(s => s.season);
  return (
    <div className="dash">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <AppBar title="History" back={{ label: 'Home', href: '/' }} />
      <div className="wrap">
        <main style={{ marginTop: 16 }}>
          <HistoryView history={history} open={open} />
        </main>
      </div>
    </div>
  );
}

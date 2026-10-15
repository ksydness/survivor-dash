'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * The home-screen app (and a backgrounded Safari tab) resumes the page exactly as it was left — so the
 * homepage could still say "Nothing on the calendar" hours after a poll started, or show last week's
 * standings. When the page comes back after a minute or more away, re-render it from the server.
 */
export default function ResumeRefresh({ after = 60_000 }: { after?: number }) {
  const router = useRouter();
  useEffect(() => {
    let hiddenAt = 0;
    const on = () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt >= after) router.refresh();
      hiddenAt = 0;
    };
    // pageshow covers iOS restoring the page from its back/forward cache
    const show = (e: PageTransitionEvent) => { if (e.persisted) router.refresh(); };
    document.addEventListener('visibilitychange', on);
    window.addEventListener('pageshow', show);
    return () => { document.removeEventListener('visibilitychange', on); window.removeEventListener('pageshow', show); };
  }, [router, after]);
  return null;
}

'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** While a draft is live, re-render the homepage's draft card every 15s so "on the clock" stays current. */
export default function DraftRefresh() {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible') router.refresh(); }, 15000);
    return () => clearInterval(id);
  }, [router]);
  return null;
}

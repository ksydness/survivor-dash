'use client';

import Link from 'next/link';
import { useState } from 'react';
import PushToggle from '../s/[season]/PushToggle';

/** Homepage top bar: title, scoring rules, and the notifications bell (its hint shows under the bar). */
export default function HomeBar() {
  const [hint, setHint] = useState<string | null>(null);
  return (
    <>
      <header className="bar">
        <span className="torch" aria-hidden>🔥</span>
        <h1>Fantasy Survivor</h1>
        <Link className="iconbtn" href="/scoring" aria-label="How scoring works" title="How scoring works">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4V4z" /><path d="M8 9h8M8 13h8M8 17h5" />
          </svg>
        </Link>
        <PushToggle variant="icon" onHint={setHint} />
      </header>
      {hint && <p className="hint" role="status">{hint}</p>}
    </>
  );
}

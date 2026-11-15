'use client';

// The one top bar every page uses: optional back button, title, page actions, notifications bell.
// Styles are in globals.css (.appbar); colors are the shared tokens declared there.

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import PushToggle from './s/[season]/PushToggle';

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
const IconBack = () => <svg width="22" height="22" viewBox="0 0 24 24" {...S}><path d="M15 18l-6-6 6-6" /></svg>;
const IconRules = () => <svg width="20" height="20" viewBox="0 0 24 24" {...S}><path d="M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4V4z" /><path d="M8 9h8M8 13h8M8 17h5" /></svg>;

/** Link to the scoring rules page, for a bar's actions. */
export const RulesLink = () => (
  <Link className="iconbtn" href="/scoring" aria-label="Scoring rules" title="Scoring rules"><IconRules /></Link>
);

type Back =
  | { label: string; href: string; reload?: boolean }  // reload = plain <a>, a full page load
  | { label: string; onClick: () => void };

export default function AppBar({ title, brand = false, back, onTitleClick, bell = true, children }: {
  title: ReactNode;
  brand?: boolean;             // 🔥 + gradient title (home and season pages); plain title elsewhere
  back?: Back;
  onTitleClick?: () => void;   // Survivor night's hidden commissioner-key gesture
  bell?: boolean;
  children?: ReactNode;        // page actions, shown before the bell
}) {
  const [hint, setHint] = useState<string | null>(null);
  return (
    <>
      <header className={`appbar${back ? '' : ' noback'}`}>
        {back && ('onClick' in back
          ? <button type="button" className="iconbtn" aria-label={back.label} onClick={back.onClick}><IconBack /></button>
          : back.reload
            ? <a className="iconbtn" href={back.href} aria-label={back.label}><IconBack /></a>
            : <Link className="iconbtn" href={back.href} aria-label={back.label}><IconBack /></Link>)}
        <div className={`ttl${brand ? ' brand' : ''}`}>
          {brand && <span className="torch" aria-hidden>🔥</span>}
          <h1 onClick={onTitleClick} style={onTitleClick ? { userSelect: 'none', WebkitUserSelect: 'none' } : undefined}>{title}</h1>
        </div>
        {children}
        {bell && <PushToggle variant="icon" onHint={setHint} />}
      </header>
      {hint && <p className="appbar-hint" role="status">{hint}</p>}
    </>
  );
}

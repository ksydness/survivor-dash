'use client';

// The homepage poll card's button. Who's on this phone lives in localStorage (set on /viewing), so the
// label is picked in the browser: Vote → Finish voting (2 of 3) → See results once every night is answered.
// Server render (and phones that haven't picked a name) show "Vote".

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ViewingOption, Vote } from '@/lib/viewingModel';

export default function VoteButton({ options, votes }: { options: ViewingOption[]; votes: Vote[] }) {
  const [me, setMe] = useState<string | null>(null);
  useEffect(() => {
    try { const w = JSON.parse(localStorage.getItem('survivor-viewer') || 'null'); if (w?.me) setMe(w.me); } catch { /* private mode */ }
  }, []);
  const answered = me ? options.filter(o => votes.some(x => x.option_id === o.id && x.person === me)).length : 0;
  const label = !me || answered === 0 ? 'Vote'
    : answered < options.length ? `Finish voting · ${answered} of ${options.length}`
      : 'See results';
  const done = answered > 0 && answered === options.length;
  return <Link className={done ? 'ghostbtn' : 'cta'} style={done ? { marginTop: 14 } : undefined} href="/viewing">{label}</Link>;
}

/** The homepage's set-night button: "Are you coming?" until this phone's person answers, then their answer. */
export function NightButton({ unsure, going, out, label }: { unsure: string[]; going: string[]; out: string[]; label: string }) {
  const [me, setMe] = useState<string | null>(null);
  useEffect(() => {
    try { const w = JSON.parse(localStorage.getItem('survivor-viewer') || 'null'); if (w?.me) setMe(w.me); } catch { /* private mode */ }
  }, []);
  if (me && unsure.includes(me)) return <Link className="cta" href="/viewing">Are you coming?</Link>;
  const said = me && going.includes(me) ? 'You’re in ✓' : me && out.includes(me) ? 'You can’t make it' : null;
  // once you've answered it's a status, not a call to action — same quiet button as "See results"
  if (said) return <Link className="ghostbtn" style={{ marginTop: 14 }} href="/viewing">{said} · Details</Link>;
  return <Link className="cta" href="/viewing">{label}</Link>;
}

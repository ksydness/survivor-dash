'use client';

// The homepage poll card's buttons. Who's on this phone lives in localStorage (set on /viewing), so the
// label is picked in the browser from this phone's part of the situation:
// Vote → Finish voting (2 of 3) → See results once every night is answered.
// Server render (and phones that haven't picked a name) show "Vote".

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { type ViewingState, todayET } from '@/lib/viewingModel';
import { situation } from '@/lib/viewingSituation';

function useMe(): string | null {
  const [me, setMe] = useState<string | null>(null);
  useEffect(() => {
    try { const w = JSON.parse(localStorage.getItem('survivor-viewer') || 'null'); if (w?.me) setMe(w.me); } catch { /* private mode */ }
  }, []);
  return me;
}

/** Only what the situation needs (keeps addresses etc. out of the homepage's client payload). */
export type PollSnapshot = Pick<ViewingState, 'viewing' | 'votes' | 'roster' | 'now'>;

const mineFor = (st: PollSnapshot, me: string | null) =>
  situation({ viewing: st.viewing, votes: st.votes, roster: st.roster, today: todayET(new Date(st.now)), people: me ? [me] : [] });

export default function VoteButton({ st }: { st: PollSnapshot }) {
  const me = useMe();
  const s = mineFor(st, me);
  const m = s.phase === 'voting' ? s.mine[0] : undefined;
  const label = !m || m.answered === 0 ? 'Vote'
    : !m.done ? `Finish voting · ${m.answered} of ${m.total}`
      : 'See results';
  const done = !!m?.done;
  return <Link className={done ? 'ghostbtn' : 'cta'} style={done ? { marginTop: 14 } : undefined} href="/viewing">{label}</Link>;
}

/** The homepage's set-night button: "Are you coming?" until this phone's person answers, then their answer. */
export function NightButton({ st, label }: { st: PollSnapshot; label: string }) {
  const me = useMe();
  const s = mineFor(st, me);
  const g = s.phase === 'set' ? s.mine[0] : undefined;
  if (g?.s === 'unsure') return <Link className="cta" href="/viewing">Are you coming?</Link>;
  const said = g?.s === 'in' ? 'You’re in ✓' : g?.s === 'out' ? 'You can’t make it' : null;
  // once you've answered it's a status, not a call to action — same quiet button as "See results"
  if (said) return <Link className="ghostbtn" style={{ marginTop: 14 }} href="/viewing">{said} · Details</Link>;
  return <Link className="cta" href="/viewing">{label}</Link>;
}

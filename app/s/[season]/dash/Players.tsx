'use client';

import { useMemo, useState } from 'react';
import type { SeasonPayload, Contestant } from '@/lib/types';
import { Dot, PlayerCard } from './bits';
import { bestWeek, colorFor, fmtDelta, latestWeek } from './model';
import { shortName } from '@/lib/teamNames';

type SortKey = 'total' | 'best' | 'name';

/** The Teams tab's "By player" view: everyone in one compact list (still in first, out folded away); tap a name for their card. */
export default function Players({ d }: { d: SeasonPayload }) {
  const [sort, setSort] = useState<SortKey>('total');
  const [team, setTeam] = useState<string>('all');
  const [openName, setOpenName] = useState<string | null>(null);
  const [showOut, setShowOut] = useState(false);
  const lw = latestWeek(d);
  const color = (c: Contestant) => colorFor(c.team);

  const rows = useMemo(() => {
    const r = d.contestants.filter(c => team === 'all' || c.team === team).map(c => ({ c, best: bestWeek(d, c).pts }));
    r.sort((a, b) => sort === 'name' ? a.c.name.localeCompare(b.c.name)
      : sort === 'best' ? b.best - a.best || b.c.total - a.c.total
      : b.c.total - a.c.total);
    return r;
  }, [d, sort, team]);
  const alive = rows.filter(r => !r.c.eliminated);
  const out = rows.filter(r => r.c.eliminated);

  const row = (c: Contestant, isOut: boolean) => {
    const open = openName === c.name;
    const wk = lw === null ? null : c.weeks[lw] ?? 0;
    return (
      <div key={c.name} className={`crow ${isOut ? 'out' : ''}`}>
        <button type="button" aria-expanded={open} onClick={() => setOpenName(open ? null : c.name)}>
          <Dot c={color(c)} />
          <span className="nm"><b>{c.name}</b><span>{shortName(c.team)}{isOut ? (c.out_week ? ` · out Wk ${c.out_week}` : ' · out') : ''}</span></span>
          {!isOut && wk !== null && d.meta.status === 'active' && <span className={`wk num ${wk < 0 ? 'neg' : ''}`}>{fmtDelta(wk)} wk</span>}
          <span className="tot num">{c.total}</span>
          <span className="chev" aria-hidden>{open ? '▴' : '▾'}</span>
        </button>
        {open && <div className="body" style={{ padding: 0 }}><PlayerCard d={d} c={c} color={color(c)} /></div>}
      </div>
    );
  };

  return (
    <>
      <div className="chips" role="group" aria-label="Filter by team">
        <button type="button" className="chip" aria-pressed={team === 'all'} onClick={() => setTeam('all')}>All teams</button>
        {d.teamTotals.map((t, i) => (
          <button key={t.team} type="button" className="chip" aria-pressed={team === t.team} onClick={() => setTeam(t.team)}><Dot c={colorFor(t.team)} />{shortName(t.team)}</button>
        ))}
      </div>

      <div className="phrow" style={{ margin: '4px 0 -6px' }}>
        <h2 className="ph">Still in · {alive.length}</h2>
        <label className="sortsel">Sort
          <select value={sort} onChange={e => setSort(e.target.value as SortKey)}>
            <option value="total">Total</option>
            <option value="best">Best week</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>
      {alive.length === 0 ? <div className="empty">Nobody still in{team === 'all' ? '' : ' on this team'}.</div>
        : <div className="clist">{alive.map(r => row(r.c, false))}</div>}

      {out.length > 0 && (
        <>
          <button type="button" className="outtoggle" aria-expanded={showOut} onClick={() => setShowOut(!showOut)}>
            Out · {out.length}<span>{showOut ? 'Hide' : 'Show'}</span>
          </button>
          {showOut && <div className="clist">{out.map(r => row(r.c, true))}</div>}
        </>
      )}
    </>
  );
}

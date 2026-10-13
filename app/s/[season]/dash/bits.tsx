'use client';

// Small shared pieces: icons, the "dig deeper" disclosure, players-left pips, mini bar charts and
// the player card (used by Teams and Contestants).
import { useState } from 'react';
import type { SeasonPayload, Contestant } from '@/lib/types';
import { bestWeek, initials, pointsRank, scoredSeries } from './model';

/* ── icons (inline stroke SVG, decorative) ── */
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
export const IconBack = () => <svg width="22" height="22" viewBox="0 0 24 24" {...S}><path d="M15 18l-6-6 6-6" /></svg>;
export const IconPrev = () => <svg width="20" height="20" viewBox="0 0 24 24" {...S} strokeWidth={2.2}><path d="M15 18l-6-6 6-6" /></svg>;
export const IconNext = () => <svg width="20" height="20" viewBox="0 0 24 24" {...S} strokeWidth={2.2}><path d="M9 18l6-6-6-6" /></svg>;
export const IconRefresh = () => <svg width="20" height="20" viewBox="0 0 24 24" {...S}><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></svg>;
export const IconBell = () => <svg width="20" height="20" viewBox="0 0 24 24" {...S}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>;
export const IconRules = () => <svg width="20" height="20" viewBox="0 0 24 24" {...S}><path d="M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4V4z" /><path d="M8 9h8M8 13h8M8 17h5" /></svg>;
export const IconClose = () => <svg width="18" height="18" viewBox="0 0 24 24" {...S} strokeWidth={2.2}><path d="M6 6l12 12M18 6L6 18" /></svg>;
export const IconSearch = () => <svg width="18" height="18" viewBox="0 0 24 24" {...S} stroke="#a8a29e"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>;
export const IconCup = ({ size = 22 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" {...S}><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></svg>;

export const Dot = ({ c, lg }: { c: string; lg?: boolean }) => <span className={`dot${lg ? ' lg' : ''}`} style={{ background: c }} aria-hidden />;

/** A collapsible "dig deeper" section. Starts closed unless `defaultOpen`. */
export function Disclosure({ title, sub, defaultOpen = false, children }: { title: string; sub?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="disc">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="dt"><b>{title}</b>{sub && <span>{sub}</span>}</span>
        <span className="act">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && <div className="body">{children}</div>}
    </section>
  );
}

/** Players-left pips: filled = still in, hollow = out. */
export function Pips({ left, size, color }: { left: number; size: number; color: string }) {
  return (
    <span className="pips" role="img" aria-label={`${left} of ${size} players left`}>
      {Array.from({ length: size }, (_, i) => (
        <span key={i} className="pip" style={i < left ? { background: color, borderColor: color } : { borderColor: '#57534e' }} />
      ))}
    </span>
  );
}

/** Vertical bars, one per week. Negative weeks red; the highlighted (best) week at full strength. */
export function WeekBars({ series, color, height = 64, highlightMax = false, labels = 'ends', label }: {
  series: { label: number; v: number }[]; color: string; height?: number; highlightMax?: boolean; labels?: 'all' | 'ends'; label: string;
}) {
  if (!series.length) return <div className="note">No weeks scored yet.</div>;
  const mx = Math.max(...series.map(s => s.v), 1);
  return (
    <>
      <div className="bars" style={{ height }} role="img" aria-label={label}>
        {series.map((s, i) => (
          <i key={i} style={{
            height: `${s.v <= 0 ? 3 : Math.max(6, (s.v / mx) * 100)}%`,
            background: s.v < 0 ? '#f87171' : color,
            opacity: s.v === 0 ? 0.25 : highlightMax ? (s.v === mx ? 1 : 0.55) : 0.9,
          }} />
        ))}
      </div>
      {labels === 'all'
        ? <div className="barlbl" aria-hidden>{series.map((s, i) => <span key={i}>{s.label}</span>)}</div>
        : <div className="ends" aria-hidden><span>Wk {series[0].label}</span><span>Wk {series[series.length - 1].label}</span></div>}
    </>
  );
}

/** The player card: points, best week, league rank and weekly bars. */
export function PlayerCard({ d, c, color, onClose, compact }: { d: SeasonPayload; c: Contestant; color: string; onClose?: () => void; compact?: boolean }) {
  const best = bestWeek(d, c);
  const series = scoredSeries(d, c.weeks);
  return (
    <div className="pcard" aria-live="polite">
      <div className="top">
        <div className="avatar" style={{ borderColor: color }} aria-hidden>{initials(c.name)}</div>
        <div className="who">
          <b>{c.name}</b>
          <span>{c.team} · {c.eliminated ? (c.out_week ? `out Wk ${c.out_week}` : 'out') : 'still in'}</span>
        </div>
        {onClose && <button type="button" className="iconbtn" onClick={onClose} aria-label={`Close ${c.name}'s card`}><IconClose /></button>}
      </div>
      {!compact && (
        <div className="ptiles">
          <div><b className="num">{c.total}</b><span>Points</span></div>
          <div><b className="num">{best.pts}</b><span>Best · Wk {best.label}</span></div>
          <div><b className="num">#{pointsRank(d, c)}</b><span>of {d.contestants.length}</span></div>
        </div>
      )}
      <WeekBars series={series} color={color} height={56} label={`${c.name} weekly points: ${series.map(s => s.v).join(', ')}`} />
    </div>
  );
}

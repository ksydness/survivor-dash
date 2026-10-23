import Link from 'next/link';
import { cookies } from 'next/headers';
import { getSeasons, getSeasonPayload, getHistory } from '@/lib/data';
import { getLiveDraft, liveDraftConfigured, type LiveState } from '@/lib/liveDraft';
import type { RegistryRow } from '@/lib/sheets';
import type { SeasonPayload } from '@/lib/types';
import { colorFor, historyModel, latestWeek, recap, standings, weekLabel, r2 } from './s/[season]/dash/model';
import { parseSeen, revealInfo, seenAsOf, seenCookie, shieldFor } from './s/[season]/dash/spoiler';
import SeasonCard, { type Frame } from './_home/SeasonCard';
import PushToggle from './s/[season]/PushToggle';
import DraftRefresh from './_home/DraftRefresh';
import ResumeRefresh from './_home/ResumeRefresh';
import HomeBar from './_home/HomeBar';
import { HOME_CSS } from './_home/styles';
import ViewingCard from './_home/ViewingCard';
import { getViewingState, viewingConfigured } from '@/lib/viewing';
import type { ViewingState } from '@/lib/viewingModel';

export const dynamic = 'force-dynamic';

/*
 * Homepage: the current season first (live standings + one big "Open" button that stays above the
 * fold on small phones), then the next viewing night (poll / locked, see /viewing), then score notifications, all-time titles and past seasons with their
 * champions. While a season is drafting, the top card becomes the draft's status + "Join the draft".
 * Everything is read from the sheet (and the live-draft row) — nothing is re-scored here.
 */

type Hero =
  | { kind: 'season'; row: RegistryRow; d: SeasonPayload; seen: number | null }
  | { kind: 'draft'; row: RegistryRow; live: LiveState | null }
  | { kind: 'plain'; row: RegistryRow };

async function loadHero(row: RegistryRow, seen: number | null): Promise<Hero> {
  if (row.status === 'drafting') {
    let live: LiveState | null = null;
    if (liveDraftConfigured()) {
      try { live = (await getLiveDraft(row.season))?.state ?? null; } catch { /* show the plain draft card */ }
    }
    return { kind: 'draft', row, live };
  }
  try {
    const d = await getSeasonPayload(row.season);
    if (d) return { kind: 'season', row, d, seen };
  } catch { /* fall back to a plain card with the Open button */ }
  return { kind: 'plain', row };
}

const seasonName = (r: RegistryRow) => r.name || `Season ${r.season}`;
const verb = (team: string) => (/[+&,]| and /.test(team) ? 'are' : 'is');

const Chevron = ({ size = 18, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 18l6-6-6-6" /></svg>
);
const Cup = ({ size = 20, stroke = 'currentColor' }: { size?: number; stroke?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
  </svg>
);

export default async function Home() {
  let seasons: RegistryRow[] = [];
  let err = '';
  try { seasons = await getSeasons(); }
  catch (e: any) { err = e?.message ?? 'Could not load seasons.'; }

  // the season people come for: the newest one that's live or drafting, else the newest one
  const cur = seasons.find(s => s.status === 'active' || s.status === 'drafting') ?? seasons[0] ?? null;
  const [hero, history, viewing] = await Promise.all([
    cur ? loadHero(cur, parseSeen((await cookies()).get(seenCookie(cur.season))?.value)) : Promise.resolve(null), getHistory(),
    // the next watch night (poll / locked) — never blocks the page if the scheduler can't be read
    viewingConfigured() ? getViewingState().catch(() => null) : Promise.resolve(null as ViewingState | null),
  ]);

  const h = historyModel({ history });
  const champions = h.teams.filter(t => t.titles.length > 0);
  const past = seasons.filter(s => s !== cur);
  // the History tab lives in any season's dashboard — but a drafting season's page is the draft room
  const histSeason = seasons.find(s => s.status !== 'drafting')?.season;

  return (
    <div className="home">
      <style dangerouslySetInnerHTML={{ __html: HOME_CSS }} />
      <HomeBar />
      <ResumeRefresh />

      <main>
        {err && <p className="msg err">{err}</p>}
        {!err && !seasons.length && <p className="msg">No seasons yet. Add a row to the <b>Seasons</b> tab in your sheet.</p>}

        {hero?.kind === 'season' && <ShieldedSeason row={hero.row} d={hero.d} seen={hero.seen} />}
        {hero?.kind === 'draft' && <DraftCard row={hero.row} live={hero.live} />}
        {hero?.kind === 'plain' && (
          <section className="card" aria-labelledby="cur">
            <div className="hrow">
              <h2 id="cur" className="eyebrow">{seasonName(hero.row)}</h2>
              {hero.row.status === 'active' ? <span className="pill"><i />Live</span> : <span className="pill done"><i />Final</span>}
            </div>
            <Link className="cta" href={`/s/${hero.row.season}`}>Open {seasonName(hero.row)}<Chevron /></Link>
          </section>
        )}

        {viewing && viewing.roster.voters.length > 0 && <ViewingCard st={viewing} />}

        {seasons.length > 0 && <PushToggle variant="card" />}

        {champions.length > 0 && (
          <section className="card titles" aria-labelledby="titles">
            <div className="hrow">
              <h2 id="titles" className="eyebrow">All-time titles</h2>
              {histSeason != null && <Link href={`/s/${histSeason}?tab=history`}>Full history ›</Link>}
            </div>
            <div style={{ marginTop: 8 }}>
              {champions.map(t => (
                <div key={t.team} className="trow">
                  <span className="who" style={{ gap: 2 }}>
                    <span className="tn"><span className="dot" style={{ background: colorFor(t.team) }} aria-hidden /><span>{t.team}</span></span>
                    <span className="won">Won {t.titles.map(s => `S${s}`).join(', ')}</span>
                  </span>
                  <span className="cups" role="img" aria-label={`${t.titles.length} title${t.titles.length === 1 ? '' : 's'}`}>
                    {t.titles.map(s => <Cup key={s} />)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {past.length > 0 && (
          <section className="past" aria-labelledby="past">
            <h2 id="past" className="eyebrow">{cur ? 'Past seasons' : 'Seasons'}</h2>
            <div className="plist">
              {past.map(s => {
                const rows = h.bySeason[s.season];
                const champ = rows?.find(r => r.place === 1);
                const second = rows?.find(r => r.place === 2);
                const label = s.status === 'active' ? 'Live' : s.status === 'drafting' ? 'Drafting' : 'Final';
                return (
                  <Link key={s.season} href={`/s/${s.season}`} className="prow"
                    aria-label={champ ? `Season ${s.season}: champion ${champ.team}, ${champ.points} points` : `${seasonName(s)}, ${label.toLowerCase()}`}>
                    <span className="sn"><span>Season</span><b>{s.season}</b></span>
                    <span className="pc">
                      {champ ? (<>
                        <span className="tn"><Cup size={15} stroke="#fcd34d" /><span>{champ.team}</span></span>
                        <span className="meta"><span className="dot" style={{ background: colorFor(champ.team) }} aria-hidden />
                          <span className="num">{champ.points} pts{second ? ` · won by ${r2(champ.points - second.points)}` : ''}</span></span>
                      </>) : (<>
                        <span className="tn"><span>{seasonName(s)}</span></span>
                        <span className="meta">{label}</span>
                      </>)}
                    </span>
                    <span className="chev"><Chevron color="currentColor" /></span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

/** One card frame: the season as of scored_weeks position k (what standings()/recap() say there). */
function frameOf(d: SeasonPayload, k: number, seen: number): Frame {
  const v = seenAsOf(d, k);
  const active = v.meta.status === 'active';
  const lw = latestWeek(v);
  const rc = recap(v);
  const tt = rc?.topTeam;
  return {
    week: lw !== null ? weekLabel(v, lw) : null,
    seen,
    headline: rc?.headline ?? (active ? 'No scores posted yet' : 'Season complete'),
    rows: standings(v),
    body: rc?.body || null,
    topTeam: tt ? { label: rc!.final ? `Week ${rc!.week} top team` : 'Top team this week', names: tt.names.length > 2 ? `${tt.names.length}-way tie` : tt.names.join(' & '), pts: tt.pts } : null,
    alive: v.contestants.filter(c => !c.eliminated).length,
    cast: v.contestants.length,
  };
}

/** The current season behind the spoiler shield: what this phone has revealed, then each hidden week. */
function ShieldedSeason({ row, d, seen }: { row: RegistryRow; d: SeasonPayload; seen: number | null }) {
  const sh = shieldFor(d, seen);
  const sw = d.meta.scored_weeks ?? [];
  const label = (k: number) => (k >= 0 ? weekLabel(d, sw[k]) : 0);
  const ks = [sh.k, ...sh.hidden];
  const frames = d.meta.status === 'active' ? ks.map(k => frameOf(d, k, label(k))) : [frameOf(d, sw.length - 1, label(sw.length - 1))];
  const reveals = d.meta.status === 'active' ? sh.hidden.map(k => revealInfo(d, k)) : [];
  return (
    <SeasonCard key={`${frames[0].seen}-${frames.length}`} season={row.season} name={seasonName(row)} active={d.meta.status === 'active'}
      frames={frames} reveals={reveals} hadCookie={seen !== null} />
  );
}

/** A drafting season: who's on the clock, the Join button, then each team's picks so far. */
function DraftCard({ row, live }: { row: RegistryRow; live: LiveState | null }) {
  const name = seasonName(row);
  const href = `/s/${row.season}`;
  const teams = live?.teams.length ? live.teams : row.teams;
  const n = teams.length;
  const picks = live?.picks ?? [];
  const total = live ? n * live.rounds : 0;
  const order = live?.order.length === n ? live.order : teams.map((_, i) => i);
  // snake: odd rounds run through the order, even rounds back
  const teamAt = (k: number) => { const r = Math.floor(k / n), p = k % n; return order[r % 2 === 0 ? p : n - 1 - p]; };

  let pill = { txt: 'In progress', done: false };
  let headline = 'Draft in progress';
  let lede = 'Open it on your phone and tap your team to make your picks.';
  let cta = 'Join the draft';
  let onClock: number | null = null;

  if (live?.phase === 'setup') {
    pill = { txt: 'Open', done: false };
    headline = 'The draft room is open';
    lede = 'Tap your team in the lobby — picks start when the commissioner hits Start.';
  } else if (live?.phase === 'drafting' && n > 0 && picks.length < total) {
    const k = picks.length;
    onClock = teamAt(k);
    const next = k + 1 < total ? teamAt(k + 1) : null;
    const paused = !live.deadline && live.pausedRemaining != null;
    if (paused) pill = { txt: 'Paused', done: false };
    headline = `${teams[onClock]} ${verb(teams[onClock])} on the clock`;
    lede = `Round ${Math.floor(k / n) + 1} · pick ${k + 1} of ${total}.${next !== null && next !== onClock ? ` ${teams[next]} pick next.` : next === onClock ? ` They pick again right after.` : ''}`;
  } else if (live?.phase === 'done') {
    pill = { txt: 'Done', done: true };
    headline = 'The draft is done';
    lede = `All ${picks.length} picks are in.`;
    cta = 'See the draft';
  }
  const last = picks.length ? picks[picks.length - 1] : null;
  const listed = order.filter(i => teams[i] != null);

  return (
    <section className="card" aria-labelledby="cur">
      {live && live.phase !== 'done' && <DraftRefresh />}
      <div className="hrow">
        <h2 id="cur" className="eyebrow">{name} · Draft</h2>
        <span className={`pill ${pill.done ? 'done' : ''}`}><i />{pill.txt}</span>
      </div>
      <p className="headline">{headline}</p>
      <p className="lede">{lede}</p>
      <Link className="cta" href={href}>{cta}<Chevron /></Link>

      {n > 0 && (
        <div className="rows" style={{ marginTop: 14 }}>
          {listed.map(i => {
            const mine = picks.filter(p => p.teamIndex === i);
            const color = colorFor(teams[i]);
            return (
              <div key={teams[i]} className="drow">
                <span className="tn">
                  <span className="dot" style={{ background: color }} aria-hidden />
                  <span style={{ flex: 1 }}>{teams[i]}</span>
                  {onClock === i && <span className="clock">On the clock</span>}
                  {live && <span className="count">{mine.length} of {live.rounds}</span>}
                </span>
                {mine.length > 0 && (
                  <span className="chips">{mine.map(p => <span key={p.overall} className="chip" style={{ borderColor: color }}>{p.contestant}</span>)}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
      {last && live?.phase === 'drafting' && (
        <div className="facts"><span>Last pick: <b>{last.contestant}</b> to {teams[last.teamIndex]}</span></div>
      )}
    </section>
  );
}

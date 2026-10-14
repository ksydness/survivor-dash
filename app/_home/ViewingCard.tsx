import Link from 'next/link';
import type { ViewingState } from '@/lib/viewingModel';
import { tally, waitingOn, attendees, teamsIn, todayET, dayLabel, timeLabel, deadlineLabel, epLabel, weekdayLong } from '@/lib/viewingModel';
import { colorFor } from '../s/[season]/dash/model';
import VoteButton from './VoteButton';

/** Homepage "Next viewing" card: nothing planned / poll open / no night worked / locked. Details live on /viewing. */
export default function ViewingCard({ st }: { st: ViewingState }) {
  const { viewing: v, votes, roster, bar } = st;
  const dots = (inTeams: string[]) => (
    <span className="vdots" role="img" aria-label={`${inTeams.length} of ${roster.teams.length} teams in`}>
      {roster.teams.map((t, i) => <i key={t} style={inTeams.includes(t) ? { background: colorFor(t, i), borderColor: colorFor(t, i) } : undefined} />)}
    </span>
  );

  if (!v) return (
    <section className="card" aria-labelledby="nv">
      <h2 id="nv" className="eyebrow">Next viewing</h2>
      <p className="headline">Nothing on the calendar</p>
      <p className="lede">Anyone can get the next one going.</p>
      <div className="vbtns">
        <Link className="cta" href="/viewing?go=start">Start a poll</Link>
        <Link className="ghostbtn" href="/viewing?go=add">We already picked a date</Link>
      </div>
    </section>
  );

  if (v.status === 'polling') {
    const t = tally(v.options, votes, roster);
    const lead = t[0]?.yes.length ? t[0] : null;
    const waiting = waitingOn(v.options, votes, roster);
    return (
      <section className="card" aria-labelledby="nv">
        <div className="hrow"><h2 id="nv" className="eyebrow">Next viewing</h2><span className="pill"><i />Poll open</span></div>
        <p className="headline">Pick a night for the next {epLabel(v.episodes)}</p>
        <p className="lede">{v.created_by} started it · vote by {v.deadline ? deadlineLabel(v.deadline) : '—'}</p>
        {lead && (
          <div className="vlead">
            <span><b>{dayLabel(lead.option.date)}</b> · {timeLabel(lead.option.time)} <em>Leading</em></span>
            <span className="vcount">{dots(lead.teamsIn)}<span className="num">{lead.teamsIn.length}/{roster.teams.length}</span></span>
          </div>
        )}
        <div className="facts">
          <span className="num">{roster.voters.length - waiting.length} of {roster.voters.length} voted · {v.options.length} options</span>
          {waiting.length > 0 && <span>Waiting on <b>{waiting.join(', ')}</b></span>}
        </div>
        <VoteButton options={v.options} votes={votes} />
      </section>
    );
  }

  if (v.status === 'closed') return (
    <section className="card" aria-labelledby="nv">
      <div className="hrow"><h2 id="nv" className="eyebrow">Next viewing</h2><span className="pill done"><i />Poll closed</span></div>
      <p className="headline">No night got {bar} of {roster.teams.length} teams</p>
      <p className="lede">Add more nights, pick a date, or lock one anyway.</p>
      <Link className="cta" href="/viewing">Decide</Link>
    </section>
  );

  // locked
  const date = v.lock_date!;
  const going = attendees(v, votes, roster);
  const inTeams = teamsIn(going, roster);
  return (
    <section className="card" aria-labelledby="nv">
      <div className="hrow"><h2 id="nv" className="eyebrow">Next viewing</h2><span className="pill"><i />{date === todayET() ? 'Tonight' : 'Locked'}</span></div>
      <p className="headline">{weekdayLong(date)}, {dayLabel(date).split(', ')[1]}{v.lock_time ? ` · ${timeLabel(v.lock_time)}` : ''}</p>
      <p className="lede">{v.place ? `At ${v.place}` : 'Where: not set yet'} · {epLabel(v.episodes)}{v.lock_time ? '' : ' · time TBD'}</p>
      <div className="facts"><span className="vcount">{dots(inTeams)}<span className="num">{inTeams.length} of {roster.teams.length} teams · {going.length} coming</span></span></div>
      <Link className="cta" href="/viewing">{!v.place || !v.lock_time ? 'Details · set what’s missing' : 'Details'}</Link>
    </section>
  );
}

import Link from 'next/link';
import type { ViewingState } from '@/lib/viewingModel';
import { todayET, dayLabel, timeLabel, deadlineLabel, epLabel, weekdayLong } from '@/lib/viewingModel';
import { situation } from '@/lib/viewingSituation';
import { colorFor } from '../s/[season]/dash/model';
import VoteButton, { NightButton } from './VoteButton';

/** Homepage "Next Survivor night" card: nothing planned / poll open / votes are in / no night worked / set. Details live on /viewing. */
export default function ViewingCard({ st }: { st: ViewingState }) {
  const { roster } = st;
  const today = todayET(new Date(st.now));
  const s = situation({ viewing: st.viewing, votes: st.votes, roster, today });
  const snap = { viewing: st.viewing, votes: st.votes, roster, now: st.now };
  const dots = (inTeams: string[]) => (
    <span className="vdots" role="img" aria-label={`${inTeams.length} of ${roster.teams.length} teams in`}>
      {roster.teams.map((t, i) => <i key={t} style={inTeams.includes(t) ? { background: colorFor(t, i), borderColor: colorFor(t, i) } : undefined} />)}
    </span>
  );

  if (s.phase === 'none') return (
    <section className="card" aria-labelledby="nv">
      <h2 id="nv" className="eyebrow">Next Survivor night</h2>
      <p className="headline">Nothing on the calendar</p>
      <p className="lede">Anyone can get the next one going.</p>
      <div className="vbtns">
        <Link className="cta" href="/viewing?go=start">Start a poll</Link>
        <Link className="ghostbtn" href="/viewing?go=add">We already picked a date</Link>
      </div>
    </section>
  );

  if (s.phase === 'voting') {
    const v = s.viewing;
    const lead = s.leading;
    return (
      <section className="card" aria-labelledby="nv">
        <div className="hrow"><h2 id="nv" className="eyebrow">Next Survivor night</h2><span className="pill"><i />Poll open</span></div>
        <p className="headline">Pick a night for the next {epLabel(v.episodes)}</p>
        <p className="lede">{v.created_by} started it · vote by {v.deadline ? deadlineLabel(v.deadline) : '—'}</p>
        {lead && (
          <div className="vlead">
            <span><b>{dayLabel(lead.option.date)}</b> · {timeLabel(lead.option.time)} <em>Leading</em></span>
            <span className="vcount">{dots(lead.teamsIn)}<span className="num">{lead.teamsIn.length}/{s.teams}</span></span>
          </div>
        )}
        <div className="facts">
          <span className="num">{s.voted} of {s.voters} voted · {v.options.length} options</span>
          {s.waitingOn.length > 0 && <span>Waiting on <b>{s.waitingOn.join(', ')}</b></span>}
        </div>
        <VoteButton st={snap} />
      </section>
    );
  }

  if (s.phase === 'needs-pick') return (
    <section className="card" aria-labelledby="nv">
      <div className="hrow"><h2 id="nv" className="eyebrow">Next Survivor night</h2><span className="pill"><i />Votes are in</span></div>
      <p className="headline">{s.viewing.created_by} picks the night</p>
      <p className="lede">{s.summary}</p>
      <Link className="cta" href="/viewing">See the votes</Link>
    </section>
  );

  if (s.phase === 'no-night') return (
    <section className="card" aria-labelledby="nv">
      <div className="hrow"><h2 id="nv" className="eyebrow">Next Survivor night</h2><span className="pill done"><i />Poll closed</span></div>
      <p className="headline">No night got {s.bar} of {s.teams} teams</p>
      <p className="lede">Add more nights, pick a date, or lock one anyway.</p>
      <Link className="cta" href="/viewing">Decide</Link>
    </section>
  );

  // set
  const v = s.viewing;
  const date = s.date;
  return (
    <section className="card" aria-labelledby="nv">
      <div className="hrow"><h2 id="nv" className="eyebrow">Next Survivor night</h2><span className="pill"><i />{date === today ? 'Tonight' : 'Set'}</span></div>
      <p className="headline">{weekdayLong(date)}, {dayLabel(date).split(', ')[1]}{v.lock_time ? ` · ${timeLabel(v.lock_time)}` : ''}</p>
      <p className="lede">{v.place ? `At ${v.place}` : 'Where: not set yet'} · {epLabel(v.episodes)}{v.lock_time ? '' : ' · time TBD'}</p>
      <div className="facts"><span className="vcount">{dots(s.teamsIn)}<span className="num">{s.teamsIn.length} of {s.teams} teams · {s.coming.length} coming{s.unsure.length ? ` · ${s.unsure.length} not sure` : ''}</span></span></div>
      <NightButton st={snap} label={!v.place || !v.lock_time ? 'Details · set what’s missing' : 'Details'} />
    </section>
  );
}

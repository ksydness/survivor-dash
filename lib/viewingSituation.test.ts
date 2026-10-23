import { describe, expect, it } from 'vitest';
import { buildRoster, type Answer, type Viewing, type Vote } from './viewingModel';
import { situation, type Situation } from './viewingSituation';

// League: 4 teams, 8 voters → bar = 3 teams.
const roster = buildRoster(['Kenny + Lena', 'Tony + Karina', 'Megan + Jake', 'Will + Kathleen'], []);
const TODAY = '2026-10-23';
const FRI = { id: 'fri', date: '2026-10-30', time: '18:30' };
const SAT = { id: 'sat', date: '2026-10-31', time: '18:00' };
const SUN = { id: 'sun', date: '2026-11-01', time: null };

const poll = (over: Partial<Viewing> = {}): Viewing => ({
  id: 'p1', status: 'polling', created_by: 'Kenny', created_at: '2026-10-20T12:00:00Z', version: 1,
  deadline: '2026-10-30T01:00:00Z', episodes: 2, options: [FRI, SAT, SUN],
  lock_date: null, lock_time: null, locked_at: null, locked_by: null, place: null, drops: [], rsvp: {}, ...over,
});

/** answers per person, in option order: 'y' | 'm' | 'n' | '-' (didn't answer) */
function votes(answers: Record<string, string>, options = [FRI, SAT, SUN]): Vote[] {
  return Object.entries(answers).flatMap(([person, s]) =>
    [...s].flatMap((a, i) => (a === '-' ? [] : [{ option_id: options[i].id, person, answer: a as Answer, cast_by: person }])));
}

function as<P extends Situation['phase']>(s: Situation, phase: P): Extract<Situation, { phase: P }> {
  expect(s.phase).toBe(phase);
  return s as Extract<Situation, { phase: P }>;
}

// Fri: Kenny+Lena, Tony+Karina, Megan+Jake say Yes (3 teams); Sat: 2 teams; Sun: nobody. Everyone answers everything.
const FRI_WINS = {
  Kenny: 'yyn', Lena: 'yyn', Tony: 'yyn', Karina: 'ynn', Megan: 'ynn', Jake: 'nnn', Will: 'nnn', Kathleen: 'nnn',
};

describe('nothing planned', () => {
  it('no poll', () => {
    const s = situation({ viewing: null, votes: [], roster, today: TODAY });
    expect(s.phase).toBe('none');
    expect(s.preview.sub).toBe('Nothing planned yet — anyone can start a poll');
  });
  it('cancelled or replaced polls count as nothing planned', () => {
    for (const status of ['cancelled', 'superseded'] as const)
      expect(situation({ viewing: poll({ status }), votes: [], roster, today: TODAY }).phase).toBe('none');
  });
  it('only the commissioner may act', () => {
    expect(situation({ viewing: null, votes: [], roster, today: TODAY, people: ['Kenny'] }).mayAct).toBe(false);
    expect(situation({ viewing: null, votes: [], roster, today: TODAY, commissioner: true }).mayAct).toBe(true);
  });
});

describe('voting', () => {
  it('"voted" means answered every night', () => {
    const s = as(situation({ viewing: poll(), votes: votes({ Kenny: 'yyn', Lena: 'y--' }), roster, today: TODAY }), 'voting');
    expect(s.voted).toBe(1);
    expect(s.waitingOn).toContain('Lena');
    expect(s.waitingOn).not.toContain('Kenny');
    expect(s.everyoneVoted).toBe(false);
  });

  it("this phone's people: answered counts", () => {
    const s = as(situation({ viewing: poll(), votes: votes({ Kenny: 'yyn', Lena: 'y--' }), roster, today: TODAY, people: ['Lena', 'Kenny'] }), 'voting');
    expect(s.mine).toEqual([
      { name: 'Lena', answered: 1, total: 3, done: false },
      { name: 'Kenny', answered: 3, total: 3, done: true },
    ]);
  });

  it('a clear winner once everyone has voted', () => {
    const s = as(situation({ viewing: poll(), votes: votes(FRI_WINS), roster, today: TODAY }), 'voting');
    expect(s.everyoneVoted).toBe(true);
    expect(s.clearWinner?.option.id).toBe('fri');
    expect(s.leading?.option.id).toBe('fri');
  });

  it('no clear winner while someone is still voting', () => {
    const { Kathleen: _, ...rest } = FRI_WINS;
    const s = as(situation({ viewing: poll(), votes: votes(rest), roster, today: TODAY }), 'voting');
    expect(s.waitingOn).toEqual(['Kathleen']);
    expect(s.clearWinner).toBeNull();
  });

  it('no clear winner on a tie', () => {
    const tie = { ...FRI_WINS, Megan: 'yyn' }; // Sat now has 3 teams too
    const s = as(situation({ viewing: poll(), votes: votes(tie), roster, today: TODAY }), 'voting');
    expect(s.everyoneVoted).toBe(true);
    expect(s.clearWinner).toBeNull();
  });

  it('Maybe breaks a tie in team count', () => {
    // Fri and Sat both have 2 teams with a Yes; Sat also has a Maybe from a third team
    const v = votes({ Kenny: 'yyn', Tony: 'yyn', Megan: 'nmn' });
    const s = as(situation({ viewing: poll(), votes: v, roster, today: TODAY }), 'voting');
    expect(s.nights[0].option.id).toBe('sat');
    expect(s.nights[0].teamsMaybe).toEqual(['Megan + Jake']);
  });

  it('nobody said Yes → nothing is leading', () => {
    const s = as(situation({ viewing: poll(), votes: votes({ Kenny: 'nnn' }), roster, today: TODAY }), 'voting');
    expect(s.leading).toBeNull();
  });
});

describe('closed: needs a pick / no night worked', () => {
  it('needs a pick when a night cleared but not everyone voted', () => {
    const { Will: _, Kathleen: __, ...rest } = FRI_WINS;
    const s = as(situation({ viewing: poll({ status: 'closed' }), votes: votes(rest), roster, today: TODAY }), 'needs-pick');
    expect(s.summary).toBe('Fri 6:30 PM has the most teams (3 of 4) · 6 of 8 voted');
    expect(s.didntLock).toBe('not-everyone-voted');
    expect(s.preview.sub).toBe('Votes are in — Kenny picks the night');
  });

  it('a tie needs a pick even when everyone voted', () => {
    const tie = { ...FRI_WINS, Megan: 'yyn' };
    const s = as(situation({ viewing: poll({ status: 'closed' }), votes: votes(tie), roster, today: TODAY }), 'needs-pick');
    expect(s.didntLock).toBe('no-single-leader');
    expect(s.leadLine).toBe('Fri 6:30 PM and Sat 6 PM are tied at 3 of 4 teams');
    expect(s.top.map(t => t.option.id)).toEqual(['fri', 'sat']);
  });

  it('only nights from today on count — a passed winner leaves no night', () => {
    const v = poll({ status: 'closed' });
    const s = situation({ viewing: v, votes: votes(FRI_WINS), roster, today: '2026-10-31' }); // Fri has passed
    const nn = as(s, 'no-night');
    expect(nn.nights.map(t => t.option.id)).toEqual(['sat', 'sun']);
    // the link preview agrees with the page (it used to still say "Votes are in")
    expect(nn.preview.sub).toBe('No night worked yet');
  });

  it('no night worked when nothing cleared the bar', () => {
    const s = situation({ viewing: poll({ status: 'closed' }), votes: votes({ Kenny: 'yyy', Tony: 'yyy' }), roster, today: TODAY });
    expect(s.phase).toBe('no-night');
  });
});

describe('set night', () => {
  const setFri = (over: Partial<Viewing> = {}) => poll({ status: 'locked', lock_date: FRI.date, lock_time: FRI.time, locked_by: 'auto', ...over });

  it('why-line counts "voted" the same way as the pick screen', () => {
    // Kathleen only answered Friday: she voted on something, but didn't finish voting
    const v = votes({ ...FRI_WINS, Kathleen: 'n--' });
    const s = as(situation({ viewing: setFri(), votes: v, roster, today: TODAY }), 'set');
    expect(s.why).toBe('3 of 4 teams said Yes — the most of any night · 7 of 8 voted');
    expect(s.waitingOn).toEqual(['Kathleen']);
    expect(s.picked?.id).toBe('fri');
  });

  it('who is coming starts from the poll (older nights with no saved answers)', () => {
    const s = as(situation({ viewing: setFri({ drops: ['Tony'] }), votes: votes({ ...FRI_WINS, Megan: 'm--' }), roster, today: TODAY }), 'set');
    expect(s.coming.map(g => g.name)).toEqual(['Kenny', 'Lena', 'Karina']);
    expect(s.out.map(g => g.name)).toEqual(['Tony', 'Jake', 'Will', 'Kathleen']);
    expect(s.unsure.map(g => g.name)).toEqual(['Megan']);
    expect(s.teamsIn).toEqual(['Kenny + Lena', 'Tony + Karina']);
  });

  it('saved answers win over the poll', () => {
    const rsvp = { Will: { s: 'in' as const, by: 'Will', at: '2026-10-25T00:00:00Z' } };
    const s = as(situation({ viewing: setFri({ rsvp }), votes: votes(FRI_WINS), roster, today: TODAY }), 'set');
    expect(s.coming.map(g => g.name)).toContain('Will');
  });

  it('a night added directly: no poll behind it, everyone starts as in', () => {
    const s = as(situation({ viewing: setFri({ options: [], locked_by: 'Tony', created_by: 'Tony' }), votes: [], roster, today: TODAY }), 'set');
    expect(s.picked).toBeNull();
    expect(s.why).toBeNull();
    expect(s.nights).toEqual([]);
    expect(s.waitingOn).toEqual([]);
    expect(s.coming).toHaveLength(8);
  });

  it("this phone's people", () => {
    const s = as(situation({ viewing: setFri(), votes: votes(FRI_WINS), roster, today: TODAY, people: ['Lena', 'Kenny'] }), 'set');
    expect(s.mine.map(g => g.name)).toEqual(['Kenny', 'Lena']);
  });

  it('preview names the night and place', () => {
    const s = situation({ viewing: setFri({ place: 'Tony + Karina’s' }), votes: [], roster, today: TODAY });
    expect(s.preview).toEqual({ heading: 'Survivor night', sub: 'Friday, Oct 30 · 6:30 PM', detail: 'At Tony + Karina’s' });
  });
});

describe('who may act', () => {
  const v = poll();
  it("the starter on their own phone", () => {
    expect(situation({ viewing: v, votes: [], roster, today: TODAY, people: ['Kenny', 'Lena'] }).mayAct).toBe(true);
  });
  it("not a phone that only votes for the starter", () => {
    expect(situation({ viewing: v, votes: [], roster, today: TODAY, people: ['Lena', 'Kenny'] }).mayAct).toBe(false);
  });
  it('the commissioner, on any phone', () => {
    expect(situation({ viewing: v, votes: [], roster, today: TODAY, people: ['Tony'], commissioner: true }).mayAct).toBe(true);
  });
});

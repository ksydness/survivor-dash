// Short team labels for tight spots (homepage standings, tiles, legends, draft board headers).
// Full names stay wherever there's room. The sheet keeps the full name — the app matches voters and
// colors by the people in it — so nicknames live here, not in the sheet.
// Tested in teamNames.test.ts.

/** The league's own nicknames. */
const NICKNAMES: Record<string, string> = {
  'Will + Kathleen + Anna + Dan': 'WAK’D',
  'Will + Kathleen + Anna': 'WAK',
};

/** Names this long or shorter fit everywhere ("Megan + Jake + Colt"). */
const FITS = 20;

/** "Will + Kathleen + Anna + Dan" → "WAK’D"; another long name → "Will +3"; short names unchanged. */
export function shortName(team: string): string {
  const nick = NICKNAMES[team.trim()];
  if (nick) return nick;
  if (team.length <= FITS) return team;
  const people = team.split(/\s*(?:\+|&|,|\band\b)\s*/i).map(x => x.trim()).filter(Boolean);
  return people.length > 1 ? `${people[0]} +${people.length - 1}` : team;
}

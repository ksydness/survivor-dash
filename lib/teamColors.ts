// Team colors — the one place they live (dashboard, homepage, draft room, Survivor night, link-preview images).
// A team's color depends only on its name, so it's the same on every screen:
//   1. a preset below, else
//   2. the preset team it shares the most people with ("Megan + Jake + Colt" → Megan + Jake's teal,
//      "Will" → Will + Kathleen + Anna's purple), so a roster change keeps its color with no code change, else
//   3. one of the spare colors, picked from the name (two brand-new teams could share one — then add a preset).
// Tested in teamColors.test.ts.

const PRESETS: [team: string, color: string][] = [
  ['Kenny + Lena', '#fb7185'],
  ['Tony + Karina', '#f59e0b'],
  ['Megan + Jake', '#2dd4bf'],
  ['Will + Kathleen + Anna', '#a78bfa'],
];
const SPARE = ['#60a5fa', '#f472b6'];

/** "Kenny + Lena" → ["kenny", "lena"] (also splits on &, commas and "and"). */
const members = (team: string) => team.split(/\s*(?:\+|&|,|\band\b)\s*/i).map(x => x.trim().toLowerCase()).filter(Boolean);

const cache = new Map<string, string>();

export function colorFor(team: string): string {
  const hit = cache.get(team);
  if (hit) return hit;
  const key = team.trim().toLowerCase();
  let color = PRESETS.find(([t]) => t.toLowerCase() === key)?.[1];
  if (!color) {
    const mine = members(team);
    let best = 0;
    for (const [t, c] of PRESETS) {
      const shared = members(t).filter(m => mine.includes(m)).length;
      if (shared > best) { best = shared; color = c; }
    }
  }
  if (!color) {
    let h = 0;
    for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    color = SPARE[h % SPARE.length];
  }
  cache.set(team, color);
  return color;
}

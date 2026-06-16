// Reads a Google Sheet that has been "Published to web" as CSV (per tab).
// No credentials needed. Each tab gets its own published-CSV URL, stored in
// seasons.sheet_csv_urls. If the sheet must stay private, swap this module for
// the Google Sheets API with a service account — the rest of the app is unchanged.
//
// NOTE: validate the row/column offsets below against the REAL published CSV.
// The Apps Script can shift rows (e.g. the Leaderboard "Top Contestant" row),
// so parsing is intentionally header/label-driven rather than fixed-index where
// possible.

export interface SheetUrls {
  episodes: string;
  contestants: string;
  leaderboard: string;
  scoring?: string;
  history?: string;
}

/** Minimal CSV parser (handles quoted fields + embedded commas/quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * Fetch a published-CSV tab. By default the result is cached for `revalidate`
 * seconds (stale-while-revalidate via Next's fetch cache); pass `fresh` to
 * bypass the cache (the dashboard Refresh button does this).
 */
export async function fetchCsv(url: string, opts: { fresh?: boolean; revalidate?: number } = {}): Promise<string[][]> {
  const res = await fetch(url, opts.fresh
    ? { cache: 'no-store' }
    : { next: { revalidate: opts.revalidate ?? 180 } });
  if (!res.ok) throw new Error(`CSV fetch failed (${res.status}) for ${url}`);
  return parseCsv(await res.text());
}

const num = (v: string) => {
  const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};

/** Episodes tab: col A = contestant, cols B.. = weekly points, last col = Total. */
export function parseEpisodes(rows: string[][], numWeeks: number) {
  const out: { contestant: string; week: number; points: number }[] = [];
  for (const r of rows.slice(1)) {
    const name = (r[0] || '').trim();
    if (!name) continue;
    for (let w = 1; w <= numWeeks; w++) {
      const cell = r[w];
      if (cell === undefined || cell === '') continue;
      out.push({ contestant: name, week: w, points: num(cell) });
    }
  }
  return out;
}

/** Contestants tab: col A = name, col B = team, (col D = round drafted). */
export function parseContestants(rows: string[][]) {
  return rows.slice(1)
    .map(r => ({ name: (r[0] || '').trim(), team: (r[1] || '').trim(), draft_round: r[3] ? num(r[3]) : null }))
    .filter(c => c.name && c.team);
}

/**
 * Leaderboard tab. Team rows have a name in col A and weekly ranks in cols C..
 * The "Top Contestant" / "Top Team" rows carry the weekly highlight strings
 * like "Aubry (134)". We locate those rows by label rather than index.
 */
export function parseLeaderboard(rows: string[][], numWeeks: number) {
  const ranks: Record<string, number[]> = {};
  const highlights: { week: number; top_contestant?: string; top_contestant_pts?: number; top_team?: string; top_team_pts?: number }[] = [];
  const teamTotals: { team: string; total: number }[] = [];

  const splitNamePts = (s: string) => {
    const m = (s || '').match(/^(.*?)\s*\((-?\d+)\)\s*$/);
    return m ? { name: m[1].trim(), pts: parseInt(m[2], 10) } : { name: (s || '').trim(), pts: undefined };
  };

  for (const r of rows.slice(1)) {
    const label = (r[0] || '').trim();
    if (!label) continue;
    if (label === 'Top Contestant') {
      for (let w = 1; w <= numWeeks; w++) {
        const v = splitNamePts(r[w + 1]); // weekly ranks start at col C (index 2) -> week w at index w+1
        if (v.name) highlights.push({ week: w, top_contestant: v.name, top_contestant_pts: v.pts });
      }
    } else if (label === 'Top Team') {
      for (let w = 1; w <= numWeeks; w++) {
        const v = splitNamePts(r[w + 1]);
        if (!v.name) continue;
        const h = highlights.find(x => x.week === w) || (highlights.push({ week: w }), highlights[highlights.length - 1]);
        h.top_team = v.name; h.top_team_pts = v.pts;
      }
    } else {
      // team row: col B = total, cols C.. = weekly rank
      teamTotals.push({ team: label, total: num(r[1]) });
      ranks[label] = [];
      for (let w = 1; w <= numWeeks; w++) {
        const cell = r[w + 1];
        if (cell !== undefined && cell !== '') ranks[label].push(num(cell));
      }
    }
  }
  return { ranks, highlights, teamTotals };
}

/** Scoring tab: col A = action, col B = points. */
export function parseScoring(rows: string[][]) {
  return rows.slice(1)
    .map(r => ({ action: (r[0] || '').trim(), points: num(r[1]) }))
    .filter(s => s.action);
}

export interface RegistryRow {
  season: number;
  name: string;
  status: 'active' | 'final';
  num_weeks: number;
  urls: { episodes: string; contestants: string; leaderboard: string; scoring?: string };
}

/**
 * The "Seasons" control tab — the app's index of which seasons exist.
 * Columns: Season | Name | Status | Episodes URL | Contestants URL | Leaderboard URL | Scoring URL | Weeks
 * Add a row to create a season; set Status to "final" to end it.
 */
export function parseRegistry(rows: string[][]): RegistryRow[] {
  return rows.slice(1)
    .filter(r => (r[0] || '').trim() && /^\d+$/.test((r[0] || '').trim()))
    .map(r => ({
      season: num(r[0]),
      name: (r[1] || '').trim() || `Season ${num(r[0])}`,
      status: ((r[2] || '').trim().toLowerCase() === 'final' ? 'final' : 'active') as 'active' | 'final',
      urls: { episodes: (r[3] || '').trim(), contestants: (r[4] || '').trim(), leaderboard: (r[5] || '').trim(), scoring: (r[6] || '').trim() || undefined },
      num_weeks: r[7] ? num(r[7]) : 14,
    }));
}

/**
 * The "History" tab — tidy all-time standings.
 * Columns: Season | Place | Team | Points  (one row per team per season)
 */
export function parseHistory(rows: string[][]) {
  return rows.slice(1)
    .filter(r => /^\d+$/.test((r[0] || '').trim()) && (r[2] || '').trim())
    .map(r => ({ season: num(r[0]), place: num(r[1]), team: (r[2] || '').trim(), points: num(r[3]) }));
}

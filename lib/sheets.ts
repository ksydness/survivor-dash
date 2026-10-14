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

/**
 * Episodes tab week metadata (doesn't change parseEpisodes):
 * - scored[i]: week column i+1 holds at least one number (S48's Team column in col B never counts).
 * - labels[i]: the week number shown in the sheet's header ("Week 3" → 3) so the site's week numbers
 *   match the sheet and the Out column. Headers differ by season (S50 starts at Week 1, S51 and Bake
 *   Off at Week 2, S49 repeats Week 2), so they're only used when they count up by one across every
 *   scored week; otherwise fall back to the column position (1, 2, 3…).
 */
export function parseEpisodeWeeks(rows: string[][], numWeeks: number) {
  const isNum = (v: string | undefined) => /^\s*-?\d+(\.\d+)?\s*$/.test(v ?? '');
  const scored = Array.from({ length: numWeeks }, (_, i) => rows.slice(1).some(r => (r[0] || '').trim() && isNum(r[i + 1])));
  const fromHdr = Array.from({ length: numWeeks }, (_, i) => {
    const m = ((rows[0] || [])[i + 1] || '').match(/week\s*(\d+)/i);
    return m ? parseInt(m[1], 10) : NaN;
  });
  const idx = scored.flatMap((s, i) => (s ? [i] : []));
  const consistent = idx.length > 0 && idx.every((i, k) => Number.isFinite(fromHdr[i]) && (k === 0 || fromHdr[i] - fromHdr[idx[k - 1]] === i - idx[k - 1]));
  const labels = consistent
    ? Array.from({ length: numWeeks }, (_, i) => fromHdr[idx[0]] + (i - idx[0]))
    : Array.from({ length: numWeeks }, (_, i) => i + 1);
  return { scored, labels };
}

/** Does the first row look like a header rather than data? (tolerates header-less tabs) */
function hasHeader(rows: string[][]): boolean {
  if (!rows.length) return false;
  const a = (rows[0][0] || '').trim(), b = (rows[0][1] || '').trim();
  return /contestant|name|player/i.test(a) || /^team$/i.test(b);
}

/**
 * Contestants tab: col A = name, col B = team, (col D = round drafted), plus an optional "Out" column.
 * Header optional. The Out column is found by its header ("Out" / "Eliminated", any column) so it only
 * applies to seasons that added one — older seasons and header-less tabs are untouched. Kenny types
 * the week they went out (e.g. "3"); any other non-empty value ("x", "yes") also counts as
 * eliminated, just without a week.
 */
export function parseContestants(rows: string[][]) {
  const header = hasHeader(rows);
  const outCol = header ? rows[0].findIndex(h => /^\s*(out|elim)/i.test(h || '')) : -1;
  const tracksOut = outCol >= 0;
  const body = header ? rows.slice(1) : rows;
  const contestants = body
    .map(r => {
      const outCell = tracksOut ? (r[outCol] || '').trim() : '';
      const wk = outCell.match(/\d+/);
      return {
        name: (r[0] || '').trim(), team: (r[1] || '').trim(), draft_round: r[3] ? num(r[3]) : null,
        eliminated: !!outCell, out_week: wk ? parseInt(wk[0], 10) : null,
      };
    })
    .filter(c => c.name && c.team);
  return { contestants, tracksOut };
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

/**
 * Draft tab → the board. Header row = teams in first-round order; one row per round; snake order is
 * implied (the overall pick number is computed in the UI). Tolerates both layouts in use:
 * - a label column A ("" / "Round" header, rows "Round 1" or "1") — S50/S51 and Bake Off sheets
 * - no label column (header starts with the first team) — the live draft room's export as pasted
 * Non-round rows after the board are ignored, except an "Undrafted" row (Bake Off S1), whose
 * comma-separated names are returned separately.
 */
export function parseDraft(rows: string[][]) {
  const head = rows[0] || [];
  const h0 = (head[0] || '').trim();
  const labelCol = h0 === '' || /^(round|rd|pick)s?$/i.test(h0);
  const start = labelCol ? 1 : 0;
  let last = head.length - 1;
  while (last >= start && !(head[last] || '').trim()) last--;
  const teams = head.slice(start, last + 1).map(t => (t || '').trim());
  const rounds: (string | null)[][] = [];
  let undrafted: string[] = [];
  for (const r of rows.slice(1)) {
    const label = (r[0] || '').trim();
    const cells = teams.map((_, i) => (r[start + i] || '').trim() || null);
    if (labelCol && /^undrafted/i.test(label)) {
      undrafted = r.slice(1).join(',').split(',').map(x => x.trim()).filter(Boolean);
      continue;
    }
    if (labelCol ? !/^(round|rd)?\s*\d+$/i.test(label) : cells.every(c => !c)) continue;
    if (cells.every(c => !c)) continue;
    rounds.push(cells);
  }
  return { teams: teams.filter(Boolean).length === teams.length ? teams : [], rounds, undrafted };
}

/**
 * Find a tab's published-CSV URL by its NAME, given any published-CSV URL from the same workbook.
 * Reads the workbook's /pubhtml page, which lists every published tab with its gid — so a tab works
 * without its own registry column as long as it's published (Entire Document, or that tab).
 * Returns null if the workbook isn't a published sheet or the tab isn't published.
 */
export async function findPublishedTab(anyCsvUrl: string, tab: string, opts: { fresh?: boolean } = {}): Promise<string | null> {
  const m = anyCsvUrl.match(/^(https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/[^/]+)\/pub/);
  if (!m) return null;
  const res = await fetch(`${m[1]}/pubhtml`, opts.fresh ? { cache: 'no-store' } : { next: { revalidate: 600 } });
  if (!res.ok) return null;
  const html = await res.text();
  const re = /name:\s*"((?:[^"\\]|\\.)*)",\s*pageUrl:\s*"[^"]*?gid(?:=|\\u003d)(\d+)/g;
  for (let x; (x = re.exec(html)); ) {
    if (x[1].trim().toLowerCase() === tab.toLowerCase()) return `${m[1]}/pub?gid=${x[2]}&single=true&output=csv`;
  }
  return null;
}

export interface RegistryRow {
  season: number;
  name: string;
  status: 'active' | 'final' | 'drafting';
  num_weeks: number;
  urls: { episodes: string; contestants: string; leaderboard: string; scoring?: string; draft?: string };
  teams: string[]; // optional Teams column (pipe-separated), used by the draft room
  voters: string[]; // optional Voters column (pipe-separated): who votes on viewing nights
}

/**
 * The "Seasons" control tab — the app's index of which seasons exist.
 * Columns (found by header, any order): Season | Name | Status | Episodes URL | Contestants URL | Leaderboard URL |
 * Scoring URL | Draft URL | Weeks | Teams | Voters
 * - Status: "active" (normal dashboard), "final" (season over), or "drafting" (show the draft room).
 * - Teams (optional): the league's teams pipe-separated, e.g. "Kenny + Lena|Tony + Karina|Megan + Jake|Will + Kathleen + Anna".
 *   Used by the draft room; if blank it falls back to the distinct teams found in the Contestants tab.
 * - Voters (optional): who votes on viewing nights, pipe-separated first names, e.g.
 *   "Kenny|Lena|Tony|Karina|Megan|Jake|Will|Kathleen". Blank = everyone named in the team names.
 * - Draft URL (optional): only needed if a season's Draft tab can't be found by name in its
 *   published workbook (see findPublishedTab).
 * Add a row to create a season; set Status to "final" to end it.
 */
export function parseRegistry(rows: string[][]): RegistryRow[] {
  // Columns are located by HEADER, so Kenny can add/reorder columns (e.g. a "Draft URL" column
  // inserted before Weeks) without shifting anything; the classic fixed positions are the fallback.
  const head = (rows[0] || []).map(h => (h || '').trim().toLowerCase());
  const col = (re: RegExp, dflt: number) => { const i = head.findIndex(h => re.test(h)); return i >= 0 ? i : dflt; };
  const C = {
    season: col(/^season$/, 0), name: col(/^name$/, 1), status: col(/^status$/, 2),
    episodes: col(/^episodes?\b/, 3), contestants: col(/^contestants?\b/, 4), leaderboard: col(/^leaderboard\b/, 5),
    scoring: col(/^scoring\b/, 6), weeks: col(/^weeks?$/, 7), teams: col(/^teams?$/, 8), draft: col(/^draft\b/, -1),
    voters: col(/^voters?$/, -1),
  };
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] || '').trim() : '');
  return rows.slice(1)
    .filter(r => /^\d+$/.test(cell(r, C.season)))
    .map(r => {
      const st = cell(r, C.status).toLowerCase();
      const status = st === 'final' ? 'final' : st === 'drafting' ? 'drafting' : 'active';
      const season = num(cell(r, C.season));
      return {
        season,
        name: cell(r, C.name) || `Season ${season}`,
        status: status as 'active' | 'final' | 'drafting',
        urls: {
          episodes: cell(r, C.episodes), contestants: cell(r, C.contestants), leaderboard: cell(r, C.leaderboard),
          scoring: cell(r, C.scoring) || undefined, draft: cell(r, C.draft) || undefined,
        },
        num_weeks: cell(r, C.weeks) ? num(cell(r, C.weeks)) : 14,
        teams: cell(r, C.teams).split('|').map(x => x.trim()).filter(Boolean),
        voters: cell(r, C.voters).split('|').map(x => x.trim()).filter(Boolean),
      };
    });
}

/** Cast list for drafting: contestant names from the Contestants tab (col A), team ignored. */
export function parseCast(rows: string[][]): string[] {
  const body = hasHeader(rows) ? rows.slice(1) : rows;
  return body.map(r => (r[0] || '').trim()).filter(Boolean);
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

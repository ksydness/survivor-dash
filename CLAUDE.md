# survivor-dash

A shareable web dashboard / hub for a friends-league **Fantasy Survivor** game. Each season,
players draft Survivor contestants onto teams and earn points based on what those contestants do
on the show. Scoring is tallied weekly in a Google Sheet; this app turns that sheet into a
beautiful, mobile-friendly, auto-updating dashboard anyone can open with a link.

> Modeled on the `geosports-dash` project (same stack, same patterns). If you've worked in that
> repo, everything here will feel familiar.

## How the game works (context for any future change)

- 4 teams draft 6 Survivor contestants each (24 total). See the **Draft** / **Contestants** tabs.
- Each episode, Kenny tallies contestant actions in the sheet's **Input** tab (e.g. "Wins Individual
  Immunity", "Finds hidden immunity idol", "Voted off with idol in pocket").
- A Google Apps Script (`Survivor Tools → Update Scores`) multiplies tallies by the **Scoring**
  point values, writes the week's points into **Episodes**, rolls them into team totals + ranks on
  **Leaderboard**, records the week's top contestant + top team, then clears Input for next week.
- The team with the most cumulative points at the finale wins the season.

**Key design principle:** the Google Sheet + Apps Script remain the source of truth and the scoring
engine. This app only *reads* the computed results — it does not re-tally or re-score. Kenny keeps
doing his weekly Input-tab tally exactly as before; the dashboard reflects it automatically.

## Stack (current: SHEET-ONLY, no database)

- **Framework**: Next.js 15 (App Router) — same as geosports-dash
- **Data source / "database"**: the Google Sheets themselves, read via **Publish to web → CSV**
  per tab (no credentials, no Supabase). A **Seasons** control tab is the app's registry of which
  seasons exist.
- **Caching**: Next.js fetch cache (`revalidate: 180s`); the dashboard Refresh button bypasses it.
- **Deployment**: Vercel, auto-deploys on push to `main`. No cron needed (reads are on-demand).

> **Future ("Path B")**: move off the sheet to a real database. The Supabase implementation is
> parked in `future-db/` (client, sync job, schema). To migrate, reimplement `lib/data.ts` to read
> from the DB — the `SeasonPayload` shape and all routes/UI stay identical.

## Data flow

```
Google Sheet (Kenny tallies Input → Apps Script computes Episodes + Leaderboard)
        │  (Publish-to-web CSV per tab)
        ▼
"Seasons" control tab ── registry: which seasons exist, status, + each season's CSV URLs
        ▼
lib/sheets.ts ── fetch + parse CSV (registry, episodes, contestants, leaderboard, history)
        ▼
lib/data.ts   ── getSeasons() / getSeasonPayload(season) — assemble payload, cached
        ▼
app/api/season/[season]  ── returns a season's full payload (?sync=1 bypasses cache)
        ▼
app/s/[season]/dashboard.tsx ── renders Leaderboard / Teams / Contestants / Stats / History
```

## Season lifecycle — 100% in Google Sheets

The app is driven by a **Seasons control tab** so all commissioner actions happen in the sheet
(never in code or a separate admin tool). One-time setup: publish that tab to web as CSV and set
`SEASONS_CSV_URL`.

**Seasons tab** columns: `Season | Name | Status | Episodes URL | Contestants URL | Leaderboard URL | Scoring URL | Weeks | Teams`

- `Status` is one of: `drafting` (show the draft room), `active` (normal dashboard), `final` (over).
- `Teams` (optional, last column): the league's teams pipe-separated, e.g.
  `Kenny + Lena|Tony + Karina|Megan + Jake|Will + Kathleen + Anna`. Used by the draft room; if blank
  it falls back to the distinct teams already in the Contestants tab.

- **Start a new season**: copy last season's sheet (keeps Apps Script + Scoring + Input), run the
  draft, fill the **Contestants** tab (name + team), publish the new sheet's tabs to web as CSV,
  then add a row to the Seasons tab with `Status = active` and the new CSV URLs. It appears at
  `/s/<n>` automatically.
- **End a season**: set that row's `Status` to `final`. Live badge drops; the dashboard reads its
  final numbers straight from the sheet.

### Draft room (`status = drafting`)

When a season's `Status` is `drafting`, `/s/<n>` renders a client-side snake-draft room
(`app/s/[season]/DraftRoom.tsx`) instead of the dashboard — built for one shared screen at an
in-person draft. No backend: all draft state lives in the browser and is saved to `localStorage`
(key `survivor-draft-s<n>`) so a refresh resumes. Data comes from `/api/draft/[season]`
(`getDraftData`): the **cast** = contestant names in the Contestants tab (col A, team ignored), and
the **teams** = the Seasons-tab `Teams` column.

Flow: randomize draft order → 45-second visual countdown per pick (warning + buzzer at 0:00, never
auto-picks) → click a contestant's Draft button to assign them and advance (snake order) → live
draft board grid → confetti on the final pick → copy-paste exports for the **Contestants** tab
(name + team) and the **Draft** tab. After drafting, paste the results in and flip `Status` to
`active`. To run a draft: set `Status = drafting`, put the cast names in the Contestants tab, and
fill the `Teams` column.
- **New teams**: just the `team` column on the Contestants tab — no separate setup. Team colors are
  auto-assigned in `dashboard.tsx` (`TEAM_COLORS` has nice presets + a fallback palette; add a
  name there only if you want a specific color).
- **Change scoring**: edit the **Scoring** tab and re-run *Update Scores* in the sheet. The app
  reads the computed results, so no app change is needed.

**History tab** (for the all-time page) columns: `Season | Place | Team | Points` — one row per team
per season. Set `HISTORY_CSV_URL` to its published-CSV URL. Seed seasons 46–50 once.

## Sheet tab schema (Season 50 reference)

The sync parses these tabs. Column positions below match the current sheet; validate against the
real published CSV when wiring sync (Apps Script can shift rows).

- **Episodes** — col A = contestant name; cols B..N = Week 1..13 points; (col O reserved Week 14);
  last col = Total. One row per contestant.
- **Contestants** — col A = contestant, col B = team name. (Also has Previous Team / Round Drafted,
  currently blank.)
- **Leaderboard** — col A = team (4 rows) then `Top Contestant` and `Top Team` rows; col B = team
  total; cols C.. = weekly rank per team and the weekly top-contestant/top-team strings like
  `"Aubry (134)"`.
- **Scoring** — col A = action, col B = points. The full rulebook (see below).
- **Draft** — round-by-round draft picks per team.
- **History** — past-season final standings (Seasons 46–50) + per-team averages/highs.
- **Input** — Kenny's weekly tally grid (NOT read by the app; it's cleared each week by the script).

### Scoring rulebook (Scoring tab)

| Action | Pts |
|---|---|
| Survives Round pre merge | 3 |
| Survives Round post merge | 6 |
| Participates in Reward | 2 |
| Bonus for 1st place team – Reward | 1 |
| Wins Team Immunity | 2 |
| Bonus for 1st place team – Immunity | 1 |
| Wins Individual Reward | 4 |
| Wins Individual Immunity | 6 |
| Finds clue to hidden immunity (reader of clue) | 1 |
| Finds hidden immunity (first to touch) | 3 |
| Receives advantage | 2 |
| Wins vote back after losing it | 2 |
| Loses vote (must actually not vote at tribal) | -3 |
| Uses hidden immunity idol | 6 |
| Uses advantage | 4 |
| Voted off with idol in pocket | -6 |
| Creates "Super Immunity Idol" | 3 |
| Successfully play Shot in the Dark | 6 |
| Vote cancellation bonus (per cancelled vote) | 1 |
| Makes fake idol | 2 |
| Gets someone to play fake idol | 4 |
| Quits voluntarily | -8 |
| Jury Vote | 10 |
| Sole Survivor | 20 |
| Wins Fire Challenge | 5 |
| Asks to be voted out | -3 |
| Looks in someone's bag | 1 |
| Requiring pixilation/blurriness over any body part | 1 |

Scoring lives entirely in the sheet's **Scoring** tab (the Apps Script reads it). `lib/scoring.ts`
ports this exact logic (Input × Scoring) for future use if we ever build an in-app tally UI
("Path B").

## Environment variables (set in Vercel dashboard)

| Variable | Description |
|---|---|
| `SEASONS_CSV_URL` | Published-CSV URL of the **Seasons** control tab (required) |
| `HISTORY_CSV_URL` | Published-CSV URL of the **History** tab (optional; powers the all-time page) |

> No database credentials in sheet-only mode. The parked Supabase path in `future-db/` would add
> `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` when/if you migrate.

## Deployment workflow

Claude can push code changes directly — no terminal needed:
1. Edit files (clone fresh from GitHub or work in a temp dir).
2. `git add -A && git commit -m "…" && git push` to the repo's `main`.
3. Vercel auto-deploys within ~1 minute.

GitHub token: classic PAT with `repo` scope — Kenny provides when needed (same as geosports).

## Key architecture decisions

- **Read-only over the sheet.** The app never writes back and never re-scores. The sheet + Apps
  Script stay the single source of truth; the app is a pure presentation layer.
- **Sheet-only, no database (for now).** `lib/data.ts` reads the published CSVs on demand and
  assembles the payload. Trade-off accepted: a season's sheet must stay published to render its
  detail; the History tab independently preserves all-time standings.
- **Caching.** `fetchCsv` uses Next's fetch cache (`revalidate: 180s`). The dashboard Refresh button
  hits `/api/season/[season]?sync=1`, which sets `{ fresh: true }` to bypass the cache so a new
  weekly update shows immediately.
- **Registry-driven.** The **Seasons** control tab is the index; `lib/data.getSeasons()` reads it.
  Adding/ending a season is a row edit in the sheet — no deploy, no admin UI.
- **Swap-friendly data layer.** All data access goes through `lib/data.ts`. The future DB migration
  only reimplements that file; `SeasonPayload`, the API routes, and the dashboard don't change.
- **`.npmrc` with `legacy-peer-deps=true`** — required for Vercel to resolve the Next 15 / React 19
  peer-dep conflict (same as geosports).
- **No cron.** Reads are on-demand + cached, so `vercel.json` has no cron. (The parked DB path would
  reintroduce one.)
- **Team colors** are presets + a fallback palette in `dashboard.tsx`; new team names render fine
  without a code change.

## Dashboard tabs

`app/s/[season]/dashboard.tsx` (design reference: `prototype/index.html`):
1. **Leaderboard** — final/standings cards + rank-through-the-season line chart + weekly highlights.
2. **Teams** — each team's roster with per-contestant point bars and team totals.
3. **Contestants** — sortable table of all contestants (team, best week, total, weekly trend spark).
4. **Stats** — season records (champion, top contestant, biggest week, margin, negative weeks).
5. **History** — all-time standings across seasons 46–50 + per-season final tables.

## Status / next steps

This repo contains the sheet-only scaffold + a working visual prototype (`prototype/index.html`,
real Season 50 data). Before first deploy:
1. Create the GitHub repo + Vercel project (no database needed).
2. Add a **Seasons** control tab and (optionally) a tidy **History** tab to the sheet; publish both
   to web as CSV.
3. Publish the Season 50 sheet's Episodes / Contestants / Leaderboard / Scoring tabs to web as CSV
   and put those URLs in the Seasons tab row.
4. Set `SEASONS_CSV_URL` (and `HISTORY_CSV_URL`) in Vercel.
5. Validate `lib/sheets.ts` parsing against the real published CSVs (row offsets — the Apps Script
   can shift the Leaderboard's Top Contestant / Top Team rows).
6. Push to `main` → Vercel deploys. Visit `/s/50`.

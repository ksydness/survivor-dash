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

**Seasons tab** columns (found by header): `Season | Name | Status | Episodes URL | Contestants URL | Leaderboard URL | Scoring URL | Draft URL | Weeks | Teams | Voters`

- `Status` is one of: `drafting` (show the draft room), `active` (normal dashboard), `final` (over).
- `Teams` (optional, last column): the league's teams pipe-separated, e.g.
  `Kenny + Lena|Tony + Karina|Megan + Jake|Will + Kathleen + Anna`. Used by the draft room; if blank
  it falls back to the distinct teams already in the Contestants tab.
- `Voters` (optional): who votes on viewing nights, pipe-separated first names, e.g.
  `Kenny|Lena|Tony|Karina|Megan|Jake|Will|Kathleen` (Colt, Anna and Dan don't vote). The newest row
  that has it wins; blank everywhere = every first name in the current season's team names.

- **Start a new season**: copy last season's sheet (keeps Apps Script + Scoring + Input), run the
  draft, fill the **Contestants** tab (name + team), publish the new sheet's tabs to web as CSV,
  then add a row to the Seasons tab with `Status = active` and the new CSV URLs. It appears at
  `/s/<n>` automatically.
- **End a season**: set that row's `Status` to `final`. Live badge drops; the dashboard reads its
  final numbers straight from the sheet.

### Draft room (`status = drafting`) — live, multi-device

When a season's `Status` is `drafting`, `/s/<n>` renders the live snake-draft room
(`app/s/[season]/DraftRoom.tsx`) instead of the dashboard. Every team drafts from its own device;
shared state lives in one Supabase row per (league, season) in the **bakeoff-drafts** project
(shared with bakeoff-dash, `league = 'survivor'`), pushed to all devices via Supabase Realtime with
a 3s polling fallback. Cast/teams come from `/api/draft/[season]` (`getDraftData`): **cast** =
contestant names in the Contestants tab, **teams** = the Seasons-tab `Teams` column. The sheet is
still the scoring source of truth — the finished draft is copy-pasted into the sheet as before.

Files: `lib/draftConfig.ts` (league + public Supabase URL/anon key, shipped in code),
`lib/liveDraft.ts` (store with optimistic versioning), `app/api/live-draft/[season]/route.ts`
(GET state; POST actions `create/configure/start/pick/undo/pause/resume/reset`, commissioner key
required for all but `pick`, turn + availability validated server-side, stale version → 409).

Flow: set `Status = drafting` → the commissioner opens `/s/<n>?key=<COMMISSIONER_KEY>` once (the
key sticks in that browser; the draft row auto-creates) → everyone opens `/s/<n>` and taps their
team in the lobby (or "Just watching"; the commissioner also picks a team and drafts like everyone
else, plus admin controls) → commissioner sets the order (🎲 Random/Re-roll, or ✍️ Set order
manually → seeds the sheet order with ▲/▼ per row, for when challenge results decide it),
picks-per-team and the pick clock (15–180s), Start → the on-clock team's device unlocks its Draft buttons; everyone gets the pick
announcement splash + ding, the on-clock team also gets a "You're on the clock!" splash + chime
(re-fires on snake double-picks), and non-on-clock teams see "Your next pick: N picks away". The
clock is server-anchored (`deadline` timestamp, padded ~5s so announcements finish before it
visibly starts) and buzz-only — it never auto-picks; the commissioner can pause/resume, undo, pick
for a stalled team, or reset. Confetti + copy-paste exports (Contestants + Draft tabs) on
completion. Device roles are kept in `localStorage` (`survivor-live-role-s<n>`,
`survivor-commish-key`). Picks are honor-system (no per-team auth) — accepted for a friends league.
- **New teams**: just the `team` column on the Contestants tab — no separate setup. Team colors are
  auto-assigned in `dash/model.ts` (`TEAM_COLORS` has nice presets + a fallback palette; add a
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

## Link previews, icons & app polish

No image files in the repo — everything renders at request time with `next/og` `ImageResponse`
(Satori: every multi-child `div` needs `display:flex`; emoji render via Twemoji). Same files exist
in bakeoff-dash with 🧁 branding — port changes to both.

- `lib/og.tsx` — shared card renderer (`OG_BRAND`, `ogTeamColor`, `ogCard`).
- `app/opengraph-image.tsx` (site card) + `app/s/[season]/opengraph-image.tsx` (per season:
  "Draft in progress — tap to join" while drafting, else Leader/Champion + points).
  `app/layout.tsx` sets `metadataBase` (hardcoded `https://survivor-dash.vercel.app`,
  `NEXT_PUBLIC_SITE_URL` overrides), Open Graph + Twitter `summary_large_image`;
  `app/s/[season]/page.tsx` has `generateMetadata` for per-season title/description.
- Icons: `app/icon.tsx` (64), `app/apple-icon.tsx` (180), `app/icon-512/route.tsx` (512, for the
  manifest) — 🔥 on `#0c0a09`. `viewport.themeColor = '#0c0a09'`.
- `app/manifest.ts` → `/manifest.webmanifest` with `display: standalone` (Add to Home Screen opens
  full-screen). `app/not-found.tsx` — branded 404.
- **Pull to refresh (home-screen app, 2026-10-13)**: `app/PullToRefresh.tsx`, rendered in
  `app/layout.tsx`. Only active in standalone mode (Add to Home Screen), where iOS/Android give no
  native pull-to-refresh; does nothing in a browser tab. Starts only at the top of the page, ignores
  sideways swipes, triggers at 70px of damped pull. Pages opt in with `usePullRefresh(fn)` — the
  dashboard uses `load(true)` (same as Refresh: bypasses the cache); everywhere else (homepage,
  scoring, draft room) it calls `router.refresh()`, which re-renders server data and keeps client
  state. Same file in bakeoff-dash.
- **Vercel Web Analytics** (2026-10-13, PR #8): `@vercel/analytics` + `<Analytics />` in
  `app/layout.tsx`; enabled in the Vercel project's Analytics tab. (The Vercel bot's PR #3 was
  closed — it also added ESLint 10 / a Next 16 lint config / a lockfile.)
- Hidden from search engines on purpose (friends-league, direct links only): `robots: { index:
  false, follow: false }` in layout metadata + `app/robots.ts` (`Disallow: /`). The site itself
  stays public (no Vercel Deployment Protection).

## Score notifications (Web Push, 2026-10-10)

Friends tap **🔔 Notify me** in the dashboard header to get a push when each week's scores are
posted. Android works in the browser; iPhone only after Add to Home Screen (iOS 16.4+) — a Safari
tab gets install instructions instead. The button hides itself until `VAPID_PRIVATE_KEY` is set.

- **Trigger (sheet side)**: the Apps Script's *Update Scores* menu item now calls
  `updateScoresAndNotify()` — runs the original scoring function untouched, and only if it added a
  new week schedules a one-minute time trigger (`notifyLeagueRetry`) that POSTs
  `/api/push/notify { key, week }`. Published CSV lags the sheet by a few minutes, so the route
  answers `pending` until the site sees that week; the trigger retries each minute (max 15).
  *Send Score Notification* (menu) resends the latest week manually (`force`). The commissioner
  key is asked once and kept in Script Properties. Retroactive Update never notifies.
- **Route** `app/api/push/notify`: key = `COMMISSIONER_KEY`; season defaults to the newest
  `active` registry row; week read via `getSeasonPayload` (lib/data.ts, no re-scoring). The message
  is short: "Week 3 scores are in" + the homepage recap's headline and first sentence (no 🔥 — the icon is one); tapping
  opens `/s/<n>?sync=1`, which the dashboard treats as a Refresh (bypasses the 3-min cache) and
  then strips from the URL. Each `(league, season, week)` is sent once (`push_sends` table).
  `GET /api/push/notify?season=N` previews the message without sending.
- **Storage**: tables `push_subscriptions` (endpoint, league, keys) and `push_sends` in the shared
  **bakeoff-drafts** Supabase project, RLS on with no policies (service role only). Dead
  subscriptions (404/410) are pruned on send.
- Files: `lib/pushConfig.ts` (public VAPID key + title/accent — the only per-league differences),
  `lib/push.ts`, `app/api/push/{subscribe,notify}/route.ts`, `app/s/[season]/PushToggle.tsx`,
  `public/sw.js` (push + click only, no offline cache). Identical in both repos apart from
  `pushConfig.ts` and survivor's `buildScoreMessage` copy (2026-10-15); both use the same VAPID key pair.

## Viewing nights (`/viewing`, 2026-10-13)

Schedules the league's watch nights (every ~2 weeks, usually 2 episodes) instead of group-text polls.
Design reference: the "Survivor Dash — Viewing Night Scheduler" canvas. Scoring and the sheet are untouched —
the sheet only supplies the roster (current season's `Teams` + the `Voters` column).

- **Who**: each phone picks "who are you" + anyone it votes for (couples) — `localStorage`
  `survivor-viewer` = `{ me, also[] }`. A vote someone casts for themselves always beats one cast for them
  (`cast_by`); results show "by Kenny". Honor system, like the draft room.
- **Poll**: anyone starts one (one open at a time; a closed one is superseded). Each day = one or more
  start times (up to `MAX_TIMES_PER_DAY` = 4, each its own option; 12 options max per poll) or Time TBD. Yes / Maybe / No per option. A team is "in" if anyone on it says Yes;
  bar = 3 of 4 teams (`barFor`). Best = most teams → Maybe breaks ties (see below) → most Yes → earliest. Votes due 9 PM ET on a day before
  the first night.
- **Locking**: auto at the deadline or the moment every voter has answered every option (if the best
  clears the bar; else status `closed` → "Lock anyway" / add nights & reopen / add a date). The poll
  starter or the commissioner (`survivor-commish-key`, shared with the draft room; `/viewing?key=…` saves it)
  can lock any option early, and cancel. In the home-screen app (no address bar, storage separate from
  Safari) the key is entered via a hidden field: tap the page title ("Survivor night") 5× within 2s → paste → checked
  server-side (action `checkkey`); that phone then shows "Commissioner ✓ · Remove".
- **Locked**: set the time (if TBD won) and where (quick picks from the hub workbook's **Places** tab, or
  typed), episodes stepper (starter / commissioner), Add to calendar (see Calendar below),
  I'm in / Can't make it (see "who's coming" below). "We already picked a date" locks directly.
  Whoever set it up (or the commissioner) can **Change date or time** (action `reschedule`): moves the
  locked row in place and pings "Moved to …"; a new *day* resets "can't make it" to "not sure" and re-arms the
  morning-of reminder.
  A locked night stays "next" through its date; then the homepage goes back to "Nothing on the calendar".
- **Places** (2026-10-14): the hub workbook (same one as the Seasons tab) has a **Places** tab
  (`Name | Address`), found by tab name via `findPublishedTab(SEASONS_CSV_URL, 'Places')` in
  `getPlaces()` (`lib/data.ts`) — no registry column or env var. Its names are the "where" quick picks; the
  locked card shows the address + **Get directions** (Apple Maps on Apple devices, Google Maps elsewhere —
  `directionsUrl`), the "where" push and morning-of reminder include the address, and the .ics LOCATION is
  the address. Names match loosely (`placeKey`: `&`/`+`/`and`, curly/straight apostrophes, case), so older
  rows saved as "Tony & Karina’s" still find "Tony + Karina's". Tab missing → falls back to `PLACES`
  (no addresses). A typed place gets a directions link from its text.
- **Calendar** (2026-10-14): `/calendar.ics` is a subscribable feed of every locked night (cancelled ones
  drop out), built by `lib/viewingIcs.ts`. Each night keeps UID `viewing-<row id>@survivor-dash` for life and
  `SEQUENCE` = the row's `version`, so subscribed calendars update moves / time / place / episodes in place
  and remove cancellations. `REFRESH-INTERVAL`/`X-PUBLISHED-TTL` = 1h (Apple honors; Google re-fetches every
  several hours on its own schedule). "Add to calendar" on the locked card opens a box: Subscribe
  (`webcal://` on Apple devices, Google's `calendar/r?cid=webcal://…` elsewhere, the other as secondary) +
  "Just this night (won't update)" → the one-off `/api/viewing/ics` (same builder, same UID). When nothing is
  locked, a "Get every Survivor night in your calendar · Subscribe" note sits under the main card.
  `robots.ts` allows `/calendar.ics` (Google's importer honors robots.txt); everything else stays disallowed.
- **Pushes** (same subscriptions as score notifications, `league = 'survivor'`; tap opens `/viewing`): poll
  started, night added, reopened, locked, moved, time/where set, someone drops, cancelled, no night cleared the bar;
  10 AM morning-of reminder. **Viewing pushes only go to devices whose `push_subscriptions.people` include a
  current voter** (`push()` in `lib/viewing.ts`); non-voters (Anna, Dan) and untagged devices get score pings
  only. Devices get tagged two ways: right after turning notifications on, `PushToggle` shows a
  "Who's this phone for?" sheet (everyone on the current teams, from `GET /api/push/subscribe` → `names`,
  saved via `POST { subscription, people }`; also seeds `survivor-viewer` with the voters picked), and a
  device already on but untagged is asked once on its next visit (Skip → `survivor-push-who-skipped`, never
  asked again). `/viewing`'s "who's voting" picker also tags the device (action `whoami`). The evening-before
  nudge additionally narrows to devices with a voter who hasn't voted.
- **Hardening after the first real poll (2026-10-14)**:
  - "Everyone voted" = every night answered, so **Done** with skipped nights saves them as No (vote action
    takes `option_ids[]`) — otherwise the voter stays in "Waiting on…", gets nudged, and blocks the early lock.
  - `add_date` ("We already picked a date") can't replace an open poll unless it's the poll starter or the
    commissioner; `/viewing?go=start|add` only opens the form when nothing is planned (else a flash says what is).
  - Reopen drops old nights on/before the new deadline day (they'd otherwise close — and could lock — after
    they happened); the form names them.
  - Nudge only goes out 9 AM–9 PM ET (`NUDGE_FROM_HOUR`); a night locked/moved onto today after 10 AM is
    marked reminded (no "Survivor tonight" an hour after "Locked").
  - Push tags are per event (`-start`, `-locked`, `-closed`, `-reopen`, `-cancel`, …) so a later ping never
    silently replaces an earlier one.
  - A saved `survivor-viewer` name that's no longer a voter is dropped on load; `whoami` never untags a device
    with an empty list. Typed places are stripped of control characters; `isYmd` rejects impossible dates.
  - Homepage `ResumeRefresh` re-renders after ≥1 min in the background (home-screen app resumes stale pages).
  - Not done (accepted for a friends league): anyone with the URL can act as anyone; two simultaneous "Start a
    poll" taps can create two polls (a partial unique index would fix it).
- **Voting + set-night update (2026-10-15)** — user-facing word is **"Survivor night"** everywhere (pings, page
  title, homepage card, calendar); code/routes still say "viewing".
  - Name picking is inline chips (`WhoInline`) wherever it's needed (voting, answering for a set night, Start a
    poll / Add the date); picking yourself asks "Also answering for <teammate>?"; a line tells non-voters (from
    the Teams names minus Voters: Colt, Anna, Dan) there's nothing to do.
  - **Proxies don't inherit powers**: lock / move / cancel / episodes need `me === created_by` (not a phone that
    votes for the starter) or the commissioner key. "Lock … now" is a quiet button with a confirm.
    Someone whose votes were cast for them sees "<Tony> answered for you — Looks right" (re-saves them as their
    own) instead of landing on the results.
  - **Maybe breaks ties**: rank = most teams with a Yes → most teams with a Yes or Maybe → most Yes → most Maybe →
    earliest (`tally`, `teamsMaybe`); maybe-only teams show as half-filled dots.
  - Episodes stepper only for the starter / commissioner; everyone else sees "2 episodes".
  - **Set nights track who's coming** (`viewings.rsvp` jsonb: `{ name: { s: in|out|unsure, by, at, said, prev } }`),
    written out for every voter when the night is set: Yes → in, No → out, Maybe / no vote → not sure ("said
    Maybe" shown); "We already picked a date" starts everyone as in. Action `rsvp { people, status }` (old `drop`
    maps onto it); one's own answer beats a proxy's. A new day on `reschedule` keeps "in" and resets "out" to "not
    sure". Pings only when the plan changes: someone becomes in ("Megan is in for Saturday" / "Back to 3 of 4
    teams"), or someone who was in drops ("Still 3 of 4 teams" / "Jake hasn't said yet" / "Down to 2 of 4");
    not sure → can't make it is silent; undoing your own change within 2 min is silent. The lock ping and 10 AM
    reminder add "You said Maybe — are you in?" for not-sure phones; the homepage button says "Are you coming?".
    Older rows (no `rsvp`) fall back to poll votes + `drops`.
  - Push copy: no 🔥 prefix (the icon is one); titles carry the news, bodies one detail (see `push(` calls).
    Score pings: "Week N scores are in" + the homepage recap headline (`lib/push.ts` — diverges from bakeoff-dash).
    Local dev prints every voter's would-be ping as `[push] Name: title | body` instead of sending.
  - Small "Share with the group text" link (share sheet / copy) under the poll, results and set night; `/viewing`
    has a live link preview (`previewLines` → `generateMetadata` + `app/viewing/opengraph-image.tsx`).
  - Copy no longer promises pings (most phones don't have notifications on yet).
- **Timed steps** run in `tick()` (`/api/viewing/tick`, idempotent, safe to call any time — no secret):
  a Supabase **pg_cron** job `survivor-viewing-tick` calls it hourly at :05 via pg_net. Every page load also
  runs the deadline check.
- **Storage**: `viewings` (one row per poll/night: status `polling|locked|closed|cancelled|superseded`,
  options jsonb, lock_date/lock_time, place, drops (legacy), rsvp jsonb, episodes, nudged_at/reminded_at, optimistic `version`)
  and `viewing_votes` (viewing_id, option_id, person, answer y/m/n, cast_by) in **bakeoff-drafts**, RLS on,
  no policies (service role only). Preview deployments have no service key today, so `/viewing` there
  says "not connected"; if one is ever added, previews use league `survivor-preview` and never send pushes.
- Files: `lib/viewingModel.ts` (types, Eastern-time helpers, tally — shared with the client),
  `lib/viewing.ts` (store, roster, actions, pushes, tick), `app/api/viewing/{route,tick/route,ics/route}.ts`,
  `app/viewing/{page,Viewing,styles}.tsx|ts`, homepage card `app/_home/ViewingCard.tsx` (below the season
  card so "Open Season N" stays above the fold).
- Local dev without the service key: `VIEWING_DEV_MEMORY=1 npx next dev` uses an in-memory store
  (never in production).

## Environment variables (set in Vercel dashboard)

| Variable | Description |
|---|---|
| `SEASONS_CSV_URL` | Published-CSV URL of the **Seasons** control tab (required) |
| `HISTORY_CSV_URL` | Published-CSV URL of the **History** tab (optional; powers the all-time page) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key of the shared **bakeoff-drafts** Supabase project (live draft writes) |
| `COMMISSIONER_KEY` | Secret string that unlocks commissioner controls via `/s/<n>?key=…` (also authorizes the sheet's score-notification calls) |
| `VAPID_PRIVATE_KEY` | Web Push private key (public half is in `lib/pushConfig.ts`); 🔔 button hidden while unset |

> The Supabase URL and anon key are public by design and ship in `lib/draftConfig.ts`
> (`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars override them if ever
> needed). Only the secrets above live in Vercel. The parked `future-db/` path is separate.

## Deployment workflow

Claude pushes through the GitHub connector (the "Claude Github MCP Connector" app is installed on
the account): `create_or_update_file` per file. The `sha` is the blob SHA of the file currently on
the remote — take it from the previous push result or `get_file_contents` (sandbox clones are
shallow and go stale, so `git rev-parse main:<path>` can be wrong); check the returned blob sha
equals `git hash-object <local file>`. `push_files` 403s. Then verify the Vercel auto-deploy went
READY (`list_deployments` on `prj_VxXVuN59tvb2To4BDTFlUPRsII3s`, team
`team_ehXYoYTnX36nTlQX4GkRIbwA`). `git push` / API writes from the sandbox are blocked by its proxy,
and a pasted PAT does not help — don't ask for one. Env var changes need a redeploy (any commit).

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
- **No Vercel cron.** Reads are on-demand + cached, so `vercel.json` has no cron. The viewing scheduler's
  hourly tick runs from Supabase pg_cron instead (see Viewing nights).
- **Team colors** are presets + a fallback palette in `dash/model.ts`; new team names render fine
  without a code change.

## Homepage (`app/page.tsx`)

Server-rendered from the same data as the dashboard (nothing re-scored). Styles: `app/_home/styles.ts`
(CSS string scoped under `.home`, same approach as `dash/styles.ts`).

1. **Current-season card** — the newest `active`/`drafting` season (else the newest season): recap
   headline, mini standings (rank + movement, points, this week, players-left pips; each row opens
   `/s/<n>?tab=teams&team=<team>`), then the **Open Season N** button. Keep the button above the fold:
   it sits ~510px down, inside an iPhone SE's visible area — put new detail *below* it (the recap
   sentence, top team, players still in are already there).
2. While a season is **drafting**, that card reads the live-draft row (`getLiveDraft`): who's on the
   clock, pick N of M, each team's picks, **Join the draft**; `_home/DraftRefresh.tsx` re-renders it
   every 15s. Falls back to a plain "Draft in progress" card if the live draft can't be read.
3. **Next viewing** card (`_home/ViewingCard.tsx`, see Viewing nights) — nothing planned / poll open /
   poll closed / locked; hidden if the scheduler can't be read.
4. **Notify me** card — `PushToggle variant="card"`, a nudge only for people who haven't turned
   notifications on: hidden once they're on (a one-visit "You're set" right after turning on), when
   the browser has blocked them, or for good on that device after its × (`localStorage`
   `survivor-notify-card-dismissed`). The bell in the top bar (`_home/HomeBar.tsx`, `variant="icon"`)
   is always there to turn them on/off; toggles on one page stay in sync via a `survivor-push-state`
   window event.
5. **All-time titles** (History tab, via `historyModel`) with a link to the History tab.
6. **Past seasons** — each with its champion and winning margin from the History tab.

## Dashboard tabs

`app/s/[season]/dashboard.tsx` is the shell (compact app bar, full-width week picker, one swipeable
row of tabs, `?tab=` and `?week=` kept in the URL). Each tab lives in `app/s/[season]/dash/`.
Design rule on every tab: **the answer people come for sits up top; deeper data is one tap away**
(player cards, team breakdowns, "Dig deeper" sections that start closed). Design references: the
"Survivor Dash — UX Mockups" canvas and the "Fantasy Survivor" design system (colors = its tokens,
declared once as CSS variables in `dash/styles.ts`).

- `dash/model.ts` — pure helpers + derived data (team colors `TEAM_COLORS`, `asOf` week rewind,
  standings with rank movement / points back / players left, the auto-written week recap, draft
  pick numbers + steals & busts, history aggregates). Nothing is re-scored.
- `dash/styles.ts` — the dashboard stylesheet, scoped under `.dash` and rendered only by the
  dashboard (the draft room shares the route).
- `dash/bits.tsx` — icons, `Disclosure`, `Pips`, `WeekBars`, `PlayerCard`.
1. **Leaderboard** (`dash/Leaderboard.tsx`) — week recap card, standings (▲/▼ movement, points
   back, bar vs leader, players-left pips); tap a team → its players with season + this-week points
   and a link to the Teams tab. Rank chart fits the screen. "Week by week" highlights in a disclosure.
2. **Teams** (`dash/Teams.tsx`, `?team=<name>` opens that team's breakdown) — players left per team, Find a player, every roster as name chips
   (out = dashed + crossed out); tap a name → player card; "Team breakdown" → where the points came
   from + team points by week.
3. **Contestants** (`dash/Contestants.tsx`) — compact list (sort Total / Best week / Name, team
   filter), still in first, out folded away; tap a row → player card.
4. **Draft** (`dash/Draft.tsx`, only when the Draft tab is published) — the whole board on one
   screen (rounds down, teams across, snake arrows), then steals & busts (pick # vs points; steal /
   bust = biggest gap between draft slot and points finish).
5. **Stats** (`dash/Stats.tsx`) — 4 headline tiles; Dig deeper: every-week-every-player heatmap,
   league points per week by team, more records.
6. **History** (`dash/History.tsx`) — reigning champs + titles; Dig deeper: finish by season,
   season-by-season results, points per season, all-time records.

`PushToggle.tsx` takes `variant="icon"` (bell in the app bar; hint text bubbles up via `onHint`) and
`variant="card"` (the homepage's notify card).
The default pill variant is unchanged, so bakeoff-dash's copy still matches if it isn't updated.

## Status / next steps

Live at https://survivor-dash.vercel.app with seasons 46–50 final and Season 51 `active` (the
first season drafted in the live draft room). `prototype/index.html` is the original design
reference. Ideas not yet built: returning-player context in the draft room, a search/filter box for
the 24-name pool, marking a contestant "out before the draft", an optional join code for picks, and
the parked `future-db/` scoring migration.

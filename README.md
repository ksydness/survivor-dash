# 🔥 survivor-dash

A shareable web hub for a friends-league **Fantasy Survivor** game. Your Google Sheet stays the
source of truth (you keep tallying in the **Input** tab); this app reads the computed results and
displays them as a clean, mobile-friendly, auto-updating dashboard with a link you can send anyone.

> Built to mirror the `geosports-dash` project — same stack and patterns. See **CLAUDE.md** for the
> full context (game rules, scoring, data flow, architecture) so any future change needs no
> re-explaining.

**Sheet-only**: no database. The app reads your published Google Sheet tabs directly, driven by a
**Seasons** control tab. Everything a commissioner does happens in the sheet.

## What's here

```
prototype/index.html   ← OPEN THIS — working dashboard preview w/ real Season 50 data
CLAUDE.md              ← project context / spec (read before changing anything)
app/                   ← Next.js App Router (landing, season dashboard, API routes)
lib/                   ← data.ts (sheet reader/assembler), sheets.ts (CSV parsers), scoring.ts, types.ts
future-db/             ← parked Supabase path for the eventual "drop the sheet" migration
```

## Tabs

Leaderboard (standings + rank-through-season chart + weekly highlights) · Teams (rosters) ·
Contestants (sortable, weekly trend) · Stats (records) · History (seasons 46–50).

## Quick start (local)

```bash
npm install
cp .env.local.example .env.local   # set SEASONS_CSV_URL (+ optional HISTORY_CSV_URL)
npm run dev
```

## Go live (one-time)

1. Create a **GitHub repo** + **Vercel project** (no database).
2. Add a **Seasons** tab to your sheet: `Season | Name | Status | Episodes URL | Contestants URL | Leaderboard URL | Scoring URL | Weeks`. (Optional **History** tab: `Season | Place | Team | Points`.)
3. **File → Share → Publish to web** → publish the Seasons tab, the History tab, and each season's
   Episodes / Contestants / Leaderboard / Scoring tabs as **CSV**. Paste the per-season URLs into the
   Seasons tab row (Status = `active`).
4. Set `SEASONS_CSV_URL` (and `HISTORY_CSV_URL`) in Vercel.
5. Push to `main` → Vercel deploys. Visit `/s/50`.

## Running it each season (all in the sheet)

- **New season** → copy last season's sheet, draft, fill Contestants, publish tabs, add a Seasons row.
- **End a season** → set that row's Status to `final`.
- **Change scoring** → edit the Scoring tab, re-run *Update Scores*.

After your weekly tally + *Update Scores*, the dashboard reflects it on the next refresh (or instantly
via the Refresh button).

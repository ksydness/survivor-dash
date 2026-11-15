# 🔥 survivor-dash

The web home for a friends-league **Fantasy Survivor** game: a live dashboard for every season, a
multi-device draft room, the Survivor night scheduler, and a spoiler-safe score reveal.

Live at https://survivor-dash.vercel.app (public link, hidden from search engines).

The Google Sheet stays the source of truth and the scoring engine. Kenny tallies each episode in
the **Input** tab and runs **Survivor Tools → Update Scores**; this app only reads the computed
results. Everything the commissioner does happens in the sheet.

**Read `CLAUDE.md` before changing anything** — it has the architecture, sheet schema and gotchas.

## What's here

```
app/page.tsx          homepage: current season, next Survivor night, titles, past seasons
app/s/[season]/       season dashboard (dashboard.tsx + dash/*) or the live draft room (DraftRoom.tsx)
app/viewing/          Survivor night scheduler (polls, votes, set night, calendar)
app/scoring/          scoring rules, read from the sheet's Scoring tab
app/AppBar.tsx        the top bar every page shares
app/globals.css       color tokens (declared once) + the top bar's styles
app/RevealSplash.tsx  the score reveal
app/api/              season data, live draft, Survivor night, push notifications
lib/data.ts           the only data access layer (sheet CSVs → payload, cached ~3 min)
lib/sheets.ts         CSV parsers (tolerant on purpose — older seasons differ)
lib/viewing*.ts       Survivor night rules, store, pushes
apps-script/          SurvivorTools.complete.gs — the script pasted into the hub workbook
future-db/            parked database path for an eventual move off the sheet (not used)
```

Data: scoring comes only from the published Google Sheet tabs listed in the hub's **Seasons** tab.
A small Supabase project holds live-draft state, Survivor nights and push subscriptions — never scores.

## Local

```bash
npm install
SEASONS_CSV_URL=<published Seasons tab CSV> npm run dev
npx tsc --noEmit      # typecheck before pushing
npm test              # Vitest
```

Survivor night changes: also run `scripts/e2e-viewing.py` (setup in its docstring).

## Each season (all in the sheet)

- **New season** → copy last season's workbook, publish it, **Survivor Tools → Start New Season**,
  set Status to `drafting`, run the draft, paste the exports, set Status to `active`.
- **Each episode** → tally in Input, **Update Scores**; type the week in the Contestants tab's `Out`
  column when someone goes home.
- **End a season** → **Survivor Tools → Finalize Season**.
- **Change scoring** → edit the Scoring tab and re-run Update Scores. No app change.

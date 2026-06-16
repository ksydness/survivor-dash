# future-db (parked)

These files implement the optional Supabase mirror / future database path ("Path B").
They are NOT used by the current sheet-only app. When you're ready to move off the
Google Sheet entirely, wire these back in and reimplement lib/data.ts to read from
Supabase instead of CSV — the SeasonPayload shape stays identical, so the API routes
and dashboard don't change.

- supabase.ts        — lazy Supabase client (Proxy pattern)
- sync.ts            — sheet → Supabase upsert job
- supabase-schema.sql — table definitions

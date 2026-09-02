// Live-draft configuration shared by the server store and the client room.
// The Supabase URL and anon (publishable) key are public by design — they only
// grant what RLS allows (read-only on the drafts table) — so they ship in code
// and env vars merely override them. The service role key and commissioner key
// are real secrets and live only in Vercel env vars.

export const LEAGUE = 'survivor';

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sgyxsmbmqtktvnktudww.supabase.co';

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNneXhzbWJtcXRrdHZua3R1ZHd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyMTE1MjgsImV4cCI6MjEwMzc4NzUyOH0.mHBi8dCzdi3zgW5iYdgfBKwcjAPKsoQI9fl3X-z2BgE';

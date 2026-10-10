// Web Push configuration shared by the server and the browser.
// The VAPID public key is public by design (browsers need it to subscribe), so it
// ships in code like the Supabase anon key; the private key lives only in the
// VAPID_PRIVATE_KEY Vercel env var.

export const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  'BBW6ok2oCIr9PaadtEi-HF6HxsMVFKmPo0TOEPeO0NeSY27XFmrcYWrPnnWPcXfh8yoPSQJKIgJ4Wo_fenr5CN0';

// Notification title prefix, e.g. "🔥 S51 · Week 3 scores are in"
export const PUSH_BRAND = {
  accent: '#f59e0b',   // 🔔 On button color
  emoji: '🔥',
  seasonLabel: (season: number, _name: string) => `S${season}`,
};

// VAPID 'subject' (contact for push services); VAPID_SUBJECT env overrides.
export const PUSH_SUBJECT = process.env.VAPID_SUBJECT || 'https://survivor-dash.vercel.app';

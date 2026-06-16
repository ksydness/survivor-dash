import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Server-side only — uses the service role key, never expose to the client.
// Lazy-initialized so Next.js can build without env vars present.
let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    _client = createClient(url, key);
  }
  return _client;
}

// Convenience alias — same as calling getSupabase() directly. Proxy pattern
// avoids `supabaseUrl is required` errors at build time. (Copied from geosports-dash.)
export const supabase = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    return (getSupabase() as any)[prop];
  },
});

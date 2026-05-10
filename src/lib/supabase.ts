import { createClient } from '@supabase/supabase-js';

/** Valid URL + non-empty key required by @supabase/supabase-js at init; missing env would throw and blank the page. */
const FALLBACK_SUPABASE_URL = 'https://local-dev-placeholder.supabase.co';
/** JWT-shaped placeholder so Supabase client initializes when env is unset (login/API calls will fail until you add a real project). */
const FALLBACK_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const url = import.meta.env.VITE_SUPABASE_URL?.trim() || FALLBACK_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || FALLBACK_SUPABASE_ANON_KEY;

if (
  import.meta.env.DEV &&
  (!import.meta.env.VITE_SUPABASE_URL?.trim() || !import.meta.env.VITE_SUPABASE_ANON_KEY?.trim())
) {
  console.warn(
    '[app] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — using placeholders. Add a `.env` file with your Supabase project URL and anon key for a working backend.'
  );
}

/** Hostname from `VITE_SUPABASE_URL` (for UI hints when debugging API / missing tables). */
export function getSupabaseProjectHost(): string {
  const u = import.meta.env.VITE_SUPABASE_URL?.trim() || '';
  try {
    return new URL(u).hostname;
  } catch {
    return u || '(env URL missing)';
  }
}

/** True when `.env` has your real project (required for Google OAuth; placeholders are not valid hosts). */
export function isSupabaseConfigured(): boolean {
  const u = import.meta.env.VITE_SUPABASE_URL?.trim();
  const k = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  const urlOk = Boolean(u && /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(u.replace(/\/+$/, '')));
  const keyOk = Boolean(
    k &&
      k !== 'your_anon_public_key_here' &&
      (k.startsWith('sb_publishable_') || k.startsWith('eyJ'))
  );
  return urlOk && keyOk;
}

export const supabase = createClient(url, anonKey, {
  auth: {
    flowType: 'pkce',
    // URL exchange runs once in AuthContext (exchangeCodeForSession) — avoids double-parse + Strict Mode consuming the PKCE code twice.
    detectSessionInUrl: false,
    persistSession: true,
    autoRefreshToken: true,
    storage: typeof globalThis !== 'undefined' ? globalThis.localStorage : undefined,
  },
});

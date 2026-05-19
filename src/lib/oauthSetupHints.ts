/** Supabase project ref from VITE_SUPABASE_URL (e.g. nmuvwvccvjlmuwzrfrtx). */
export function getSupabaseProjectRef(): string | null {
  const url = (import.meta.env.VITE_SUPABASE_URL || '').trim();
  const m = url.match(/https:\/\/([a-z0-9-]+)\.supabase\.co/i);
  return m?.[1] ?? null;
}

/** Must be listed on the Google OAuth Web client (Authorized redirect URIs). */
export function getGoogleOAuthCallbackForSupabase(): string | null {
  const ref = getSupabaseProjectRef();
  if (!ref) return null;
  return `https://${ref}.supabase.co/auth/v1/callback`;
}

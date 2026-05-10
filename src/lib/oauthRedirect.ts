/**
 * OAuth return URL — same-origin only (never user-controlled).
 * Must appear in Supabase → Authentication → URL Configuration → Redirect URLs.
 *
 * We use `/login` so the PKCE `?code=` is exchanged on the login page directly.
 * Add this exact URL in Supabase → Authentication → URL Configuration → Redirect URLs:
 *   http://localhost:5173/login
 */

/** Written by AuthContext when Google redirects with ?code= but no session results (consume one message on Login). */
export const OAUTH_CALLBACK_ERROR_STORAGE_KEY = 'smartdocs_oauth_login_hint';

export function getOAuthRedirectTo(): string {
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin.replace(/\/+$/, '');
  return `${origin}/login`;
}

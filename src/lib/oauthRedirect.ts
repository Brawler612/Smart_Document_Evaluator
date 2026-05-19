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
  return requiredOAuthRedirectUrl();
}

/** Exact URL Supabase must allow for OAuth return (current origin + /login). */
export function requiredOAuthRedirectUrl(): string {
  if (typeof window === 'undefined') return 'http://localhost:5173/login';
  const origin = window.location.origin.replace(/\/+$/, '');
  return `${origin}/login`;
}

/** Local dev should stay on 5173 so this matches Supabase Redirect URLs. */
export function isDevOAuthPortMismatch(): boolean {
  if (typeof window === 'undefined' || !import.meta.env.DEV) return false;
  const port = window.location.port;
  return port !== '' && port !== '5173';
}

/**
 * OAuth return URL — same-origin only (never user-controlled).
 * Must appear in Supabase → Authentication → URL Configuration → Redirect URLs.
 *
 * We use `/login` so the PKCE `?code=` is exchanged on the login page directly.
 * Add this exact URL in Supabase → Authentication → URL Configuration → Redirect URLs:
 *   http://localhost:5173/login
 */
export function getOAuthRedirectTo(): string {
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin.replace(/\/+$/, '');
  return `${origin}/login`;
}

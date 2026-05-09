/**
 * OAuth return URL — always same-origin (never user-controlled) to avoid open-redirect issues.
 * Must be listed under Supabase → Authentication → URL Configuration → Redirect URLs.
 */
export function getOAuthRedirectTo(): string {
  if (typeof window === 'undefined') return '';
  const path = '/login';
  try {
    const u = new URL(path, window.location.origin);
    if (u.origin !== window.location.origin) return `${window.location.origin}${path}`;
    return u.href;
  } catch {
    return `${window.location.origin}${path}`;
  }
}

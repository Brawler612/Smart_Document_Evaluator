/**
 * Optional campus email policy after OAuth (Google).
 *
 * Always uses the provider’s primary email. To get `@cit.edu`, students must sign in with
 * that campus account — the app cannot rename personal inboxes.
 */

/** Set by AuthContext when a student is signed out for wrong domain; Login reads and clears. */
export const STUDENT_EMAIL_REJECT_STORAGE_KEY = 'auth_domain_reject';

export function parseStudentEmailDomains(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) =>
      s
        .trim()
        .toLowerCase()
        .replace(/^@+/, '')
    )
    .filter(Boolean);
}

export function emailMatchesCampusDomains(email: string, domains: string[]): boolean {
  if (domains.length === 0) return true;
  if (!email.trim()) return false;
  const e = email.trim().toLowerCase();
  return domains.some((host) => e.endsWith('@' + host.toLowerCase()));
}

export function getConfiguredStudentDomains(): string[] {
  const v =
    typeof import.meta !== 'undefined' && typeof import.meta.env !== 'undefined'
      ? (import.meta.env.VITE_STUDENT_EMAIL_DOMAINS as string | undefined)
      : undefined;
  return parseStudentEmailDomains(v);
}

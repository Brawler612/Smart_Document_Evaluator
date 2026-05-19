import type { UserRole } from '../types';

/** Only this Gmail may use teacher/admin routes. */
export const SOLE_STAFF_EMAIL = 'dinaponash26@gmail.com';

/** Never treat these as staff — always student portal (project owner / eval accounts). */
const NEVER_STAFF_EMAILS = new Set([
  'trafalgardreii@gmail.com',
  'tragalgardreii@gmail.com',
]);

export function isStaffEmail(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;
  const lowered = email.trim().toLowerCase();
  if (NEVER_STAFF_EMAILS.has(lowered)) return false;
  return lowered === SOLE_STAFF_EMAIL;
}

/** Everyone else is a student, regardless of old DB role or OAuth metadata. */
export function resolveAppRole(email: string | null | undefined): UserRole {
  return isStaffEmail(email) ? 'admin' : 'student';
}

import { useEffect } from 'react';
import {
  getInvitedStudentRosterEntry,
  isInvitedStudent,
} from '../../data/invitedStudentEmails';
import { sendInvitationEmailOnce } from '../../lib/sendInvitationEmail';

/**
 * Headless component (renders nothing). When an invited student signs in for
 * the first time on this browser, it asks the serverless function at
 * `/api/send-invitation-email` to deliver the branded invitation email to
 * their Gmail inbox. Idempotent per-user via `localStorage` so the same
 * account never receives the email twice from the same browser.
 *
 * Replaces the previous visible yellow card — students should discover Smart
 * Docs through their Gmail inbox first, then click the "Open Smart Docs" CTA
 * in the email to land on the dashboard.
 */

const SIGNIN_LOG_PREFIX = 'sde_invited_signin_v1';

function signinLogKeyFor(userId: string): string {
  return `${SIGNIN_LOG_PREFIX}:${userId}`;
}

type Props = {
  /** Active student id. Storage is keyed by it so each Gmail sends once. */
  userId: string | null | undefined;
  /** Email of the signed-in student. Gates the send to invited gmails only. */
  email: string | null | undefined;
  /** Display name fallback when the roster lookup misses. */
  fullName?: string | null;
};

export default function InvitedStudentEmailNotifier({
  userId,
  email,
  fullName,
}: Props) {
  useEffect(() => {
    if (!userId || !email) return;
    if (!isInvitedStudent(email)) return;

    if (typeof localStorage !== 'undefined') {
      try {
        const auditKey = signinLogKeyFor(userId);
        if (!localStorage.getItem(auditKey)) {
          localStorage.setItem(auditKey, new Date().toISOString());
        }
      } catch {
        /* quota / private mode — best-effort */
      }
    }

    const rosterEntry = getInvitedStudentRosterEntry(email);
    const fname = rosterEntry
      ? `${rosterEntry.firstName} ${rosterEntry.lastName}`.trim()
      : fullName ?? null;

    void sendInvitationEmailOnce({ userId, email, fullName: fname }).then(
      (result) => {
        if (!result.ok && import.meta.env.DEV) {
          console.warn('[smart-docs] Invitation email send failed:', result.error);
        }
        if (result.ok && !result.skipped && import.meta.env.DEV) {
          console.info(
            `[smart-docs] Invitation email queued for ${email} (resend id: ${result.id ?? 'n/a'})`
          );
        }
      }
    );
  }, [userId, email, fullName]);

  return null;
}

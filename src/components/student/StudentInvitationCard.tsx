import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Star, X, ExternalLink, Sparkles } from 'lucide-react';
import {
  getInvitedStudentRosterEntry,
  isInvitedStudent,
} from '../../data/invitedStudentEmails';

/**
 * Storage key prefix — we append the user id so each Gmail account on the same
 * browser sees the invitation exactly once. Matches the pattern used by the
 * Eva tour (`sde_student_onboarding_v1:<userId>`).
 */
const STORAGE_KEY_PREFIX = 'sde_student_invitation_v1';
const SURVEY_DEFAULT_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSeZGz5bD6sf-XMKk3tjachS03eZOsLmDYb3Sd1GgtnB2o_qlA/viewform';

const SURVEY_URL =
  (import.meta.env.VITE_STUDENT_RATE_US_URL as string | undefined)?.trim() ||
  SURVEY_DEFAULT_URL;

function storageKeyFor(userId: string): string {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

/**
 * Per-user audit key that records when the system *first* detected this
 * invited student signing in. Cheap analytics with no DB round-trip — the
 * value is an ISO timestamp once written, then never overwritten.
 */
const SIGNIN_LOG_PREFIX = 'sde_invited_signin_v1';

function signinLogKeyFor(userId: string): string {
  return `${SIGNIN_LOG_PREFIX}:${userId}`;
}

type SeenState = 'open' | 'dismissed' | 'rated';

function readSeen(userId: string): SeenState | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKeyFor(userId));
    if (raw === 'dismissed' || raw === 'rated' || raw === 'open') return raw;
    return null;
  } catch {
    return null;
  }
}

function writeSeen(userId: string, state: SeenState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKeyFor(userId), state);
  } catch {
    /* quota / private mode */
  }
}

type Props = {
  /** Active student id — keyed storage so each invited gmail sees the card once. */
  userId: string | null | undefined;
  /** Email of the signed-in student. Used to gate the card to invited gmails only. */
  email: string | null | undefined;
  /** Display name fallback when the roster lookup misses. */
  fullName?: string | null;
};

/**
 * One-time invitation card for students explicitly invited to evaluate Smart
 * Docs. It appears as a floating, dismissible notification anchored just below
 * the top user pill — it never blocks page content and never re-opens once the
 * user closes it. The "Rate us now" CTA opens the Software Usability survey
 * in a new tab so the student can submit feedback right after they read it.
 */
export default function StudentInvitationCard({ userId, email, fullName }: Props) {
  const invited = isInvitedStudent(email);
  const rosterEntry = useMemo(
    () => (invited ? getInvitedStudentRosterEntry(email) : null),
    [invited, email]
  );

  /** Greeting prefers the official roster name, then the OAuth full name, then a generic. */
  const greetingName = useMemo(() => {
    if (rosterEntry) return rosterEntry.firstName.trim() || rosterEntry.lastName.trim();
    if (fullName) {
      const first = fullName.split(/\s+/)[0]?.trim();
      if (first) return first;
    }
    return 'there';
  }, [rosterEntry, fullName]);

  const [open, setOpen] = useState(false);

  /**
   * Decide visibility on user-id change. Brand new login on this browser
   * always opens the card; previously-seen users keep their dismissal.
   * Also stamps a one-time sign-in record for invited students so we can
   * later cross-check who actually arrived in the app.
   */
  useEffect(() => {
    if (!userId || !invited) {
      setOpen(false);
      return;
    }
    const seen = readSeen(userId);
    setOpen(seen === null || seen === 'open');

    if (typeof localStorage !== 'undefined') {
      try {
        const auditKey = signinLogKeyFor(userId);
        if (!localStorage.getItem(auditKey)) {
          localStorage.setItem(auditKey, new Date().toISOString());
          if (import.meta.env.DEV) {
            console.info(
              `[smart-docs] Invited student signed in: ${rosterEntry?.firstName ?? fullName ?? 'unknown'} ${rosterEntry?.lastName ?? ''} <${email}>`.trim()
            );
          }
        }
      } catch {
        /* quota / private mode — best-effort */
      }
    }
  }, [userId, invited, rosterEntry, email, fullName]);

  const handleClose = useCallback(() => {
    if (userId) writeSeen(userId, 'dismissed');
    setOpen(false);
  }, [userId]);

  const handleRate = useCallback(() => {
    if (userId) writeSeen(userId, 'rated');
    window.open(SURVEY_URL, '_blank', 'noopener,noreferrer');
    setOpen(false);
  }, [userId]);

  if (!invited || !userId || !open) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-labelledby="invited-student-title"
      className="fixed inset-x-3 top-3 z-[58] mx-auto flex w-auto max-w-[min(100%,28rem)] origin-top animate-[fadeSlideIn_0.35s_ease-out] flex-col overflow-hidden rounded-2xl border-2 border-amber-300 bg-white shadow-2xl shadow-amber-500/20 sm:inset-x-auto sm:right-5 sm:top-20"
    >
      <div className="flex items-start gap-3 bg-gradient-to-r from-amber-100 via-amber-50 to-white px-4 py-3">
        <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-400 text-amber-950 shadow-inner">
          <Bell className="h-[1.1rem] w-[1.1rem]" aria-hidden />
          <span className="pointer-events-none absolute -right-0.5 -top-0.5 inline-flex h-2.5 w-2.5 animate-ping rounded-full bg-rose-500 opacity-75" />
          <span className="pointer-events-none absolute -right-0.5 -top-0.5 inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-amber-700">
            Smart Docs Invitation
          </p>
          <h2
            id="invited-student-title"
            className="mt-0.5 truncate text-sm font-extrabold text-amber-950"
          >
            Welcome, {greetingName}!
          </h2>
        </div>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Dismiss invitation"
          className="-mr-1 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-amber-900/70 transition hover:bg-amber-200/60 hover:text-amber-950"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-4 pb-4 pt-2 text-[13px] leading-relaxed text-slate-700">
        <p>
          You have been <span className="font-bold text-amber-800">invited</span> to evaluate{' '}
          <span className="font-bold text-[#84001B]">Smart Docs Validator</span>. Try uploading a
          task, walk through the AI report, and then let us know what worked and what to improve.
        </p>
        <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-1.5 text-[11.5px] font-semibold text-amber-900">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Your feedback shapes what ships next.
        </div>

        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            Maybe later
          </button>
          <button
            type="button"
            onClick={handleRate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#84001B] px-3.5 py-2 text-[12px] font-extrabold uppercase tracking-wide text-white shadow-sm transition hover:bg-[#6b0016] focus:outline-none focus:ring-2 focus:ring-[#ffd21a]"
          >
            <Star className="h-3.5 w-3.5 fill-[#ffd21a] text-[#ffd21a]" aria-hidden />
            Rate us now
            <ExternalLink className="h-3 w-3 opacity-80" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

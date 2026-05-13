/**
 * Client helper: ask the Vercel serverless function at
 * `/api/send-invitation-email` to deliver a one-time invitation email to an
 * invited student's Gmail. Idempotent per-user via `localStorage` so the same
 * account never receives the email twice from the same browser.
 *
 * The function is deliberately fire-and-forget from the UI's perspective — a
 * failure (missing RESEND_API_KEY, network blip, Resend outage) must NEVER
 * block the dashboard, so callers should NOT await the result on the render
 * path. The returned promise is exposed only for diagnostics + the CLI test
 * scripts that want to surface the outcome.
 */

const SENT_KEY_PREFIX = 'sde_invitation_email_sent_v1';

function storageKey(userId: string): string {
  return `${SENT_KEY_PREFIX}:${userId}`;
}

function alreadySent(userId: string): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return Boolean(localStorage.getItem(storageKey(userId)));
  } catch {
    return false;
  }
}

function markSent(userId: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey(userId), new Date().toISOString());
  } catch {
    /* quota / private mode */
  }
}

export type SendInvitationResult =
  | { ok: true; skipped?: boolean; id?: string | null }
  | { ok: false; error: string };

/**
 * Sends the invitation email exactly once per user id from the current browser.
 * Subsequent calls return `{ ok: true, skipped: true }` instantly without
 * touching the network.
 */
export async function sendInvitationEmailOnce(params: {
  userId: string;
  email: string;
  fullName?: string | null;
}): Promise<SendInvitationResult> {
  const { userId, email, fullName } = params;
  if (!userId || !email) return { ok: false, error: 'userId and email are required' };

  if (alreadySent(userId)) {
    return { ok: true, skipped: true };
  }

  try {
    const res = await fetch('/api/send-invitation-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, fullName: fullName ?? null }),
    });

    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      id?: string | null;
    };

    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error ?? `HTTP ${res.status}` };
    }

    markSent(userId);
    return { ok: true, id: json.id ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Test-only helper: clears the "sent" flag so the next call sends again. */
export function resetInvitationEmailSent(userId: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    /* ignore */
  }
}

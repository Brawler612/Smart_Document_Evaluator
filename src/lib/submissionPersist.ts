import { isMissingColumnError } from './supabaseSchemaHints';
import { isStaffEmail, resolveAppRole } from './staffAccess';
import { supabase } from './supabase';
import { resolveSubmissionTableName } from './teacherSubmissionLoad';

export type PersistSubmissionResult =
  | { ok: true; id: string }
  | { ok: false; message: string };

function missingColumnFromError(message: string): string | null {
  const m = message.match(/'([^']+)'\s+column/i) ?? message.match(/column\s+'([^']+)'/i);
  return m?.[1] ?? null;
}

/** Sync public.users.role so Supabase RLS (app_user_is_staff) allows grade writes. */
async function ensureStaffDbRoleForCurrentUser(): Promise<void> {
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData.user?.email) return;
  const email = authData.user.email.trim();
  if (!isStaffEmail(email)) return;
  const role = resolveAppRole(email);
  await supabase.from('users').update({ role }).eq('id', authData.user.id);
}

async function runUpdate(
  table: 'submissions' | 'submission',
  submissionId: string,
  payload: Record<string, unknown>
): Promise<{ data: { id: string } | null; error: { message: string } | null }> {
  const { data, error } = await supabase
    .from(table)
    .update(payload as never)
    .eq('id', submissionId)
    .select('id')
    .maybeSingle();

  if (error) {
    return { data: null, error: { message: error.message } };
  }
  if (!data?.id) {
    return { data: null, error: null };
  }
  return { data: { id: String(data.id) }, error: null };
}

function stripColumn(payload: Record<string, unknown>, column: string): Record<string, unknown> {
  const next = { ...payload };
  delete next[column];
  return next;
}

/**
 * Updates one submission row and confirms PostgREST applied it (RLS / wrong id otherwise succeed with 0 rows).
 */
export async function persistSubmissionUpdate(
  submissionId: string,
  payload: Record<string, unknown>
): Promise<PersistSubmissionResult> {
  await ensureStaffDbRoleForCurrentUser();

  const table = await resolveSubmissionTableName();
  if (!table) {
    return {
      ok: false,
      message:
        'Submissions table not found in Supabase. Run docs/supabase-setup-all-in-one.sql in the SQL Editor.',
    };
  }

  const { data: authData } = await supabase.auth.getUser();
  const signedInEmail = authData.user?.email?.trim() ?? '(not signed in)';

  let body: Record<string, unknown> = { ...payload };
  let includeUpdatedAt = true;
  let lastError: string | null = null;

  for (let attempt = 0; attempt < 12; attempt++) {
    const updatePayload: Record<string, unknown> = { ...body };
    if (includeUpdatedAt) {
      updatePayload.updated_at = new Date().toISOString();
    }

    const result = await runUpdate(table, submissionId, updatePayload);

    if (!result.error && result.data?.id) {
      return { ok: true, id: result.data.id };
    }

    if (result.error) {
      lastError = result.error.message;
      const col = missingColumnFromError(result.error.message);
      if (col && isMissingColumnError(result.error.message, col)) {
        if (col === 'updated_at') {
          includeUpdatedAt = false;
        } else {
          body = stripColumn(body, col);
        }
        continue;
      }
      return { ok: false, message: result.error.message };
    }

    /** Update succeeded at HTTP level but RLS hid the row or `updated_at` blocked the write. */
    if (includeUpdatedAt) {
      includeUpdatedAt = false;
      continue;
    }

    return {
      ok: false,
      message:
        `Grade was not saved (no row updated). Signed in as ${signedInEmail}. ` +
        'Use the instructor Gmail (dinaponash26@gmail.com), then run docs/supabase-fix-staff-grade-publish.sql in Supabase SQL Editor and sign out/in.',
    };
  }

  return {
    ok: false,
    message:
      lastError ??
      'Grade could not be saved. Check Supabase connection and run docs/supabase-fix-staff-grade-publish.sql.',
  };
}

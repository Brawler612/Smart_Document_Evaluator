import { isMissingColumnError } from './supabaseSchemaHints';
import { supabase } from './supabase';
import { resolveSubmissionTableName } from './teacherSubmissionLoad';

export type PersistSubmissionResult =
  | { ok: true; id: string }
  | { ok: false; message: string };

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

  return {
    data: data?.id ? { id: String(data.id) } : null,
    error: error ? { message: error.message } : null,
  };
}

/**
 * Updates one submission row and confirms PostgREST applied it (RLS / wrong id otherwise succeed with 0 rows).
 */
export async function persistSubmissionUpdate(
  submissionId: string,
  payload: Record<string, unknown>
): Promise<PersistSubmissionResult> {
  const table = await resolveSubmissionTableName();
  if (!table) {
    return {
      ok: false,
      message:
        'Submissions table not found in Supabase. Run docs/supabase-setup-all-in-one.sql in the SQL Editor.',
    };
  }

  const withTimestamp = {
    ...payload,
    updated_at: new Date().toISOString(),
  };

  let result = await runUpdate(table, submissionId, withTimestamp);

  if (result.error && isMissingColumnError(result.error.message, 'updated_at')) {
    result = await runUpdate(table, submissionId, payload);
  }

  if (result.error) {
    return { ok: false, message: result.error.message };
  }
  if (!result.data?.id) {
    return {
      ok: false,
      message:
        'Grade was not saved to Supabase (no row updated). Sign in as the instructor account (dinaponash26@gmail.com) and confirm submissions_update_staff RLS is enabled.',
    };
  }
  return { ok: true, id: result.data.id };
}

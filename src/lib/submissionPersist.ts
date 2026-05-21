import { supabase } from './supabase';
import { resolveSubmissionTableName } from './teacherSubmissionLoad';

export type PersistSubmissionResult =
  | { ok: true; id: string }
  | { ok: false; message: string };

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

  const { data, error } = await supabase
    .from(table)
    .update(withTimestamp as never)
    .eq('id', submissionId)
    .select('id')
    .maybeSingle();

  if (error) {
    return { ok: false, message: error.message };
  }
  if (!data?.id) {
    return {
      ok: false,
      message:
        'Grade was not saved to Supabase (no row updated). Sign in as the instructor account (dinaponash26@gmail.com) and confirm submissions_update_staff RLS is enabled.',
    };
  }
  return { ok: true, id: String(data.id) };
}

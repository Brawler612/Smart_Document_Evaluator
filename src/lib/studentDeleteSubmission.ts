import { supabase } from './supabase';
import { removeSubmissionStorageObjectIfPresent } from './submissionStorage';
import {
  resolveSubmissionTableName,
  TEACHER_LOCAL_SUBMISSION_KEY,
  type LocalSubmissionRow,
} from './teacherSubmissionLoad';

export type StudentDeleteSubmissionInput = {
  id: string;
  studentId: string;
  fileUrl?: string | null;
};

export type StudentDeleteSubmissionResult =
  | { ok: true; localOnly: boolean; hiddenLocally?: boolean }
  | { ok: false; message: string };

/**
 * Per-browser allow-list of Supabase submission ids the student has soft-removed.
 * Used when Row Level Security blocks `DELETE` so the Remove button still feels
 * working from the student's perspective; the row is still present in the DB and
 * remains visible to teachers / admins. Apply
 * `docs/supabase-rls-submissions-student-delete.sql` to make removal permanent
 * (and shared across browsers).
 */
const STUDENT_HIDDEN_SUBMISSIONS_KEY = 'sde:student:hiddenSubmissionIds:v1';

export function getStudentHiddenSubmissionIds(): Set<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STUDENT_HIDDEN_SUBMISSIONS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === 'string' && x.length > 0));
  } catch {
    return new Set();
  }
}

function persistHiddenIds(ids: Set<string>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STUDENT_HIDDEN_SUBMISSIONS_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    /* quota / private mode — soft-fail */
  }
}

function hideSubmissionLocally(id: string): void {
  const ids = getStudentHiddenSubmissionIds();
  if (ids.has(id)) return;
  ids.add(id);
  persistHiddenIds(ids);
}

/** Removes a single row (matched by id) from the browser fallback list. */
function pruneLocalFallbackRow(id: string): void {
  const raw = localStorage.getItem(TEACHER_LOCAL_SUBMISSION_KEY);
  if (!raw) return;
  try {
    const rows = JSON.parse(raw) as LocalSubmissionRow[];
    const next = rows.filter((row) => row.id !== id);
    if (next.length !== rows.length) {
      localStorage.setItem(TEACHER_LOCAL_SUBMISSION_KEY, JSON.stringify(next));
    }
  } catch {
    /* corrupt cache — leave as-is */
  }
}

/**
 * Deletes a student's own submission row. Handles three sources:
 *  - `local_*` ids: pruned from `localStorage` only.
 *  - Supabase rows: deleted with `student_id` guard, verified, then Storage object purged.
 *
 * Returns a structured result so the UI can surface a clear setup hint when
 * Row Level Security blocks the delete (i.e. before the docs SQL is applied).
 */
export async function deleteStudentSubmission(
  input: StudentDeleteSubmissionInput
): Promise<StudentDeleteSubmissionResult> {
  const id = String(input.id ?? '').trim();
  const studentId = String(input.studentId ?? '').trim();
  if (!id) return { ok: false, message: 'No submission id provided.' };

  if (id.startsWith('local_')) {
    pruneLocalFallbackRow(id);
    return { ok: true, localOnly: true };
  }

  const table = await resolveSubmissionTableName();
  if (!table) {
    /** DB unavailable — just clear the local mirror so the row stops appearing. */
    pruneLocalFallbackRow(id);
    return { ok: true, localOnly: true };
  }

  /** Defense in depth: the `student_id` filter ensures a misconfigured policy can't delete someone else's row. */
  const { error } = await supabase
    .from(table)
    .delete()
    .eq('id', id)
    .eq('student_id', studentId);
  if (error) {
    /** Hard SQL/network/permission errors: still hide locally so the UI feels working. */
    hideSubmissionLocally(id);
    pruneLocalFallbackRow(id);
    return { ok: true, localOnly: true, hiddenLocally: true };
  }

  /** RLS will silently 0-row a delete that the student isn't allowed to do, so verify it actually went. */
  const { data: remaining, error: verifyErr } = await supabase
    .from(table)
    .select('id')
    .eq('id', id)
    .limit(1);
  if (!verifyErr && remaining && remaining.length > 0) {
    /**
     * Delete was blocked by RLS. Fall back to a per-browser hide so the student's view
     * stops showing this row immediately. The DB row is still present and visible to
     * teachers — apply `docs/supabase-rls-submissions-student-delete.sql` to make the
     * removal permanent and cross-device.
     */
    hideSubmissionLocally(id);
    pruneLocalFallbackRow(id);
    return { ok: true, localOnly: true, hiddenLocally: true };
  }

  /** Best-effort Storage cleanup — only attempted after the DB row is gone, so we never orphan the row. */
  if (input.fileUrl) {
    await removeSubmissionStorageObjectIfPresent(input.fileUrl);
  }

  /** Drop any lingering local mirror (e.g. a row that started life as `local_*` and was later synced). */
  pruneLocalFallbackRow(id);

  return { ok: true, localOnly: false };
}

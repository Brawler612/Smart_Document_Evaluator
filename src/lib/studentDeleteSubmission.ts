import { supabase } from './supabase';
import { emitSubmissionRemoved } from './submissionSyncEvents';
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
  | { ok: true; localOnly: boolean }
  | { ok: false; message: string };

/**
 * Legacy per-browser hide list (older builds soft-removed when RLS blocked DELETE).
 * Workspace queries still filter these ids so stale rows do not reappear for students.
 */
const STUDENT_HIDDEN_SUBMISSIONS_KEY = 'sde:student:hiddenSubmissionIds:v1';

const RLS_SETUP_HINT =
  'Could not remove this submission. Ask your instructor to run docs/supabase-fn-delete-own-submission.sql in the Supabase SQL Editor, or add SUPABASE_SERVICE_ROLE_KEY on Vercel and redeploy.';

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

function isMissingRpcError(message: string): boolean {
  return /function.*does not exist|could not find the function|PGRST202|42883/i.test(message);
}

/** Preferred path: SECURITY DEFINER RPC (works when RLS DELETE policy is missing). */
async function tryRpcDelete(submissionId: string): Promise<'deleted' | 'not_found' | 'missing' | 'error'> {
  const { data, error } = await supabase.rpc('delete_own_submission', {
    p_submission_id: submissionId,
  });
  if (error) {
    if (isMissingRpcError(error.message ?? '')) return 'missing';
    return 'error';
  }
  if (data === true) return 'deleted';
  return 'not_found';
}

async function tryDirectTableDelete(
  table: string,
  submissionId: string,
  studentId: string
): Promise<'deleted' | 'blocked' | 'error'> {
  const { error } = await supabase.from(table).delete().eq('id', submissionId).eq('student_id', studentId);
  if (error) return 'error';

  const { data: remaining, error: verifyErr } = await supabase
    .from(table)
    .select('id')
    .eq('id', submissionId)
    .limit(1);
  if (!verifyErr && remaining && remaining.length > 0) return 'blocked';
  return 'deleted';
}

/** Server route using service role — works on production when env is set. */
async function tryServerDelete(submissionId: string): Promise<'deleted' | 'not_configured' | 'failed'> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return 'failed';

  try {
    const res = await fetch('/api/delete-submission', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ submissionId }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (res.status === 503) return 'not_configured';
    if (res.ok && json.ok) return 'deleted';
    return 'failed';
  } catch {
    return 'failed';
  }
}

async function finalizeDelete(
  id: string,
  fileUrl: string | null | undefined,
  localOnly: boolean
): Promise<StudentDeleteSubmissionResult> {
  if (fileUrl) {
    await removeSubmissionStorageObjectIfPresent(fileUrl);
  }
  pruneLocalFallbackRow(id);
  emitSubmissionRemoved(id);
  return { ok: true, localOnly };
}

/**
 * Deletes a student's own submission row. Tries, in order:
 *  1. `delete_own_submission` RPC (SECURITY DEFINER)
 *  2. Direct table DELETE (when RLS policy exists)
 *  3. POST `/api/delete-submission` (service role on Vercel)
 */
export async function deleteStudentSubmission(
  input: StudentDeleteSubmissionInput
): Promise<StudentDeleteSubmissionResult> {
  const id = String(input.id ?? '').trim();
  const studentId = String(input.studentId ?? '').trim();
  if (!id) return { ok: false, message: 'No submission id provided.' };

  if (id.startsWith('local_')) {
    return finalizeDelete(id, input.fileUrl, true);
  }

  const table = await resolveSubmissionTableName();

  const rpc = await tryRpcDelete(id);
  if (rpc === 'deleted') {
    return finalizeDelete(id, input.fileUrl, false);
  }

  if (table) {
    const direct = await tryDirectTableDelete(table, id, studentId);
    if (direct === 'deleted') {
      return finalizeDelete(id, input.fileUrl, false);
    }
  }

  const server = await tryServerDelete(id);
  if (server === 'deleted') {
    return finalizeDelete(id, input.fileUrl, false);
  }

  if (!table) {
    return finalizeDelete(id, input.fileUrl, true);
  }

  return { ok: false, message: RLS_SETUP_HINT };
}

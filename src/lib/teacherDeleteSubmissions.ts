import { supabase } from './supabase';
import { emitSubmissionRemoved } from './submissionSyncEvents';
import { removeSubmissionStorageObjectIfPresent } from './submissionStorage';
import { isStaffEmail, resolveAppRole } from './staffAccess';
import {
  resolveSubmissionTableName,
  TEACHER_LOCAL_SUBMISSION_KEY,
  type LocalSubmissionRow,
} from './teacherSubmissionLoad';

export type SubmissionDeletePurgeHint = {
  student_id: string;
  file_name: string;
  file_url: string | null;
};

/** Aligns `public.users.role` with staff rule — RLS reads Postgres, not the client env list. */
async function reconcilePublicUsersStaffRole(): Promise<void> {
  const { data: sess } = await supabase.auth.getUser();
  const user = sess?.user;
  if (!user?.id || !user.email?.trim()) return;
  if (!isStaffEmail(user.email)) return;

  const target = resolveAppRole(user.email);
  const { error } = await supabase.from('users').update({ role: target }).eq('id', user.id);
  if (error && import.meta.env.DEV) console.warn('[teacherDelete] reconcile public.users.role:', error.message);
}

function normalizeFileLabel(name: string | null | undefined): string {
  return String(name ?? '')
    .trim()
    .toLowerCase();
}

function pruneTeacherLocalSubmissionFallback(ids: string[], dbOk: boolean, hints?: SubmissionDeletePurgeHint[]) {
  const raw = localStorage.getItem(TEACHER_LOCAL_SUBMISSION_KEY);
  if (!raw) return;
  try {
    const rows = JSON.parse(raw) as LocalSubmissionRow[];
    const idSet = new Set(ids);
    const useHints = dbOk && hints && hints.length > 0 ? hints : [];
    const fpKeys = new Set(
      useHints.map((h) => `${String(h.student_id).trim()}\0${normalizeFileLabel(h.file_name)}`)
    );
    const fpUrls = new Set(useHints.flatMap((h) => (h.file_url?.trim() ? [h.file_url.trim()] : [])));

    const next = rows.filter((r) => {
      if (idSet.has(r.id)) return false;
      const sid = String(r.student_id ?? '').trim();
      if (
        fpKeys.size > 0 &&
        fpKeys.has(`${sid}\0${normalizeFileLabel(r.file_name)}`) &&
        String(r.id).startsWith('local_')
      ) {
        return false;
      }
      const u = r.file_url?.trim();
      if (fpUrls.size > 0 && u && fpUrls.has(u) && String(r.id).startsWith('local_')) return false;
      return true;
    });
    localStorage.setItem(TEACHER_LOCAL_SUBMISSION_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export type DeleteTeacherSubmissionsOptions = {
  /** When DB delete succeeds, drop matching browser fallback rows so sync does not re-upload them. */
  purgeLocalDuplicatesOf?: SubmissionDeletePurgeHint[];
};

/**
 * Deletes submission rows visible to teachers (database + mirrored local fallback).
 */
export async function deleteTeacherSubmissionsByIds(
  ids: string[],
  options?: DeleteTeacherSubmissionsOptions
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (ids.length === 0) return { ok: true };

  let dbMessage: string | undefined;
  const table = await resolveSubmissionTableName();
  const dbIds = ids.filter((id) => !id.startsWith('local_'));
  if (table && dbIds.length > 0) {
    await reconcilePublicUsersStaffRole();

    const { error } = await supabase.from(table).delete().in('id', dbIds);
    if (error) {
      dbMessage = error.message;
    } else {
      const { data: remaining, error: verifyErr } = await supabase.from(table).select('id').in('id', dbIds);
      if (verifyErr) {
        if (import.meta.env.DEV) console.warn('[teacherDelete] verify select:', verifyErr.message);
      } else {
        const left = remaining?.length ?? 0;
        if (left > 0) {
          dbMessage =
            left === dbIds.length
              ? `Delete was blocked — ${left} row(s) are still in the database. RLS uses table public.users (role must be teacher or admin), not only VITE_TEACHER_EMAILS. In Supabase SQL run: UPDATE public.users SET role = 'teacher' WHERE lower(email) = lower('your@email'); add that email to VITE_TEACHER_EMAILS so future sign-ins sync role; and ensure docs/supabase-assignments-submissions-core.sql submissions_delete_teacher policy exists.`
              : `Only ${dbIds.length - left} of ${dbIds.length} submission(s) were removed — check RLS and IDs.`;
        }
      }
    }
  }

  const dbOk = !dbMessage;
  if (dbOk && options?.purgeLocalDuplicatesOf?.length) {
    const uniqUrls = [
      ...new Set(
        options.purgeLocalDuplicatesOf.flatMap((h) =>
          h.file_url?.trim() && /^https:\/\//i.test(h.file_url.trim()) ? [h.file_url.trim()] : []
        )
      ),
    ];
    await Promise.all(uniqUrls.map((u) => removeSubmissionStorageObjectIfPresent(u)));
  }

  pruneTeacherLocalSubmissionFallback(ids, dbOk, options?.purgeLocalDuplicatesOf);

  if (dbMessage) return { ok: false, message: dbMessage };
  for (const id of ids) emitSubmissionRemoved(id);
  return { ok: true };
}

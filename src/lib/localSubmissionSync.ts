/**
 * Browser-only fallback rows (`local_*` ids) can be uploaded to Supabase after the DB is configured,
 * so the same student sees them on every device after Google sign-in.
 */
import { supabase } from './supabase';
import {
  resolveSubmissionTableName,
  TEACHER_LOCAL_SUBMISSION_KEY,
  type LocalSubmissionRow,
} from './teacherSubmissionLoad';
import { ensureCurrentAuthUserProfile } from './userProfilePersistence';
import { insertStudentSubmissionRow } from './studentSubmissionInsert';

type SyncResult = { uploaded: number; failed: number };

function removeUploadedRows(list: LocalSubmissionRow[], uploadedLocalIds: Set<string>): void {
  if (uploadedLocalIds.size === 0) return;
  try {
    localStorage.setItem(
      TEACHER_LOCAL_SUBMISSION_KEY,
      JSON.stringify(list.filter((row) => !uploadedLocalIds.has(row.id)))
    );
  } catch {
    /* quota — leave storage as-is */
  }
}

async function insertLocalSubmissionRow(table: 'submissions' | 'submission', row: LocalSubmissionRow) {
  const base = {
    student_id: row.student_id,
    file_name: row.file_name,
    file_url: row.file_url,
    status: row.status ?? 'submitted',
    feedback: row.feedback,
    score: row.score,
    ai_draft_score: row.ai_draft_score ?? null,
    ai_draft_summary: row.ai_draft_summary ?? null,
    submitted_at: row.submitted_at,
  };

  const inserted = await insertStudentSubmissionRow(table, base, {
    submissionDocType: row.submission_doc_type,
    assignmentId: row.assignment_id,
  });

  if (!inserted.error) return { error: null };
  if (row.assignment_id && /foreign key|violates|assignment/i.test(inserted.error.message)) {
    return insertStudentSubmissionRow(table, base, {
      submissionDocType: row.submission_doc_type,
      assignmentId: null,
    });
  }
  return inserted;
}

export async function syncLocalSubmissionsToSupabase(userId: string): Promise<{ uploaded: number; failed: number }> {
  const table = await resolveSubmissionTableName();
  if (!table) return { uploaded: 0, failed: 0 };

  const raw = localStorage.getItem(TEACHER_LOCAL_SUBMISSION_KEY);
  if (!raw) return { uploaded: 0, failed: 0 };

  let list: LocalSubmissionRow[];
  try {
    list = JSON.parse(raw) as LocalSubmissionRow[];
  } catch {
    return { uploaded: 0, failed: 0 };
  }

  const pending = list.filter((r) => r.student_id === userId && String(r.id).startsWith('local_'));
  if (pending.length === 0) return { uploaded: 0, failed: 0 };

  try {
    await ensureCurrentAuthUserProfile(userId);
  } catch (error) {
    if (import.meta.env.DEV) console.warn('[localSubmissionSync] profile sync failed:', error);
    return { uploaded: 0, failed: pending.length };
  }

  let uploaded = 0;
  let failed = 0;
  const uploadedLocalIds = new Set<string>();

  for (const row of pending) {
    const ins = await insertLocalSubmissionRow(table, row);

    if (!ins.error) {
      uploaded++;
      uploadedLocalIds.add(row.id);
    } else {
      failed++;
      if (import.meta.env.DEV) console.warn('[localSubmissionSync]', ins.error.message);
    }
  }

  removeUploadedRows(list, uploadedLocalIds);

  return { uploaded, failed };
}

export async function syncAllLocalSubmissionsToSupabase(): Promise<SyncResult> {
  const table = await resolveSubmissionTableName();
  if (!table) return { uploaded: 0, failed: 0 };

  const raw = localStorage.getItem(TEACHER_LOCAL_SUBMISSION_KEY);
  if (!raw) return { uploaded: 0, failed: 0 };

  let list: LocalSubmissionRow[];
  try {
    list = JSON.parse(raw) as LocalSubmissionRow[];
  } catch {
    return { uploaded: 0, failed: 0 };
  }

  const pending = list.filter((r) => String(r.id).startsWith('local_'));
  if (pending.length === 0) return { uploaded: 0, failed: 0 };

  try {
    await ensureCurrentAuthUserProfile();
  } catch (error) {
    if (import.meta.env.DEV) console.warn('[localSubmissionSync] profile sync failed:', error);
    return { uploaded: 0, failed: pending.length };
  }

  let uploaded = 0;
  let failed = 0;
  const uploadedLocalIds = new Set<string>();

  for (const row of pending) {
    const ins = await insertLocalSubmissionRow(table, row);
    if (!ins.error) {
      uploaded++;
      uploadedLocalIds.add(row.id);
    } else {
      failed++;
      if (import.meta.env.DEV) console.warn('[localSubmissionSync:all]', ins.error.message);
    }
  }

  removeUploadedRows(list, uploadedLocalIds);
  return { uploaded, failed };
}

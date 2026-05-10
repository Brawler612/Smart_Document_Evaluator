import { supabase } from './supabase';
import {
  resolveSubmissionTableName,
  TEACHER_LOCAL_SUBMISSION_KEY,
  type LocalSubmissionRow,
} from './teacherSubmissionLoad';

export const DEFAULT_TEACHER_RESUBMIT_FEEDBACK =
  'Your file looks empty, nearly empty, or too incomplete to grade. Please upload a full, revised document that meets the assignment requirements.';

type SubRef = { id: string; feedback?: string | null };

export async function performTeacherResubmitRequest(sub: SubRef): Promise<{ ok: true } | { ok: false; message: string }> {
  const payload = {
    status: 'resubmit' as const,
    feedback: (sub.feedback?.trim() ? sub.feedback.trim() : '') || DEFAULT_TEACHER_RESUBMIT_FEEDBACK,
    score: null as number | null,
    ai_draft_score: null as number | null,
    ai_draft_summary: null as string | null,
  };

  const table = await resolveSubmissionTableName();
  if (table) {
    const { error } = await supabase.from(table).update(payload).eq('id', sub.id);
    const missingAiCols =
      error?.message &&
      /ai_draft|could not find|column|PGRST204|schema cache/i.test(error.message);
    const core = { status: payload.status, feedback: payload.feedback, score: payload.score };
    if (error && missingAiCols) {
      const { error: e2 } = await supabase.from(table).update(core).eq('id', sub.id);
      if (e2) return { ok: false, message: e2.message };
    } else if (error) {
      return { ok: false, message: error.message };
    }
  } else if (sub.id.startsWith('local_')) {
    const localRaw = localStorage.getItem(TEACHER_LOCAL_SUBMISSION_KEY);
    const localRows = localRaw ? (JSON.parse(localRaw) as LocalSubmissionRow[]) : [];
    const updated = localRows.map((row) => (row.id === sub.id ? { ...row, ...payload } : row));
    localStorage.setItem(TEACHER_LOCAL_SUBMISSION_KEY, JSON.stringify(updated));
  }

  return { ok: true };
}

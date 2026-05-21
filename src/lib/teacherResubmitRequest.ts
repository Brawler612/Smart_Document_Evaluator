import { persistSubmissionUpdate } from './submissionPersist';
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
    let persisted = await persistSubmissionUpdate(sub.id, payload);
    const missingAiCols =
      !persisted.ok &&
      /ai_draft|could not find|column|PGRST204|schema cache/i.test(persisted.message);
    if (!persisted.ok && missingAiCols) {
      persisted = await persistSubmissionUpdate(sub.id, {
        status: payload.status,
        feedback: payload.feedback,
        score: payload.score,
      });
    }
    if (!persisted.ok) return { ok: false, message: persisted.message };
  } else if (sub.id.startsWith('local_')) {
    const localRaw = localStorage.getItem(TEACHER_LOCAL_SUBMISSION_KEY);
    const localRows = localRaw ? (JSON.parse(localRaw) as LocalSubmissionRow[]) : [];
    const updated = localRows.map((row) => (row.id === sub.id ? { ...row, ...payload } : row));
    localStorage.setItem(TEACHER_LOCAL_SUBMISSION_KEY, JSON.stringify(updated));
  }

  return { ok: true };
}

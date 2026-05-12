import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { syncLocalSubmissionsToSupabase } from './localSubmissionSync';
import { getStudentHiddenSubmissionIds } from './studentDeleteSubmission';
import { useAuth } from '../context/AuthContext';

/**
 * Broadcast channel name fired by `studentDeleteSubmission` whenever a row is
 * soft- or hard-removed. Every page that consumes `useStudentWorkspace` listens
 * for this event and refreshes (or filters) immediately so the deleted row
 * vanishes from Dashboard / Tasks / Boards / Drive / Sheets / Analytics in the
 * same tick the Remove confirmation finishes.
 */
export const STUDENT_SUBMISSION_REMOVED_EVENT = 'sde:student:submission-removed';

export type SubStatus = 'submitted' | 'under_review' | 'reviewed' | 'resubmit';

export interface StudentAssignmentRow {
  id: string;
  title: string;
  description: string | null;
  document_type: string;
  due_date: string | null;
  max_score: number | null;
  status: string;
}

export interface StudentSubmissionRow {
  id: string;
  assignment_id: string | null;
  file_name: string;
  file_url: string | null;
  status: SubStatus;
  score: number | null;
  feedback: string | null;
  submitted_at: string;
  submission_doc_type: string | null;
  assignment_title?: string | null;
  assignment_doc_type?: string | null;
}

interface StudentWorkspaceData {
  loading: boolean;
  error: string | null;
  assignments: StudentAssignmentRow[];
  submissions: StudentSubmissionRow[];
  refresh: () => Promise<void>;
}

async function safeFetchAssignments(): Promise<StudentAssignmentRow[]> {
  const tables = ['assignments', 'assignment'] as const;
  for (const t of tables) {
    const r = await supabase
      .from(t)
      .select('id, title, description, document_type, due_date, max_score, status')
      .order('due_date', { ascending: true });
    if (!r.error) return (r.data ?? []) as StudentAssignmentRow[];
  }
  return [];
}

async function safeFetchSubmissions(studentId: string): Promise<StudentSubmissionRow[]> {
  const tables = ['submissions', 'submission'] as const;
  for (const t of tables) {
    const r = await supabase
      .from(t)
      .select(
        'id, assignment_id, file_name, file_url, status, score, feedback, submitted_at, submission_doc_type, assignments(title, document_type)'
      )
      .eq('student_id', studentId)
      .order('submitted_at', { ascending: false });
    if (!r.error) {
      return (r.data ?? []).map((row: Record<string, unknown>) => {
        let a = row.assignments as unknown;
        if (Array.isArray(a)) a = a[0];
        const aObj = a && typeof a === 'object' ? (a as { title?: string; document_type?: string }) : null;
        return {
          id: String(row.id ?? ''),
          assignment_id: row.assignment_id ? String(row.assignment_id) : null,
          file_name: String(row.file_name ?? ''),
          file_url: row.file_url ? String(row.file_url) : null,
          status: (row.status as SubStatus) ?? 'submitted',
          score: typeof row.score === 'number' ? row.score : row.score != null ? Number(row.score) : null,
          feedback: row.feedback ? String(row.feedback) : null,
          submitted_at: String(row.submitted_at ?? ''),
          submission_doc_type: row.submission_doc_type ? String(row.submission_doc_type) : null,
          assignment_title: aObj?.title ?? null,
          assignment_doc_type: aObj?.document_type ?? null,
        } satisfies StudentSubmissionRow;
      });
    }
  }
  return [];
}

/** Single source of truth for the student workspace pages. Fetches the student's submissions + active assignments. */
export function useStudentWorkspace(): StudentWorkspaceData {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<StudentAssignmentRow[]>([]);
  const [submissions, setSubmissions] = useState<StudentSubmissionRow[]>([]);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setAssignments([]);
      setSubmissions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      try {
        await syncLocalSubmissionsToSupabase(user.id);
      } catch {
        /* best-effort sync; ignore failures */
      }
      const [a, s] = await Promise.all([safeFetchAssignments(), safeFetchSubmissions(user.id)]);
      /** Honor the per-browser soft-delete set so removed rows disappear everywhere. */
      const hidden = getStudentHiddenSubmissionIds();
      setAssignments(a);
      setSubmissions(hidden.size === 0 ? s : s.filter((row) => !hidden.has(row.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workspace');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Listen for removal events from any page (e.g. Submissions). When fired we
   * also instantly prune the local state so the rest of the workspace pages
   * update without waiting for the network round-trip from `refresh()`.
   */
  useEffect(() => {
    function handleRemoved(e: Event) {
      const detail = (e as CustomEvent<{ id?: string }>).detail;
      if (detail?.id) {
        setSubmissions((rows) => rows.filter((r) => r.id !== detail.id));
      }
      /** Also re-pull from Supabase to catch any hard-delete that happened. */
      void refresh();
    }
    window.addEventListener(STUDENT_SUBMISSION_REMOVED_EVENT, handleRemoved as EventListener);
    return () =>
      window.removeEventListener(STUDENT_SUBMISSION_REMOVED_EVENT, handleRemoved as EventListener);
  }, [refresh]);

  return { loading, error, assignments, submissions, refresh };
}

/** Convenience emitter so pages don't need to know the event-name string. */
export function emitStudentSubmissionRemoved(id: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(STUDENT_SUBMISSION_REMOVED_EVENT, { detail: { id } })
  );
}

/**
 * Returns the set of assignment ids the student does **not** need to turn in again.
 *
 * Uses the **latest** submission per assignment only (same ordering as
 * `buildLatestSubmissionByAssignment`). If the newest row is `resubmit`, the
 * assignment stays **open** so Tasks / Dashboard show redo work. Older
 * reviewed rows alone must not hide a fresh redo request.
 */
export function buildEffectiveSubmittedAssignmentIds(
  submissions: StudentSubmissionRow[]
): Set<string> {
  const latestByAssignment = buildLatestSubmissionByAssignment(submissions);
  const ids = new Set<string>();
  for (const [assignmentId, s] of latestByAssignment) {
    if (s.status === 'resubmit') continue;
    ids.add(assignmentId);
  }
  return ids;
}

/** Latest submission per assignment id (input expected DESC by submitted_at — that's how `safeFetchSubmissions` returns it). */
export function buildLatestSubmissionByAssignment(
  submissions: StudentSubmissionRow[]
): Map<string, StudentSubmissionRow> {
  const map = new Map<string, StudentSubmissionRow>();
  for (const s of submissions) {
    if (s.assignment_id && !map.has(s.assignment_id)) map.set(s.assignment_id, s);
  }
  return map;
}

/** Builds the deep-link href to redo a flagged submission via the Submit page's existing `?resubmit=…&assignment=…` flow. */
export function buildResubmitHref(submission: StudentSubmissionRow): string {
  const q = new URLSearchParams();
  q.set('resubmit', submission.id);
  if (submission.assignment_id) q.set('assignment', submission.assignment_id);
  return `/assignments?${q.toString()}`;
}

/** Format a date as "Nov 11" or "Nov 11, 2025" if not the current year. */
export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

export function describeDueRelative(iso: string | null | undefined): {
  label: string;
  tone: 'overdue' | 'today' | 'soon' | 'future' | 'none';
  days: number | null;
} {
  if (!iso) return { label: 'No due date', tone: 'none', days: null };
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return { label: 'No due date', tone: 'none', days: null };
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((startOfDay(due).getTime() - startOfDay(new Date()).getTime()) / 86400000);
  const dateLabel = formatShortDate(iso);
  if (days < 0) return { label: `Overdue · ${dateLabel}`, tone: 'overdue', days };
  if (days === 0) return { label: `Due today · ${dateLabel}`, tone: 'today', days };
  if (days === 1) return { label: `Due tomorrow · ${dateLabel}`, tone: 'soon', days };
  if (days <= 6) return { label: `Due in ${days}d · ${dateLabel}`, tone: 'soon', days };
  return { label: `Due ${dateLabel}`, tone: 'future', days };
}

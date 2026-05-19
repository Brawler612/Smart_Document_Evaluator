import type { SubStatus } from '../types';
import type { TeacherSubmission } from './teacherSubmissionLoad';
import { submissionQueueDocumentType } from './teacherSubmissionLoad';

export const SUBMISSION_ROSTER_SHEET_HEADERS = [
  'Document Type',
  'File Name',
  'Student ID',
  'Student Name',
  'Email',
  'Date Submitted',
  'Status',
  'Score',
  'AI Draft Score',
  'Feedback',
  'File URL',
] as const;

const STATUS_LABEL: Record<SubStatus, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  reviewed: 'Reviewed',
  resubmit: 'Resubmit',
};

function formatSubmittedAt(iso: string | null | undefined): string {
  if (!iso?.trim()) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

/** All submissions for the Submission Roster Google Sheets tab (not search-filtered). */
export function buildSubmissionRosterSheetValues(rows: TeacherSubmission[]): string[][] {
  const sorted = [...rows].sort(
    (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
  );

  return [
    [...SUBMISSION_ROSTER_SHEET_HEADERS],
    ...sorted.map((s) => [
      submissionQueueDocumentType(s),
      s.file_name?.trim() || '',
      s.users?.student_number?.trim() || s.student_id || '',
      s.users?.full_name?.trim() || '',
      s.users?.email?.trim() || '',
      formatSubmittedAt(s.submitted_at),
      STATUS_LABEL[s.status] ?? s.status,
      s.score != null ? String(s.score) : '',
      s.ai_draft_score != null ? String(s.ai_draft_score) : '',
      s.feedback?.trim() || '',
      s.file_url?.trim() || '',
    ]),
  ];
}

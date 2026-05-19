import { IT332_CLASS_COURSE_AND_YEAR } from '../data/it332Sem2ClassRoster';
import type { AppUser, SubStatus } from '../types';
import type { TeacherSubmission } from './teacherSubmissionLoad';
import { submissionQueueDocumentType } from './teacherSubmissionLoad';

export const CLASS_LIST_SHEET_HEADERS = [
  'No.',
  'Student Name',
  'Student ID',
  'Team Code',
  'Course / Term',
  'Course & Year',
  'School Year',
  'Email',
  'Status',
  'Latest File',
  'Date Submitted',
  'Document Type',
] as const;

const STATUS_LABEL: Record<SubStatus, string> = {
  submitted: 'Submitted',
  under_review: 'In review',
  reviewed: 'Graded',
  resubmit: 'Redo needed',
};

function directoryStatus(u: AppUser, latest: TeacherSubmission | null): string {
  if (u.roster_pending) return 'Awaiting sign-in';
  if (latest) return STATUS_LABEL[latest.status];
  return 'Awaiting upload';
}

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

/** Rows for the Class List tab in Google Sheets (full directory, not search-filtered). */
export function buildClassListSheetValues(
  students: AppUser[],
  latestByStudentId: Map<string, TeacherSubmission>
): string[][] {
  const sorted = [...students].sort((a, b) =>
    (a.full_name || '').localeCompare(b.full_name || '', undefined, { sensitivity: 'base' })
  );

  return [
    [...CLASS_LIST_SHEET_HEADERS],
    ...sorted.map((u, idx) => {
      const latest = latestByStudentId.get(u.id) ?? null;
      return [
        String(idx + 1),
        u.full_name?.trim() || '',
        u.student_number?.trim() || '',
        u.team_code?.trim() || '',
        u.course_year?.trim() || '',
        IT332_CLASS_COURSE_AND_YEAR,
        u.school_year?.trim() || '',
        u.email?.trim() || '',
        directoryStatus(u, latest),
        latest?.file_name?.trim() || '',
        latest ? formatSubmittedAt(latest.submitted_at) : '',
        latest ? submissionQueueDocumentType(latest) : '',
      ];
    }),
  ];
}

import type { TeacherSubmission } from './teacherSubmissionLoad';

export const GRADE_SHEET_HEADERS = [
  'Student Name',
  'Email',
  'Student Number',
  'Assignment Title',
  'Document Type',
  'File Name',
  'Score',
  'Status',
  'Submitted At',
  'Updated At',
  'File URL',
  'Feedback',
] as const;

export function buildGradeSheetValues(rows: TeacherSubmission[]): string[][] {
  return [
    [...GRADE_SHEET_HEADERS],
    ...rows.map((s) => [
      s.users?.full_name?.trim() || s.student_id || '',
      s.users?.email?.trim() || '',
      s.users?.student_number?.trim() || '',
      s.assignments?.title?.trim() || s.submission_doc_type?.trim() || s.file_name || '',
      s.assignments?.document_type?.trim() || '',
      s.file_name || '',
      s.score != null ? String(s.score) : '',
      s.status || '',
      s.submitted_at || '',
      s.updated_at || s.submitted_at || '',
      s.file_url || '',
      s.feedback || '',
    ]),
  ];
}

export function spreadsheetEditUrl(sheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
}

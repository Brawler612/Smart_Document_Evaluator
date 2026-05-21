import type { TeacherSubmission } from './teacherSubmissionLoad';

export const GRADE_SHEET_HEADERS = [
  'Student Name',
  'Email',
  'Student Number',
  'Assignment Title',
  'Document Type',
  'File Name',
  'Score',
  'Teacher Score',
  'AI Draft Score',
  'Status',
  'Submitted At',
  'Updated At',
  'File URL',
  'Feedback',
] as const;

/** Grade shown in the app: official teacher score, else published AI draft. */
export function effectiveGradePercent(s: TeacherSubmission): number | null {
  if (s.score != null && Number.isFinite(s.score)) return s.score;
  if (s.ai_draft_score != null && Number.isFinite(s.ai_draft_score)) return s.ai_draft_score;
  return null;
}

function formatSheetTimestamp(iso: string | null | undefined): string {
  if (!iso?.trim()) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    }).format(d);
  } catch {
    return iso;
  }
}

function scoreCell(n: number | null | undefined): string {
  return n != null && Number.isFinite(n) ? String(n) : '';
}

export function buildGradeSheetValues(rows: TeacherSubmission[]): string[][] {
  return [
    [...GRADE_SHEET_HEADERS],
    ...rows.map((s) => {
      const effective = effectiveGradePercent(s);
      const updated = s.updated_at?.trim() || s.submitted_at || '';
      return [
        s.users?.full_name?.trim() || s.student_id || '',
        s.users?.email?.trim() || '',
        s.users?.student_number?.trim() || '',
        s.assignments?.title?.trim() || s.submission_doc_type?.trim() || s.file_name || '',
        s.assignments?.document_type?.trim() || '',
        s.file_name || '',
        scoreCell(effective),
        scoreCell(s.score),
        scoreCell(s.ai_draft_score),
        s.status || '',
        formatSheetTimestamp(s.submitted_at),
        formatSheetTimestamp(updated),
        s.file_url || '',
        s.feedback || '',
      ];
    }),
  ];
}

/** Pad with blank rows so a full-tab rewrite clears leftover cells from prior syncs. */
export function padSheetValuesForFullReplace(values: string[][], minRows = 120): string[][] {
  if (values.length === 0) return values;
  const colCount = values[0]!.length;
  const out = values.map((row) => [...row]);
  while (out.length < minRows) {
    out.push(Array(colCount).fill(''));
  }
  return out;
}

export function spreadsheetEditUrl(sheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
}

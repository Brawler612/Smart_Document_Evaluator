import { getSubmissionRosterSheetTabName } from './googleSheetsConfig';
import { writeValuesViaTeacherGoogle } from './googleSheetsBrowserSync';
import { buildSubmissionRosterSheetValues } from './submissionRosterSheetRows';
import type { TeacherSubmission } from './teacherSubmissionLoad';
import type { SyncGradesResult } from './syncGradesToSheet';

export type { SyncGradesResult };

export async function syncSubmissionRosterToGoogleSheet(
  loadRows: () => Promise<TeacherSubmission[]>,
  options?: { interactiveSetup?: boolean }
): Promise<SyncGradesResult> {
  const rows = await loadRows();
  const values = buildSubmissionRosterSheetValues(rows);
  return writeValuesViaTeacherGoogle(values, getSubmissionRosterSheetTabName(), {
    interactiveSetup: options?.interactiveSetup !== false,
    createTabIfMissing: true,
  });
}

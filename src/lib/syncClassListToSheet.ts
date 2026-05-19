import { buildClassListSheetValues } from './classListSheetRows';
import { getClassListSheetTabName } from './googleSheetsConfig';
import { writeValuesViaTeacherGoogle } from './googleSheetsBrowserSync';
import type { SyncGradesResult } from './syncGradesToSheet';

export type { SyncGradesResult };

/**
 * Push the full class directory to the "Class List" tab in Google Sheets.
 */
export async function syncClassListToGoogleSheet(
  loadValues: () => Promise<string[][]>,
  options?: { interactiveSetup?: boolean }
): Promise<SyncGradesResult> {
  const values = await loadValues();
  return writeValuesViaTeacherGoogle(values, getClassListSheetTabName(), {
    interactiveSetup: options?.interactiveSetup !== false,
    createTabIfMissing: true,
  });
}

export async function syncClassListFromDirectory(
  students: Parameters<typeof buildClassListSheetValues>[0],
  latestByStudentId: Parameters<typeof buildClassListSheetValues>[1],
  options?: { interactiveSetup?: boolean }
): Promise<SyncGradesResult> {
  return syncClassListToGoogleSheet(
    async () => buildClassListSheetValues(students, latestByStudentId),
    options
  );
}

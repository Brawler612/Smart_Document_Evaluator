import { syncClassListToGoogleSheet } from './syncClassListToSheet';
import { syncGradesToGoogleSheet, type SyncGradesResult } from './syncGradesToSheet';
import { syncSubmissionRosterToGoogleSheet } from './syncSubmissionRosterToSheet';
import { buildClassListSheetValuesFromSupabase } from './teacherSheetsSyncPayload';
import { fetchTeacherSubmissionRows } from './teacherSubmissionLoad';
import { withTimeout } from './syncTimeout';

export type SyncAllTeacherSheetsOptions = {
  interactiveSetup?: boolean;
  /** Skip Vercel service-account route (recommended on localhost). */
  skipServer?: boolean;
};

/**
 * Push Grades, Submission Roster, and Class List tabs from current Supabase data.
 */
export async function syncAllTeacherGoogleSheets(
  options: SyncAllTeacherSheetsOptions = {}
): Promise<SyncGradesResult> {
  const interactive = options.interactiveSetup !== false;
  const skipServer =
    options.skipServer ?? (typeof import.meta !== 'undefined' && import.meta.env.DEV);

  const run = async (): Promise<SyncGradesResult> => {
    const grades = await syncGradesToGoogleSheet(fetchTeacherSubmissionRows, {
      interactiveSetup: interactive,
      skipServer,
    });
    if (!grades.ok) return grades;

    const roster = await syncSubmissionRosterToGoogleSheet(fetchTeacherSubmissionRows, {
      interactiveSetup: false,
    });
    if (!roster.ok) return roster;

    const classList = await syncClassListToGoogleSheet(buildClassListSheetValuesFromSupabase, {
      interactiveSetup: false,
    });
    if (!classList.ok) return classList;

    return grades;
  };

  return withTimeout(run(), 180_000, 'Google Sheets sync (all tabs)');
}

import { useEffect } from 'react';
import { scheduleAutoSyncClassListToSheet, setClassListSheetRowProvider } from '../lib/autoSyncClassListToSheet';
import { scheduleAutoSyncGradesToSheet } from '../lib/autoSyncGradesToSheet';
import {
  scheduleAutoSyncSubmissionRosterToSheet,
  setSubmissionRosterSheetLoader,
} from '../lib/autoSyncSubmissionRosterToSheet';
import { buildClassListSheetValuesFromSupabase } from '../lib/teacherSheetsSyncPayload';
import { fetchTeacherSubmissionRows } from '../lib/teacherSubmissionLoad';
import { useSubmissionsRealtimeRefresh } from './useSubmissionsRealtimeRefresh';

/**
 * While a teacher/admin is signed in, keep Google Sheets (Grades, Submission Roster,
 * Class List) in sync with Supabase when submissions change (upload, grade, delete).
 */
export function useTeacherGoogleSheetsAutoSync(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      setSubmissionRosterSheetLoader(null);
      setClassListSheetRowProvider(null);
      return;
    }

    setSubmissionRosterSheetLoader(fetchTeacherSubmissionRows);
    setClassListSheetRowProvider(buildClassListSheetValuesFromSupabase);

    return () => {
      setSubmissionRosterSheetLoader(null);
      setClassListSheetRowProvider(null);
    };
  }, [enabled]);

  useSubmissionsRealtimeRefresh(() => {
    if (!enabled) return;
    scheduleAutoSyncGradesToSheet('supabase-change');
    scheduleAutoSyncSubmissionRosterToSheet('supabase-change');
    scheduleAutoSyncClassListToSheet('supabase-change');
  });
}

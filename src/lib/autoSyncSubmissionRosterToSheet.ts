import { isAutoSheetSyncEnabled } from './autoSyncGradesToSheet';
import { isGoogleSheetTargetConfigured } from './googleSheetsConfig';
import { syncSubmissionRosterToGoogleSheet, type SyncGradesResult } from './syncSubmissionRosterToSheet';
import type { TeacherSubmission } from './teacherSubmissionLoad';

const DEBOUNCE_MS = 3500;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<SyncGradesResult> | null = null;
let rowLoader: (() => Promise<TeacherSubmission[]>) | null = null;

type AutoSyncListener = (result: SyncGradesResult) => void;
const listeners = new Set<AutoSyncListener>();

export function setSubmissionRosterSheetLoader(loader: (() => Promise<TeacherSubmission[]>) | null): void {
  rowLoader = loader;
}

export function onAutoSubmissionRosterSheetSync(listener: AutoSyncListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(result: SyncGradesResult): void {
  for (const listener of listeners) {
    try {
      listener(result);
    } catch (e) {
      console.warn('[auto-sync-submission-roster]', e);
    }
  }
}

export function scheduleAutoSyncSubmissionRosterToSheet(_reason?: string): void {
  if (!isAutoSheetSyncEnabled()) return;
  if (!isGoogleSheetTargetConfigured()) return;
  if (!rowLoader) return;

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void runAutoSyncSubmissionRosterToSheet();
  }, DEBOUNCE_MS);
}

export async function runAutoSyncSubmissionRosterToSheet(): Promise<SyncGradesResult> {
  if (!rowLoader) {
    return { ok: false, message: 'Submission roster is not ready to sync yet.' };
  }

  if (!isGoogleSheetTargetConfigured()) {
    return syncSubmissionRosterToGoogleSheet(rowLoader, { interactiveSetup: true });
  }

  if (inflight) return inflight;

  inflight = (async () => {
    const result = await syncSubmissionRosterToGoogleSheet(rowLoader!, { interactiveSetup: false });
    notify(result);
    return result;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

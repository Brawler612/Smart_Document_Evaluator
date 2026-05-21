import { getGoogleSheetsConfig, isGoogleSheetTargetConfigured } from './googleSheetsConfig';
import { syncGradesToGoogleSheet, type SyncGradesResult } from './syncGradesToSheet';

const DEBOUNCE_MS = 3500;
const LS_AUTO_OFF = 'sde:googleSheetsAutoSyncOff:v1';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<SyncGradesResult> | null = null;

type AutoSyncListener = (result: SyncGradesResult) => void;
const listeners = new Set<AutoSyncListener>();

export function isAutoSheetSyncEnabled(): boolean {
  if (typeof window !== 'undefined' && localStorage.getItem(LS_AUTO_OFF) === '1') {
    return false;
  }
  const flag = String(import.meta.env.VITE_GOOGLE_SHEETS_AUTO_SYNC ?? 'true')
    .trim()
    .toLowerCase();
  return flag !== 'false' && flag !== '0' && flag !== 'off';
}

export function setAutoSheetSyncEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  if (enabled) localStorage.removeItem(LS_AUTO_OFF);
  else localStorage.setItem(LS_AUTO_OFF, '1');
}

export function onAutoSheetSync(listener: AutoSyncListener): () => void {
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
      console.warn('[auto-sync-grades]', e);
    }
  }
}

/**
 * Debounced push of the full grading queue to Google Sheets.
 * Runs only when sheet + OAuth client are already configured (env or localStorage).
 */
export function scheduleAutoSyncGradesToSheet(
  _reason?: string,
  options?: { immediate?: boolean }
): void {
  if (!isAutoSheetSyncEnabled()) return;
  if (!isGoogleSheetTargetConfigured()) return;

  if (options?.immediate) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = null;
    void runAutoSyncGradesToSheet();
    return;
  }

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void runAutoSyncGradesToSheet();
  }, DEBOUNCE_MS);
}

/** Immediate sync (background / debounced). */
export async function runAutoSyncGradesToSheet(options?: {
  bypassInflight?: boolean;
}): Promise<SyncGradesResult> {
  if (!isGoogleSheetTargetConfigured()) {
    return syncGradesToGoogleSheet(undefined, { interactiveSetup: true });
  }

  if (inflight && !options?.bypassInflight) return inflight;

  const run = (async () => {
    const result = await syncGradesToGoogleSheet(undefined, { interactiveSetup: false });
    notify(result);
    return result;
  })().finally(() => {
    inflight = null;
  });

  inflight = run;
  return run;
}

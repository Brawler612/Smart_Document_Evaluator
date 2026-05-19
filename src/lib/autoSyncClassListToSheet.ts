import { isGoogleSheetTargetConfigured } from './googleSheetsConfig';
import { isAutoSheetSyncEnabled } from './autoSyncGradesToSheet';
import { syncClassListToGoogleSheet, type SyncGradesResult } from './syncClassListToSheet';

const DEBOUNCE_MS = 3500;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<SyncGradesResult> | null = null;
let rowProvider: (() => Promise<string[][]>) | null = null;

type AutoSyncListener = (result: SyncGradesResult) => void;
const listeners = new Set<AutoSyncListener>();

export function setClassListSheetRowProvider(provider: (() => Promise<string[][]>) | null): void {
  rowProvider = provider;
}

export function onAutoClassListSheetSync(listener: AutoSyncListener): () => void {
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
      console.warn('[auto-sync-class-list]', e);
    }
  }
}

/** Debounced push of the class directory to the Class List sheet tab. */
export function scheduleAutoSyncClassListToSheet(_reason?: string): void {
  if (!isAutoSheetSyncEnabled()) return;
  if (!isGoogleSheetTargetConfigured()) return;
  if (!rowProvider) return;

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void runAutoSyncClassListToSheet();
  }, DEBOUNCE_MS);
}

export async function runAutoSyncClassListToSheet(): Promise<SyncGradesResult> {
  if (!rowProvider) {
    return { ok: false, message: 'Class list is not ready to sync yet.' };
  }

  if (!isGoogleSheetTargetConfigured()) {
    return syncClassListToGoogleSheet(rowProvider, { interactiveSetup: true });
  }

  if (inflight) return inflight;

  inflight = (async () => {
    const result = await syncClassListToGoogleSheet(rowProvider!, { interactiveSetup: false });
    notify(result);
    return result;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

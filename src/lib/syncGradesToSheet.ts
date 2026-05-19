import { syncGradesViaTeacherGoogle } from './googleSheetsBrowserSync';
import { fetchTeacherSubmissionRows, type TeacherSubmission } from './teacherSubmissionLoad';

export type SyncGradesResult =
  | {
      ok: true;
      spreadsheetUrl: string;
      rowsWritten: number;
      sheetName: string;
    }
  | { ok: false; message: string };

function isJsonContentType(ct: string | null): boolean {
  if (!ct) return false;
  return ct.includes('application/json') || ct.includes('json');
}

function isServerNotConfigured(message: string): boolean {
  return /not configured|GOOGLE_SHEET_ID|GOOGLE_SERVICE_ACCOUNT|SERVICE_ROLE/i.test(message);
}

async function tryServerSync(): Promise<SyncGradesResult | null> {
  let res: Response;
  try {
    res = await fetch('/api/sync-grades', {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
  } catch {
    return null;
  }

  const contentType = res.headers.get('content-type');
  const text = await res.text();

  if (!isJsonContentType(contentType) || text.trimStart().startsWith('<!')) {
    return null;
  }

  let json: Record<string, unknown> = {};
  if (text) {
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { ok: false, message: 'Sync API returned invalid JSON.' };
    }
  }

  if (!res.ok || json.ok !== true) {
    const err =
      typeof json.error === 'string'
        ? json.error
        : text || `HTTP ${res.status} ${res.statusText}`;
    if (res.status === 503 && isServerNotConfigured(err)) {
      return null;
    }
    return { ok: false, message: err };
  }

  const spreadsheetUrl =
    typeof json.spreadsheetUrl === 'string' ? json.spreadsheetUrl.trim() : '';
  const sheetName = typeof json.sheetName === 'string' ? json.sheetName : 'Sheet1';
  const rowsWritten =
    typeof json.rowsWritten === 'number'
      ? json.rowsWritten
      : typeof json.updatedRows === 'number'
        ? json.updatedRows
        : 0;

  if (!spreadsheetUrl) {
    return { ok: false, message: 'Sync reported success but no spreadsheet URL was returned.' };
  }

  return { ok: true, spreadsheetUrl, rowsWritten, sheetName };
}

/**
 * Sync grades to Google Sheets.
 * 1) Server service-account route when configured on Vercel.
 * 2) Otherwise teacher Google OAuth + Sheets API from the browser (needs VITE_GOOGLE_SHEET_ID + VITE_GOOGLE_OAUTH_CLIENT_ID).
 */
export async function syncGradesToGoogleSheet(
  loadRows: () => Promise<TeacherSubmission[]> = fetchTeacherSubmissionRows,
  options?: { interactiveSetup?: boolean }
): Promise<SyncGradesResult> {
  const server = await tryServerSync();
  if (server) return server;
  return syncGradesViaTeacherGoogle(loadRows, {
    interactiveSetup: options?.interactiveSetup !== false,
  });
}

/**
 * Google Sheets sync settings: `.env` first, then per-browser localStorage
 * (set once via prompt on first “Sync to Google Sheets”).
 */

const LS_SHEET_ID = 'sde:googleSheetId:v1';
const LS_CLIENT_ID = 'sde:googleOAuthClientId:v1';
const LS_SHEET_NAME = 'sde:googleSheetName:v1';

export type GoogleSheetsConfig = {
  sheetId: string;
  clientId: string;
  sheetName: string;
  viewUrl: string;
};

/** Extract spreadsheet ID from a full URL or a bare ID string. */
export function parseSpreadsheetIdFromInput(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const fromUrl = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (fromUrl?.[1]) return fromUrl[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(raw)) return raw;
  return null;
}

function readEnvSheetId(): string {
  const direct = (import.meta.env.VITE_GOOGLE_SHEET_ID || '').trim();
  if (direct) return direct;
  const fromUrl = parseSpreadsheetIdFromInput(
    (import.meta.env.VITE_GOOGLE_SHEETS_URL || '').trim()
  );
  return fromUrl || '';
}

function readEnvClientId(): string {
  return (
    import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID ||
    import.meta.env.VITE_GOOGLE_CLIENT_ID ||
    ''
  ).trim();
}

function readEnvSheetName(): string {
  return (import.meta.env.VITE_GOOGLE_SHEET_NAME || 'Grades').trim();
}

function readEnvClassListSheetName(): string {
  return (import.meta.env.VITE_GOOGLE_CLASS_LIST_SHEET_NAME || 'Class List').trim();
}

function readEnvSubmissionRosterSheetName(): string {
  return (import.meta.env.VITE_GOOGLE_SUBMISSION_ROSTER_SHEET_NAME || 'Submission Roster').trim();
}

/** Tab name for the Class List directory sync. */
export function getClassListSheetTabName(): string {
  if (typeof window === 'undefined') return readEnvClassListSheetName();
  return readEnvClassListSheetName();
}

/** Tab name for the Student Submissions roster sync. */
export function getSubmissionRosterSheetTabName(): string {
  if (typeof window === 'undefined') return readEnvSubmissionRosterSheetName();
  return readEnvSubmissionRosterSheetName();
}

/** True when a target spreadsheet is configured (client ID optional if signed in with Google). */
export function isGoogleSheetTargetConfigured(): boolean {
  if (typeof window === 'undefined') return false;
  const sheetId = readEnvSheetId() || localStorage.getItem(LS_SHEET_ID)?.trim() || '';
  return Boolean(sheetId);
}

export type GoogleSheetsSetupStatus = {
  hasSheet: boolean;
  hasClientId: boolean;
  ready: boolean;
  hint: string | null;
};

function envSetupHint(localDev: string, vercel: string): string {
  return import.meta.env.PROD ? vercel : localDev;
}

/** What is missing before sync can run. */
export function getGoogleSheetsSetupStatus(): GoogleSheetsSetupStatus {
  const cfg = getGoogleSheetsConfig();
  const hasSheet = Boolean(cfg?.sheetId);
  const hasClientId = Boolean(cfg?.clientId);
  if (!hasSheet) {
    return {
      hasSheet: false,
      hasClientId,
      ready: false,
      hint: envSetupHint(
        'Add VITE_GOOGLE_SHEET_ID (or VITE_GOOGLE_SHEETS_URL) in .env, then restart npm run dev. Or click Sync to Google Sheets and paste your sheet link once.',
        'Vercel → Project → Settings → Environment Variables: add VITE_GOOGLE_SHEET_ID (spreadsheet ID from the sheet URL) and redeploy. Or click Sync to Google Sheets and paste your sheet link (saved in this browser only).'
      ),
    };
  }
  if (!hasClientId) {
    return {
      hasSheet: true,
      hasClientId: false,
      ready: true,
      hint: envSetupHint(
        'Add VITE_GOOGLE_OAUTH_CLIENT_ID in .env (same Web client as Supabase Google), restart npm run dev, then click Sync and approve spreadsheet access.',
        'Vercel → Environment Variables: add VITE_GOOGLE_OAUTH_CLIENT_ID (Google Cloud Web client ID), redeploy, then click Sync to Google Sheets and approve access.'
      ),
    };
  }
  return { hasSheet: true, hasClientId: true, ready: true, hint: null };
}

/** Current config when a spreadsheet ID is set (OAuth client ID optional). */
export function getGoogleSheetsConfig(): GoogleSheetsConfig | null {
  if (typeof window === 'undefined') return null;

  const sheetId = readEnvSheetId() || localStorage.getItem(LS_SHEET_ID)?.trim() || '';
  if (!sheetId) return null;

  const clientId = readEnvClientId() || localStorage.getItem(LS_CLIENT_ID)?.trim() || '';
  const sheetName = readEnvSheetName() || localStorage.getItem(LS_SHEET_NAME)?.trim() || 'Grades';
  const envView = (import.meta.env.VITE_GOOGLE_SHEETS_URL || '').trim();
  const viewUrl =
    envView || `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;

  return { sheetId, clientId, sheetName, viewUrl };
}

/**
 * Ensures sheet ID and OAuth client ID exist — prompts once if missing.
 * Returns null if the user cancels.
 */
export function ensureGoogleSheetsConfig(): GoogleSheetsConfig | null {
  if (typeof window === 'undefined') return null;

  let sheetId = readEnvSheetId() || localStorage.getItem(LS_SHEET_ID)?.trim() || '';
  let clientId = readEnvClientId() || localStorage.getItem(LS_CLIENT_ID)?.trim() || '';

  if (!sheetId) {
    const pasted = window.prompt(
      'Paste your Google Sheet link or spreadsheet ID.\n\nExample:\nhttps://docs.google.com/spreadsheets/d/abc123.../edit\n\nUse a sheet you own (or Editor access).'
    );
    if (!pasted?.trim()) return null;
    const parsed = parseSpreadsheetIdFromInput(pasted);
    if (!parsed) {
      window.alert('Could not read a spreadsheet ID from that link. Copy the URL from your browser address bar.');
      return null;
    }
    sheetId = parsed;
    localStorage.setItem(LS_SHEET_ID, sheetId);
  }

  if (!clientId) {
    const pasted = window.prompt(
      'Paste your Google OAuth Web Client ID (or click Cancel if you only use “Sign in with Google”).\n\nFind it in:\nSupabase → Authentication → Providers → Google\n(same value as Google Cloud → Credentials → OAuth 2.0 Client IDs → Web client)'
    );
    if (pasted?.trim()) {
      clientId = pasted.trim();
      localStorage.setItem(LS_CLIENT_ID, clientId);
    }
  }

  const sheetName = readEnvSheetName() || localStorage.getItem(LS_SHEET_NAME)?.trim() || 'Grades';
  const viewUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;

  return { sheetId, clientId, sheetName, viewUrl };
}

export function clearGoogleSheetsConfig(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(LS_SHEET_ID);
  localStorage.removeItem(LS_CLIENT_ID);
  localStorage.removeItem(LS_SHEET_NAME);
}

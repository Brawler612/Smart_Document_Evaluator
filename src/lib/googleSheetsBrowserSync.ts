import { buildGradeSheetValues, padSheetValuesForFullReplace, spreadsheetEditUrl } from './gradeSheetRows';
import { ensureGoogleSheetsConfig, getGoogleSheetsConfig, type GoogleSheetsConfig } from './googleSheetsConfig';

const LS_ACCESS_TOKEN = 'sde:googleSheetsAccessToken:v1';
const LS_ACCESS_TOKEN_EXP = 'sde:googleSheetsAccessTokenExp:v1';
/** Bumped when token source changes — clears old Supabase login tokens cached for Sheets. */
const LS_TOKEN_GENERATION = 'sde:googleSheetsTokenGen:v2';

function maybeInvalidateLegacySheetsTokenCache(): void {
  if (typeof sessionStorage === 'undefined') return;
  if (sessionStorage.getItem(LS_TOKEN_GENERATION) === 'v2') return;
  clearCachedAccessToken();
  sessionStorage.setItem(LS_TOKEN_GENERATION, 'v2');
}

function readCachedAccessToken(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  const exp = Number(sessionStorage.getItem(LS_ACCESS_TOKEN_EXP) || 0);
  if (!exp || Date.now() > exp) return null;
  return sessionStorage.getItem(LS_ACCESS_TOKEN);
}

function cacheAccessToken(token: string, expiresInSec = 3300): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(LS_ACCESS_TOKEN, token);
  sessionStorage.setItem(LS_ACCESS_TOKEN_EXP, String(Date.now() + expiresInSec * 1000));
}

function clearCachedAccessToken(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(LS_ACCESS_TOKEN);
  sessionStorage.removeItem(LS_ACCESS_TOKEN_EXP);
}

import { sanitizeGoogleSheetsValues } from '../../shared/googleSheetsCellLimits';
import { withTimeout } from './syncTimeout';
import type { TeacherSubmission } from './teacherSubmissionLoad';
import type { SyncGradesResult } from './syncGradesToSheet';

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

function loadGisScript(): Promise<void> {
  const src = 'https://accounts.google.com/gsi/client';
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Google sign-in (Identity Services).'));
    document.head.appendChild(script);
  });
}

function requestAccessToken(clientId: string, forceConsent = false): Promise<string> {
  type TokenClient = {
    requestAccessToken: (opts?: { prompt?: string }) => void;
  };
  type GisWindow = Window & {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: {
            client_id: string;
            scope: string;
            callback: (resp: { access_token?: string; error?: string }) => void;
          }) => TokenClient;
        };
      };
    };
  };

  return new Promise((resolve, reject) => {
    const g = (window as GisWindow).google;
    if (!g?.accounts?.oauth2) {
      reject(new Error('Google Identity Services is not available.'));
      return;
    }
    const client = g.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SHEETS_SCOPE,
      callback: (resp) => {
        if (resp.error) {
          reject(new Error(resp.error));
          return;
        }
        if (!resp.access_token) {
          reject(new Error('Google did not return an access token.'));
          return;
        }
        resolve(resp.access_token);
      },
    });
    client.requestAccessToken({ prompt: forceConsent ? 'consent' : '' });
  });
}

const OAUTH_TOKEN_TIMEOUT_MS = 90_000;
const SHEETS_HTTP_TIMEOUT_MS = 60_000;

function isSheetsScopeError(message: string): boolean {
  return /403|401|insufficient|permission|scope|ACCESS_TOKEN_SCOPE/i.test(message);
}

async function sheetsFetch<T>(
  accessToken: string,
  url: string,
  init?: RequestInit
): Promise<T> {
  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), SHEETS_HTTP_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Google Sheets request timed out. Try Sync again in a moment.');
    }
    throw e;
  } finally {
    clearTimeout(abortTimer);
  }
  const text = await res.text();
  let json: unknown = {};
  if (text) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = { raw: text };
    }
  }
  if (!res.ok) {
    const err =
      typeof json === 'object' &&
      json != null &&
      'error' in json &&
      typeof (json as { error?: { message?: string } }).error?.message === 'string'
        ? (json as { error: { message: string } }).error.message
        : text || `Sheets API HTTP ${res.status}`;
    throw new Error(err);
  }
  return json as T;
}

async function listTabTitles(accessToken: string, spreadsheetId: string): Promise<string[]> {
  const meta = await sheetsFetch<{ sheets?: Array<{ properties?: { title?: string } }> }>(
    accessToken,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`
  );
  return (
    meta.sheets
      ?.map((s) => s.properties?.title)
      .filter((t): t is string => typeof t === 'string' && t.length > 0) ?? []
  );
}

async function ensureTabTitle(accessToken: string, spreadsheetId: string, preferredTab: string): Promise<string> {
  const titles = await listTabTitles(accessToken, spreadsheetId);
  if (titles.includes(preferredTab)) return preferredTab;
  if (titles.length > 0 && preferredTab === 'Sheet1') return titles[0]!;

  await sheetsFetch(accessToken, `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title: preferredTab } } }],
    }),
  });
  return preferredTab;
}

function tabRange(sheetName: string, suffix: string): string {
  const quoted =
    sheetName.includes(' ') || sheetName.includes("'") ? `'${sheetName.replace(/'/g, "''")}'` : sheetName;
  return encodeURIComponent(`${quoted}${suffix}`);
}

/**
 * Sheets API needs `.../auth/spreadsheets`. Supabase Google sign-in only grants profile/email —
 * never use `session.provider_token` for Sheets (it causes "insufficient authentication scopes").
 */
async function obtainSheetsAccessToken(
  clientId: string,
  options?: { forceConsent?: boolean }
): Promise<string> {
  if (options?.forceConsent) clearCachedAccessToken();

  if (!options?.forceConsent) {
    const cached = readCachedAccessToken();
    if (cached) return cached;
  }

  if (!clientId.trim()) {
    throw new Error(
      'Add VITE_GOOGLE_OAUTH_CLIENT_ID to .env (same Web client ID as Supabase → Google provider), restart npm run dev, then click Sync to Google Sheets and allow spreadsheet access.'
    );
  }

  await loadGisScript();
  const token = await withTimeout(
    requestAccessToken(clientId.trim(), Boolean(options?.forceConsent)),
    OAUTH_TOKEN_TIMEOUT_MS,
    'Google sign-in for Sheets (allow the popup if your browser blocked it)'
  );
  cacheAccessToken(token);
  return token;
}

/**
 * Writes a 2D values grid to a spreadsheet tab using the teacher's Google account.
 */
export async function writeValuesViaTeacherGoogle(
  values: string[][],
  preferredTab: string,
  options?: { interactiveSetup?: boolean; createTabIfMissing?: boolean }
): Promise<SyncGradesResult> {
  const interactive = options?.interactiveSetup !== false;
  const config: GoogleSheetsConfig | null = interactive
    ? ensureGoogleSheetsConfig()
    : getGoogleSheetsConfig();
  if (!config?.sheetId) {
    return interactive
      ? { ok: false, message: 'Google Sheets setup was cancelled.' }
      : {
          ok: false,
          message:
            'Auto-sync skipped — set VITE_GOOGLE_SHEET_ID in .env, or click Sync to Google Sheets once to paste your sheet link.',
        };
  }
  const { sheetId, clientId } = config;

  try {
    maybeInvalidateLegacySheetsTokenCache();
    let accessToken = await obtainSheetsAccessToken(clientId);
    let sheetName = preferredTab;
    if (options?.createTabIfMissing !== false) {
      sheetName = await ensureTabTitle(accessToken, sheetId, preferredTab);
    } else {
      const titles = await listTabTitles(accessToken, sheetId);
      sheetName = titles.includes(preferredTab) ? preferredTab : titles[0] ?? preferredTab;
    }

    const safeValues = sanitizeGoogleSheetsValues(padSheetValuesForFullReplace(values));

    const writeSheet = async (token: string) => {
      await sheetsFetch(
        token,
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${tabRange(sheetName, '!A:Z')}:clear`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      await sheetsFetch(
        token,
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${tabRange(sheetName, '!A1')}?valueInputOption=USER_ENTERED`,
        { method: 'PUT', body: JSON.stringify({ values: safeValues }) }
      );
    };

    try {
      await writeSheet(accessToken);
    } catch (firstErr) {
      const msg = firstErr instanceof Error ? firstErr.message : '';
      if (!isSheetsScopeError(msg)) throw firstErr;
      if (!clientId.trim()) throw firstErr;
      clearCachedAccessToken();
      await loadGisScript();
      accessToken = await obtainSheetsAccessToken(clientId, { forceConsent: true });
      await writeSheet(accessToken);
    }

    const rowsWritten = Math.max(0, values.length - 1);
    return {
      ok: true,
      spreadsheetUrl: spreadsheetEditUrl(sheetId),
      rowsWritten,
      sheetName,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Google Sheets update failed.';
    if (/access_not_configured|API has not been used|disabled/i.test(msg)) {
      return {
        ok: false,
        message: `${msg} Enable “Google Sheets API” in Google Cloud for your OAuth client project.`,
      };
    }
    if (isSheetsScopeError(msg)) {
      return {
        ok: false,
        message: clientId.trim()
          ? `${msg} Click Sync to Google Sheets again and approve spreadsheet access when Google asks. Also share the sheet with your Gmail as Editor and enable Google Sheets API in Cloud Console.`
          : `${msg} Set VITE_GOOGLE_OAUTH_CLIENT_ID in .env, restart the dev server, then sync again.`,
      };
    }
    return { ok: false, message: msg };
  }
}

/**
 * Writes grade rows using the signed-in teacher's Google account (no service account).
 */
export async function syncGradesViaTeacherGoogle(
  loadRows: () => Promise<TeacherSubmission[]>,
  options?: { interactiveSetup?: boolean }
): Promise<SyncGradesResult> {
  const interactive = options?.interactiveSetup !== false;
  const config: GoogleSheetsConfig | null = interactive
    ? ensureGoogleSheetsConfig()
    : getGoogleSheetsConfig();
  if (!config) {
    return interactive
      ? { ok: false, message: 'Google Sheets setup was cancelled.' }
      : {
          ok: false,
          message:
            'Auto-sync skipped — set VITE_GOOGLE_SHEET_ID in .env, or click Sync to Google Sheets once to paste your sheet link.',
        };
  }
  const submissions = await loadRows();
  const values = buildGradeSheetValues(submissions);
  return writeValuesViaTeacherGoogle(values, config.sheetName, {
    interactiveSetup: interactive,
    createTabIfMissing: false,
  });
}

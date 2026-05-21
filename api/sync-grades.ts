/**
 * POST /api/sync-grades
 *
 * Syncs teacher submission grades to a Google Sheet using a service account.
 *
 * Required env vars:
 *   GOOGLE_SHEET_ID
 *   GOOGLE_SERVICE_ACCOUNT_KEY   (JSON string or escaped JSON)
 *   VITE_SUPABASE_URL or SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional:
 *   GOOGLE_SHEET_NAME  (defaults to Sheet1)
 */

import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import { sanitizeGoogleSheetsValues } from '../shared/googleSheetsCellLimits.js';

function effectiveGradePercent(row: Record<string, unknown>): number | null {
  const teacher =
    typeof row.score === 'number' ? row.score : row.score != null ? Number(row.score) : null;
  const ai =
    typeof row.ai_draft_score === 'number'
      ? row.ai_draft_score
      : row.ai_draft_score != null
        ? Number(row.ai_draft_score)
        : null;
  if (teacher != null && Number.isFinite(teacher)) return teacher;
  if (ai != null && Number.isFinite(ai)) return ai;
  return null;
}

function scoreCell(n: number | null): string {
  return n != null && Number.isFinite(n) ? String(n) : '';
}

function formatSheetTimestamp(iso: unknown): string {
  if (iso == null) return '';
  const s = String(iso).trim();
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  try {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    }).format(d);
  } catch {
    return s;
  }
}

function padSheetValuesForFullReplace(values: string[][], minRows = 120): string[][] {
  if (values.length === 0) return values;
  const colCount = values[0]!.length;
  const out = values.map((row) => [...row]);
  while (out.length < minRows) {
    out.push(Array(colCount).fill(''));
  }
  return out;
}

const DEFAULT_SHEET_NAME = 'Sheet1';

function spreadsheetEditUrl(sheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
}

async function resolveSheetTabName(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  preferred: string
): Promise<string> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const titles =
    meta.data.sheets
      ?.map((s) => s.properties?.title)
      .filter((t): t is string => typeof t === 'string' && t.length > 0) ?? [];
  if (titles.includes(preferred)) return preferred;
  if (titles.length > 0) return titles[0]!;
  return preferred;
}

function parseJsonEnv(name: string, raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    try {
      return JSON.parse(raw.replace(/\\n/g, '\n')) as Record<string, unknown>;
    } catch {
      console.error(`[sync-grades] failed to parse ${name}`);
      return null;
    }
  }
}

async function resolveSubmissionTableName(admin: ReturnType<typeof createClient>): Promise<'submissions' | 'submission' | null> {
  const plural = await admin.from('submissions').select('id').limit(1);
  if (!plural.error) return 'submissions';
  const singular = await admin.from('submission').select('id').limit(1);
  if (!singular.error) return 'submission';
  return null;
}

function pickJoinedRecord(rel: unknown): Record<string, unknown> | null {
  if (rel == null) return null;
  if (Array.isArray(rel)) {
    const first = rel[0];
    return first && typeof first === 'object' ? (first as Record<string, unknown>) : null;
  }
  return typeof rel === 'object' ? (rel as Record<string, unknown>) : null;
}

function toString(value: unknown): string {
  if (value == null) return '';
  return String(value);
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const sheetId = (process.env.GOOGLE_SHEET_ID || '').trim();
  const preferredSheetName = (process.env.GOOGLE_SHEET_NAME || DEFAULT_SHEET_NAME).trim();
  const rawCreds = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON || '').trim();
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!sheetId || !rawCreds || !url || !serviceKey) {
    return res.status(503).json({
      ok: false,
      error:
        'Google Sheets sync is not configured. Set GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_KEY, VITE_SUPABASE_URL (or SUPABASE_URL), and SUPABASE_SERVICE_ROLE_KEY.',
    });
  }

  const credentials = parseJsonEnv('GOOGLE_SERVICE_ACCOUNT_KEY', rawCreds);
  if (!credentials) {
    return res.status(503).json({ ok: false, error: 'Invalid GOOGLE_SERVICE_ACCOUNT_KEY JSON.' });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const table = await resolveSubmissionTableName(admin);
  if (!table) {
    return res.status(500).json({ ok: false, error: 'Could not locate the submissions table in Supabase.' });
  }

  const joinSelectAttempts = [
    '*, users(full_name, email, student_number, course_year, avatar_url)',
    '*, users(full_name, email, student_number, course_year)',
    '*, users(full_name, email, avatar_url)',
    '*, users(full_name, email)',
    '*',
    '*, assignments(title, document_type, due_date), users(full_name, email, student_number, course_year, avatar_url)',
    '*, assignments(title, document_type, due_date), users(full_name, email, student_number, course_year)',
    '*, assignments(title, document_type, due_date), users(full_name, email, avatar_url)',
    '*, assignments(title, document_type, due_date), users(full_name, email)',
    '*, assignments(title, document_type), users(full_name, email, student_number, course_year, avatar_url)',
    '*, assignments(title, document_type), users(full_name, email, student_number, course_year)',
    '*, assignments(title, document_type), users(full_name, email, avatar_url)',
    '*, assignments(title, document_type), users(full_name, email)',
  ];

  let rows: unknown[] | null = null;
  for (const sel of joinSelectAttempts) {
    const result = await admin.from(table).select(sel).order('submitted_at', { ascending: false });
    if (!result.error) {
      rows = result.data || [];
      break;
    }
  }

  if (!rows) {
    const result = await admin.from(table).select('*').order('submitted_at', { ascending: false });
    if (result.error) {
      console.error('[sync-grades] supabase query failed', result.error.message);
      return res.status(500).json({ ok: false, error: 'Failed to load submissions from Supabase.' });
    }
    rows = result.data || [];
  }

  const values = [
    [
      'Submission ID',
      'Student UUID',
      'Student Name',
      'Email',
      'Student Number',
      'Assignment Title',
      'Document Type',
      'File Name',
      'Score',
      'Teacher Score',
      'AI Draft Score',
      'Status',
      'Submitted At',
      'Updated At',
      'File URL',
      'Feedback',
    ],
    ...rows.map((raw) => {
      const row = raw as Record<string, unknown>;
      const assignment = pickJoinedRecord(row.assignments);
      const user = pickJoinedRecord(row.users);
      const teacherScore =
        typeof row.score === 'number' ? row.score : row.score != null ? Number(row.score) : null;
      const aiScore =
        typeof row.ai_draft_score === 'number'
          ? row.ai_draft_score
          : row.ai_draft_score != null
            ? Number(row.ai_draft_score)
            : null;
      const updatedRaw = row.updated_at ?? row.submitted_at;
      return [
        toString(row.id ?? ''),
        toString(row.student_id ?? ''),
        toString(user?.full_name ?? row.student_id ?? ''),
        toString(user?.email ?? ''),
        toString(user?.student_number ?? ''),
        toString(assignment?.title ?? row.submission_doc_type ?? row.file_name ?? ''),
        toString(assignment?.document_type ?? ''),
        toString(row.file_name ?? ''),
        scoreCell(effectiveGradePercent(row)),
        scoreCell(Number.isFinite(teacherScore as number) ? (teacherScore as number) : null),
        scoreCell(Number.isFinite(aiScore as number) ? (aiScore as number) : null),
        toString(row.status ?? ''),
        formatSheetTimestamp(row.submitted_at),
        formatSheetTimestamp(updatedRaw),
        toString(row.file_url ?? ''),
        toString(row.feedback ?? ''),
      ];
    }),
  ];

  try {
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const sheetName = await resolveSheetTabName(sheets, sheetId, preferredSheetName);

    await sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: sheetName,
    });

    const safeValues = sanitizeGoogleSheetsValues(padSheetValuesForFullReplace(values));

    const response = await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: safeValues },
    });

    const rowsWritten = Math.max(0, values.length - 1);
    return res.status(200).json({
      ok: true,
      spreadsheetUrl: spreadsheetEditUrl(sheetId),
      sheetName,
      rowsWritten,
      updatedRows: response.data.updatedRows ?? rowsWritten,
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Google Sheets update failed.';
    console.error('[sync-grades]', errorMessage);
    return res.status(500).json({ ok: false, error: errorMessage });
  }
}

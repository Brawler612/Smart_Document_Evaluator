/** Google Sheets hard limit per cell (USER_ENTERED / RAW). */
export const GOOGLE_SHEETS_MAX_CELL_CHARS = 50_000;

const TRUNCATED_SUFFIX = '… [truncated for Google Sheets cell limit]';

/**
 * Keeps a single cell within Google Sheets limits. Data URLs are replaced with a short note
 * (they can be megabytes and are not useful in a spreadsheet).
 */
export function sanitizeGoogleSheetsCell(value: unknown): string {
  if (value == null) return '';
  let s = String(value);
  if (/^data:/i.test(s.trim())) {
    return '[Embedded file — open in Smart Form Evaluator]';
  }
  if (s.length <= GOOGLE_SHEETS_MAX_CELL_CHARS) return s;
  const maxBody = GOOGLE_SHEETS_MAX_CELL_CHARS - TRUNCATED_SUFFIX.length;
  return s.slice(0, Math.max(0, maxBody)) + TRUNCATED_SUFFIX;
}

export function sanitizeGoogleSheetsValues(values: string[][]): string[][] {
  return values.map((row) => row.map(sanitizeGoogleSheetsCell));
}

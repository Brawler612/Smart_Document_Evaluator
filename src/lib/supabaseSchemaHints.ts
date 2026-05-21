/** True when PostgREST reports a missing column (e.g. after manual schema edits in Supabase). */
export function isMissingColumnError(message: string | undefined, column: string): boolean {
  const m = (message ?? '').toLowerCase();
  const col = column.toLowerCase();
  if (!m.includes(col)) return false;
  return (
    m.includes('column') ||
    m.includes('could not find') ||
    m.includes('pgrst204') ||
    m.includes('schema cache') ||
    m.includes('does not exist')
  );
}

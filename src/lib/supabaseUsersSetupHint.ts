/** PostgREST / Supabase client errors when `public.users` is missing or not exposed. */
export function isUsersTableMissingError(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes('could not find the table') ||
    (m.includes('schema cache') && m.includes('users')) ||
    m.includes(`'public.users'`)
  );
}

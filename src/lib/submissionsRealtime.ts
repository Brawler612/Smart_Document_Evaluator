import { supabase } from './supabase';
import { resolveSubmissionTableName } from './teacherSubmissionLoad';

/**
 * Subscribes to Postgres changes on the submissions table so teacher queues
 * drop rows when a student deletes (or another teacher mutates) without waiting
 * for a manual refresh or tab focus.
 */
export function subscribeSubmissionsPostgresChanges(onChange: () => void): () => void {
  let disposed = false;
  let removeChannel: (() => void) | null = null;

  void (async () => {
    const table = await resolveSubmissionTableName();
    if (!table || disposed) return;

    const channel = supabase
      .channel(`sde-${table}-roster`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange())
      .subscribe();

    removeChannel = () => {
      void supabase.removeChannel(channel);
    };
  })();

  return () => {
    disposed = true;
    removeChannel?.();
  };
}

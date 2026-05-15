import { useEffect } from 'react';
import { subscribeSubmissionsPostgresChanges } from '../lib/submissionsRealtime';
import { subscribeSubmissionRemoved } from '../lib/submissionSyncEvents';

/**
 * Keeps teacher submission rosters in sync when rows are deleted in-app
 * (same browser) or via Supabase Realtime (other sessions).
 */
export function useSubmissionsRealtimeRefresh(onRefresh: () => void): void {
  useEffect(() => {
    const refresh = () => onRefresh();
    const unsubPg = subscribeSubmissionsPostgresChanges(refresh);
    const unsubDom = subscribeSubmissionRemoved(() => refresh());
    return () => {
      unsubPg();
      unsubDom();
    };
  }, [onRefresh]);
}

/**
 * Single-flight PKCE exchange for OAuth return (?code=…).
 * Uses a timeout so the UI cannot hang forever on a stuck /auth/v1/token request.
 */
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

/** Enough for CDN + auth round-trip; clears stuck SPAs faster than indefinite hang. */
const EXCHANGE_TIMEOUT_MS = 35_000;

let inflight: Promise<Session | null> | null = null;

function stripAuthParamsFromUrl() {
  const u = new URL(window.location.href);
  u.searchParams.delete('code');
  u.searchParams.delete('state');
  window.history.replaceState({}, '', u.pathname + u.search + u.hash);
}

export async function exchangeOAuthCodeOnce(): Promise<Session | null> {
  if (typeof window === 'undefined') return null;
  const u = new URL(window.location.href);
  if (!u.searchParams.has('code')) return null;

  if (!inflight) {
    inflight = (async (): Promise<Session | null> => {
      const code = u.searchParams.get('code');
      if (!code) return null;
      try {
        const outcome = await Promise.race<
          | { kind: 'ok'; res: Awaited<ReturnType<typeof supabase.auth.exchangeCodeForSession>> }
          | { kind: 'timeout' }
        >([
          supabase.auth.exchangeCodeForSession(code).then(res => ({ kind: 'ok' as const, res })),
          new Promise(resolve => setTimeout(() => resolve({ kind: 'timeout' as const }), EXCHANGE_TIMEOUT_MS)),
        ]);

        if (outcome.kind === 'timeout') {
          console.warn('[auth] exchangeCodeForSession timed out — check VPN/ad-block/network and .env project URL.');
          stripAuthParamsFromUrl();
          return null;
        }

        const { data, error } = outcome.res;
        if (error) {
          console.warn('[auth] exchangeCodeForSession:', error.message);
          stripAuthParamsFromUrl();
          return null;
        }
        stripAuthParamsFromUrl();
        return data.session ?? null;
      } catch (e) {
        console.warn('[auth] PKCE exchange failed:', e);
        stripAuthParamsFromUrl();
        return null;
      } finally {
        inflight = null;
      }
    })();
  }

  return inflight;
}

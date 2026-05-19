/**
 * Single-flight PKCE exchange for OAuth return (?code=…).
 * Uses a timeout so the UI cannot hang forever on a stuck /auth/v1/token request.
 */
import type { Session } from '@supabase/supabase-js';
import { OAUTH_CALLBACK_ERROR_STORAGE_KEY } from './oauthRedirect';
import { supabase } from './supabase';

function storeOAuthHint(message: string): void {
  try {
    sessionStorage.setItem(OAUTH_CALLBACK_ERROR_STORAGE_KEY, message);
  } catch {
    /* ignore */
  }
}

/** Enough for CDN + auth round-trip; clears stuck SPAs faster than indefinite hang. */
const EXCHANGE_TIMEOUT_MS = 12_000;

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
          storeOAuthHint(
            `Sign-in timed out talking to Supabase. Use http://localhost:5173/login (close other dev servers on 5174/5175). In Supabase → Authentication → URL Configuration, add Redirect URL: ${window.location.origin}/login`
          );
          stripAuthParamsFromUrl();
          return null;
        }

        const { data, error } = outcome.res;
        if (error) {
          console.warn('[auth] exchangeCodeForSession:', error.message);
          storeOAuthHint(
            `Sign-in failed: ${error.message}. In Supabase → Authentication → URL Configuration, add Redirect URL exactly: ${window.location.origin}/login (and enable Google provider).`
          );
          stripAuthParamsFromUrl();
          return null;
        }
        stripAuthParamsFromUrl();
        return data.session ?? null;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        console.warn('[auth] PKCE exchange failed:', e);
        storeOAuthHint(
          `Sign-in failed: ${msg}. Add ${window.location.origin}/login to Supabase Redirect URLs.`
        );
        stripAuthParamsFromUrl();
        return null;
      } finally {
        inflight = null;
      }
    })();
  }

  return inflight;
}

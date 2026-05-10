import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { mergeProfileIntoClassRosterCache } from '../lib/classRosterCache';
import { exchangeOAuthCodeOnce } from '../lib/authPkceExchange';
import { supabase } from '../lib/supabase';
import { rosterFieldsFromOAuthMetadata } from '../lib/oauthRosterClaims';
import { getOAuthRedirectTo, OAUTH_CALLBACK_ERROR_STORAGE_KEY } from '../lib/oauthRedirect';
import {
  emailMatchesCampusDomains,
  getConfiguredStudentDomains,
  STUDENT_EMAIL_REJECT_STORAGE_KEY,
} from '../lib/studentEmailPolicy';
import { AppUser, UserRole } from '../types';

interface Ctx {
  session: Session | null;
  user: AppUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
}
const AuthContext = createContext<Ctx>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

function parseEmailList(value: string | undefined): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map(v => v.trim().toLowerCase())
      .filter(Boolean)
  );
}

const ADMIN_EMAILS = parseEmailList(import.meta.env.VITE_ADMIN_EMAILS);
const TEACHER_EMAILS = parseEmailList(import.meta.env.VITE_TEACHER_EMAILS);

async function fetchProfile(id: string): Promise<{ data: AppUser | null; error: string | null }> {
  const { data, error } = await supabase.from('users').select('*').eq('id', id).maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

function normalizeRole(value: unknown): UserRole {
  if (value === 'teacher' || value === 'admin') return value;
  return 'student';
}

function resolveRole(email: string, metaRole: unknown, existingRole?: UserRole): UserRole {
  const lowered = email.toLowerCase();
  if (ADMIN_EMAILS.has(lowered)) return 'admin';
  if (TEACHER_EMAILS.has(lowered)) return 'teacher';
  if (existingRole === 'teacher' || existingRole === 'admin') return existingRole;
  return normalizeRole(metaRole);
}

function fallbackProfile(authUser: User): AppUser {
  const email = authUser.email ?? '';
  const meta = authUser.user_metadata ?? {};
  const full_name =
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    email.split('@')[0] ||
    'User';
  const role = resolveRole(email, meta.role);
  return {
    id: authUser.id,
    email,
    full_name,
    role,
    created_at: new Date().toISOString(),
  };
}

async function ensureUserProfile(authUser: User): Promise<AppUser | null> {
  const email = authUser.email ?? '';
  if (!email) return fallbackProfile(authUser);

  const meta = authUser.user_metadata ?? {};

  const { data: existing, error: loadErr } = await fetchProfile(authUser.id);
  const roleFromConfig = resolveRole(email, meta.role, existing?.role);
  if (loadErr && import.meta.env.DEV) {
    console.warn(
      '[auth] public.users load failed (often RLS/policy). Run docs/supabase-fix-users-rls-recursion.sql —',
      loadErr
    );
  }

  const resolvedFullName =
    (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
    (typeof meta.name === 'string' && meta.name.trim()) ||
    (email ? email.split('@')[0] : '');

  const roster = rosterFieldsFromOAuthMetadata(meta as Record<string, unknown>);

  if (existing) {
    const patch: {
      role?: UserRole;
      email?: string;
      full_name?: string;
      student_number?: string | null;
      course_year?: string | null;
    } = {};
    if (existing.role !== roleFromConfig) patch.role = roleFromConfig;
    if (email && existing.email !== email) patch.email = email;
    if (resolvedFullName && existing.full_name !== resolvedFullName) patch.full_name = resolvedFullName;
    if (roster.student_number && roster.student_number !== existing.student_number) {
      patch.student_number = roster.student_number;
    }
    if (roster.course_year && roster.course_year !== existing.course_year) {
      patch.course_year = roster.course_year;
    }

    if (Object.keys(patch).length > 0) {
      const { data, error } = await supabase.from('users').update(patch).eq('id', existing.id).select().maybeSingle();
      if (!error && data) return data;
      if (error && import.meta.env.DEV) console.warn('[auth] Profile sync failed:', error.message);
      if (error) return { ...existing, ...patch };
    }
    return existing;
  }

  const full_name = resolvedFullName || email.split('@')[0] || 'User';

  const insertRow: Record<string, unknown> = {
    id: authUser.id,
    email,
    full_name,
    role: roleFromConfig,
  };
  if (roster.student_number) insertRow.student_number = roster.student_number;
  if (roster.course_year) insertRow.course_year = roster.course_year;

  const { data, error } = await supabase
    .from('users')
    .upsert(insertRow, { onConflict: 'id' })
    .select()
    .maybeSingle();

  if (error) {
    if (import.meta.env.DEV) console.warn('[auth] Could not upsert user profile — using auth metadata only:', error.message);
    return fallbackProfile(authUser);
  }
  return data ?? fallbackProfile(authUser);
}

const PROFILE_LOAD_MS = 18_000;

async function ensureUserProfileOrFallback(authUser: User): Promise<AppUser> {
  try {
    const raced = await Promise.race([
      ensureUserProfile(authUser),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('profile-timeout')), PROFILE_LOAD_MS)
      ),
    ]);
    if (raced) return raced;
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[auth] profile load timed out or failed:', e);
  }
  return fallbackProfile(authUser);
}

function rejectStudentIfWrongCampusEmail(profile: AppUser): boolean {
  const domains = getConfiguredStudentDomains();
  if (domains.length === 0) return false;
  if (profile.role !== 'student') return false;
  if (emailMatchesCampusDomains(profile.email, domains)) return false;
  const hint = domains.map((d) => `@${d}`).join(', ');
  sessionStorage.setItem(
    STUDENT_EMAIL_REJECT_STORAGE_KEY,
    `Students must use a campus email (${hint}). Sign in with Google using that address.`
  );
  return true;
}

const SESSION_BOOT_MS = 8_000;
/** Longer window when Google returns ?code= — PKCE exchange must finish before we treat boot as idle. */
const SESSION_BOOT_OAUTH_CALLBACK_MS = 52_000;
/** Caps a hung PKCE/token round-trip so Edge never spins forever on the login shell. */
const OAUTH_PKCE_HARD_CAP_MS = 48_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getSessionAfterOAuthWithRetries(): Promise<Session | null> {
  const gaps = [0, 140, 360, 800, 1600];
  for (let i = 0; i < gaps.length; i++) {
    if (gaps[i]) await sleep(gaps[i]);
    const { data: { session: s }, error } = await supabase.auth.getSession();
    if (error && import.meta.env.DEV) console.warn('[auth] getSession:', error.message);
    if (s?.user) return s;
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  /** Bump on sign-out or session cleared so late profile fetches cannot repopulate `user`. */
  const profileLoadGen = useRef(0);

  useEffect(() => {
    let alive = true;
    let subscription: { unsubscribe: () => void } | undefined;

    const oauthLanding =
      typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('code');

    const safetyTimer = window.setTimeout(() => {
      console.warn('[auth] Session init slow — unlocking UI.');
      setLoading(false);
    }, oauthLanding ? SESSION_BOOT_OAUTH_CALLBACK_MS : SESSION_BOOT_MS);

    function apply(next: Session | null) {
      if (!alive) return;
      window.clearTimeout(safetyTimer);
      setSession(next);
      if (next?.user) {
        profileLoadGen.current += 1;
        const gen = profileLoadGen.current;
        const fb = fallbackProfile(next.user);
        mergeProfileIntoClassRosterCache(fb);
        setUser(fb);
        void ensureUserProfileOrFallback(next.user).then(async (profile) => {
          if (!alive) return;
          if (gen !== profileLoadGen.current) return;
          if (rejectStudentIfWrongCampusEmail(profile)) {
            await supabase.auth.signOut({ scope: 'global' });
            return;
          }
          mergeProfileIntoClassRosterCache(profile);
          setUser(profile);
        });
      } else {
        profileLoadGen.current += 1;
        setUser(null);
      }
      setLoading(false);
    }

    void (async () => {
      const { data: subData } = supabase.auth.onAuthStateChange((event, next) => {
        if (event === 'INITIAL_SESSION') {
          /** Don’t flip to “logged out” while `/login?code=` is pending — avoids Edge stuck spinner. */
          if (!oauthLanding) apply(next ?? null);
          return;
        }
        if (next?.user) apply(next);
        else if (event === 'SIGNED_OUT') apply(null);
      });
      subscription = subData.subscription;

      try {
        /** Edge: bounded wait so hung token calls can’t stall boot forever */
        await Promise.race([
          exchangeOAuthCodeOnce(),
          sleep(OAUTH_PKCE_HARD_CAP_MS).then(() => null),
        ]);
      } catch (e) {
        if (import.meta.env.DEV) console.warn('[auth] PKCE exchange bootstrap error:', e);
      }

      const stored = await getSessionAfterOAuthWithRetries();

      if (oauthLanding && !stored?.user) {
        const hint = `${getOAuthRedirectTo()} must be listed under Supabase → Authentication → URL Configuration → Redirect URLs (exact match); Site URL should be ${typeof window !== 'undefined' ? window.location.origin : 'your origin'}. Enable Authentication → Providers → Google.`;
        try {
          sessionStorage.setItem(
            OAUTH_CALLBACK_ERROR_STORAGE_KEY,
            `Sign-in did not finish after Google returned (${hint})`
          );
        } catch {
          /* ignore */
        }
      }

      apply(stored ?? null);
    })();

    return () => {
      alive = false;
      window.clearTimeout(safetyTimer);
      subscription?.unsubscribe();
    };
  }, []);

  async function signOut() {
    profileLoadGen.current += 1;
    setSession(null);
    setUser(null);
    await Promise.resolve();
    try {
      sessionStorage.removeItem(STUDENT_EMAIL_REJECT_STORAGE_KEY);
      sessionStorage.removeItem(OAUTH_CALLBACK_ERROR_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    try {
      const { error } = await supabase.auth.signOut({ scope: 'global' });
      if (error && import.meta.env.DEV) console.warn('[auth] signOut:', error.message);
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[auth] signOut failed, clearing local session:', e);
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {
        /* ignore */
      }
    }
  }

  return <AuthContext.Provider value={{ session, user, loading, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

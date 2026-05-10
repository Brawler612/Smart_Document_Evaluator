import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { mergeProfileIntoClassRosterCache } from '../lib/classRosterCache';
import { exchangeOAuthCodeOnce } from '../lib/authPkceExchange';
import { supabase } from '../lib/supabase';
import { rosterFieldsFromOAuthMetadata } from '../lib/oauthRosterClaims';
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    let subscription: { unsubscribe: () => void } | undefined;

    const safetyTimer = window.setTimeout(() => {
      console.warn('[auth] Session init slow — unlocking UI.');
      setLoading(false);
    }, SESSION_BOOT_MS);

    function apply(next: Session | null) {
      window.clearTimeout(safetyTimer);
      setSession(next);
      if (next?.user) {
        const fb = fallbackProfile(next.user);
        mergeProfileIntoClassRosterCache(fb);
        setUser(fb);
        void ensureUserProfileOrFallback(next.user).then(async (profile) => {
          if (!alive) return;
          if (rejectStudentIfWrongCampusEmail(profile)) {
            await supabase.auth.signOut();
            return;
          }
          mergeProfileIntoClassRosterCache(profile);
          setUser(profile);
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    }

    void (async () => {
      await exchangeOAuthCodeOnce();

      const { data: { session: stored }, error } = await supabase.auth.getSession();
      if (error && import.meta.env.DEV) console.warn('[auth] getSession:', error.message);

      apply(stored ?? null);

      const nextSub = supabase.auth.onAuthStateChange((_event, next) => {
        apply(next ?? null);
      });
      subscription = nextSub.data.subscription;
    })();

    return () => {
      alive = false;
      window.clearTimeout(safetyTimer);
      subscription?.unsubscribe();
    };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
  }

  return <AuthContext.Provider value={{ session, user, loading, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

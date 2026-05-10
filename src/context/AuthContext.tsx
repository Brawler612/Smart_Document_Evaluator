import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { mergeProfileIntoClassRosterCache } from '../lib/classRosterCache';
import { supabase } from '../lib/supabase';
import { AppUser, UserRole } from '../types';

interface Ctx { session: Session | null; user: AppUser | null; loading: boolean; signOut: () => Promise<void>; }
const AuthContext = createContext<Ctx>({ session: null, user: null, loading: true, signOut: async () => {} });

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
  // Keep DB staff rows when env lists are empty — otherwise sign-in can downgrade teacher → student and RLS hides other submissions.
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

/** Loads or creates `public.users` row for any authenticated user. */
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

  if (existing) {
    const patch: { role?: UserRole; email?: string; full_name?: string } = {};
    if (existing.role !== roleFromConfig) patch.role = roleFromConfig;
    if (email && existing.email !== email) patch.email = email;
    if (resolvedFullName && existing.full_name !== resolvedFullName) patch.full_name = resolvedFullName;

    if (Object.keys(patch).length > 0) {
      const { data, error } = await supabase.from('users').update(patch).eq('id', existing.id).select().maybeSingle();
      if (!error && data) return data;
      if (error && import.meta.env.DEV) console.warn('[auth] Profile sync failed:', error.message);
      if (error) return { ...existing, ...patch };
    }
    return existing;
  }

  const full_name = resolvedFullName || email.split('@')[0] || 'User';

  const { data, error } = await supabase
    .from('users')
    .upsert({ id: authUser.id, email, full_name, role: roleFromConfig }, { onConflict: 'id' })
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

async function exchangeOAuthCodeIfPresent(): Promise<void> {
  try {
    const u = new URL(window.location.href);
    if (!u.searchParams.has('code')) return;
    const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
    if (error && import.meta.env.DEV) console.warn('[auth] exchangeCodeForSession:', error.message);
    if (!error) {
      window.history.replaceState({}, '', u.pathname + u.hash);
    }
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[auth] OAuth PKCE exchange:', e);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      await exchangeOAuthCodeIfPresent();
      if (cancelled) return;

      const { data: { session: s }, error } = await supabase.auth.getSession();
      if (cancelled) return;
      if (error && import.meta.env.DEV) console.warn('[auth] getSession:', error.message);
      setSession(s ?? null);
      try {
        if (s?.user) {
          const profile = await ensureUserProfileOrFallback(s.user);
          mergeProfileIntoClassRosterCache(profile);
          setUser(profile);
        } else setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        void (async () => {
          try {
            const profile = await ensureUserProfileOrFallback(s.user);
            mergeProfileIntoClassRosterCache(profile);
            setUser(profile);
          } catch (e) {
            if (import.meta.env.DEV) console.warn('[auth] ensureUserProfile:', e);
            const fb = fallbackProfile(s.user);
            mergeProfileIntoClassRosterCache(fb);
            setUser(fb);
          } finally {
            setLoading(false);
          }
        })();
      } else {
        setUser(null);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  async function signOut() { await supabase.auth.signOut(); setSession(null); setUser(null); }
  return <AuthContext.Provider value={{ session, user, loading, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }

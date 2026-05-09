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
  if (existingRole) return existingRole;
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
  const roleFromConfig = resolveRole(email, meta.role);

  const { data: existing, error: loadErr } = await fetchProfile(authUser.id);
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session: s }, error }) => {
      if (error && import.meta.env.DEV) console.warn('[auth] getSession:', error.message);
      setSession(s ?? null);
      if (s?.user) {
        try {
          const profile = await ensureUserProfile(s.user);
          if (profile) mergeProfileIntoClassRosterCache(profile);
          setUser(profile);
        } catch (e) {
          if (import.meta.env.DEV) console.warn('[auth] ensureUserProfile:', e);
          const fb = fallbackProfile(s.user);
          mergeProfileIntoClassRosterCache(fb);
          setUser(fb);
        }
      } else setUser(null);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        void (async () => {
          try {
            const profile = await ensureUserProfile(s.user);
            if (profile) mergeProfileIntoClassRosterCache(profile);
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
    return () => subscription.unsubscribe();
  }, []);

  async function signOut() { await supabase.auth.signOut(); setSession(null); setUser(null); }
  return <AuthContext.Provider value={{ session, user, loading, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }

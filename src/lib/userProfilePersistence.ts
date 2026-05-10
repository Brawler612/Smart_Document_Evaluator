import { supabase } from './supabase';
import type { AppUser, UserRole } from '../types';

function parseEmailList(value: string | undefined): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean)
  );
}

const ADMIN_EMAILS = parseEmailList(import.meta.env.VITE_ADMIN_EMAILS);
const TEACHER_EMAILS = parseEmailList(import.meta.env.VITE_TEACHER_EMAILS);

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

function profileSetupError(message: string): Error {
  return new Error(
    `Your Google profile could not be saved to Supabase, so this submission would only be local. ${message} ` +
      'Run `docs/supabase-setup-all-in-one.sql` in Supabase SQL Editor, refresh the app, then submit again.'
  );
}

export async function ensureAppUserProfile(user: Pick<AppUser, 'id' | 'email' | 'full_name' | 'role'>): Promise<void> {
  const email = user.email.trim();
  if (!user.id || !email) {
    throw profileSetupError('The signed-in account is missing an id or email.');
  }

  const { error } = await supabase.from('users').upsert(
    {
      id: user.id,
      email,
      full_name: user.full_name.trim() || email.split('@')[0] || 'User',
      role: resolveRole(email, user.role, user.role),
    },
    { onConflict: 'id' }
  );

  if (error) throw profileSetupError(error.message);
}

export async function ensureCurrentAuthUserProfile(expectedUserId?: string): Promise<void> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw profileSetupError(error.message);
  const authUser = data.user;
  if (!authUser) throw profileSetupError('No active Google session was found.');
  if (expectedUserId && authUser.id !== expectedUserId) {
    throw profileSetupError('The active Google session does not match the submission owner.');
  }

  const email = (authUser.email ?? '').trim();
  if (!email) throw profileSetupError('The active Google account has no email address.');

  const meta = authUser.user_metadata ?? {};
  const fullName =
    (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
    (typeof meta.name === 'string' && meta.name.trim()) ||
    email.split('@')[0] ||
    'User';

  const { error: upsertError } = await supabase.from('users').upsert(
    {
      id: authUser.id,
      email,
      full_name: fullName,
      role: resolveRole(email, meta.role),
    },
    { onConflict: 'id' }
  );

  if (upsertError) throw profileSetupError(upsertError.message);
}

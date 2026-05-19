import { supabase } from './supabase';
import { resolveAppRole } from './staffAccess';
import type { AppUser } from '../types';

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
      role: resolveAppRole(email),
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
      role: resolveAppRole(email),
    },
    { onConflict: 'id' }
  );

  if (upsertError) throw profileSetupError(upsertError.message);
}

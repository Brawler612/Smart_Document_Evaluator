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
import { isInvitedStudent, getInvitedStudentRosterEntry } from '../data/invitedStudentEmails';
import { resolveAppRole } from '../lib/staffAccess';
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

async function fetchProfile(id: string): Promise<{ data: AppUser | null; error: string | null }> {
  const { data, error } = await supabase.from('users').select('*').eq('id', id).maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

/** Pull the most likely profile-picture URL out of any OAuth metadata blob (deep keys + identities). */
function extractAvatarUrl(...sources: Array<Record<string, unknown> | null | undefined>): string | null {
  const keys = ['picture', 'avatar_url', 'photoURL', 'photo', 'profile_picture', 'profilePicture'];
  const seen = new Set<Record<string, unknown>>();
  const queue: Array<Record<string, unknown>> = [];
  for (const src of sources) {
    if (src && typeof src === 'object') queue.push(src);
  }
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const k of keys) {
      const v = node[k];
      if (typeof v === 'string' && /^https?:\/\//i.test(v.trim())) return v.trim();
    }
    /** Walk one level deep into nested OAuth blobs (e.g. `identities[].identity_data`, `app_metadata.providers`). */
    for (const v of Object.values(node)) {
      if (Array.isArray(v)) {
        for (const entry of v) {
          if (entry && typeof entry === 'object') queue.push(entry as Record<string, unknown>);
        }
      } else if (v && typeof v === 'object') {
        queue.push(v as Record<string, unknown>);
      }
    }
  }
  return null;
}

/** Build the full search space (`user_metadata` + `app_metadata` + each identity row) for picture lookup. */
function gatherAvatarSources(authUser: User): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const meta = (authUser.user_metadata ?? {}) as Record<string, unknown>;
  const app = ((authUser as unknown as { app_metadata?: Record<string, unknown> }).app_metadata ?? {}) as Record<string, unknown>;
  out.push(meta);
  out.push(app);
  const ids = (authUser as unknown as { identities?: Array<Record<string, unknown>> }).identities;
  if (Array.isArray(ids)) {
    for (const id of ids) {
      if (id && typeof id === 'object') out.push(id);
    }
  }
  return out;
}

function fallbackProfile(authUser: User): AppUser {
  const email = authUser.email ?? '';
  const meta = authUser.user_metadata ?? {};
  const rosterEntry = getInvitedStudentRosterEntry(email);
  const officialRosterName = rosterEntry
    ? `${rosterEntry.firstName} ${rosterEntry.lastName}`.trim()
    : '';
  const officialRosterSchoolId = rosterEntry?.studentSchoolId?.trim() ?? '';
  const full_name =
    officialRosterName ||
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    email.split('@')[0] ||
    'User';
  const role = resolveAppRole(email);
  const avatar_url = extractAvatarUrl(...gatherAvatarSources(authUser));
  if (import.meta.env.DEV && !avatar_url) {
    console.warn('[auth] No profile picture found in OAuth metadata for', email, '— user_metadata keys:', Object.keys(meta));
  }
  return {
    id: authUser.id,
    email,
    full_name,
    role,
    created_at: new Date().toISOString(),
    avatar_url,
    ...(officialRosterSchoolId ? { student_number: officialRosterSchoolId } : {}),
  };
}

async function ensureUserProfile(authUser: User): Promise<AppUser | null> {
  const email = authUser.email ?? '';
  if (!email) return fallbackProfile(authUser);

  const meta = authUser.user_metadata ?? {};

  const { data: existing, error: loadErr } = await fetchProfile(authUser.id);
  const roleFromConfig = resolveAppRole(email);
  if (loadErr && import.meta.env.DEV) {
    console.warn(
      '[auth] public.users load failed (often RLS/policy). Run docs/supabase-fix-users-rls-recursion.sql —',
      loadErr
    );
  }

  /**
   * The IT332 / CS342 class roster is the authoritative source for student display
   * names. If this signing-in account is an invited student, we PIN their full_name
   * to the official `firstName lastName` from `it332Sem2ClassRoster.ts` and never
   * let the Google profile name (which may be a nickname, alias, or anime handle)
   * overwrite it on subsequent sign-ins. For teachers / admins / other users, we
   * keep the existing Google-profile-name behaviour.
   */
  const officialRosterEntry = getInvitedStudentRosterEntry(email);
  const officialRosterName = officialRosterEntry
    ? `${officialRosterEntry.firstName} ${officialRosterEntry.lastName}`.trim()
    : '';
  const officialRosterSchoolId = officialRosterEntry?.studentSchoolId?.trim() ?? '';

  const resolvedFullName =
    officialRosterName ||
    (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
    (typeof meta.name === 'string' && meta.name.trim()) ||
    (email ? email.split('@')[0] : '');

  const roster = rosterFieldsFromOAuthMetadata(meta as Record<string, unknown>);
  const avatar_url = extractAvatarUrl(...gatherAvatarSources(authUser));
  const resolvedRosterStudentNumber = officialRosterSchoolId || roster.student_number;

  if (existing) {
    const patch: {
      role?: UserRole;
      email?: string;
      full_name?: string;
      student_number?: string | null;
      course_year?: string | null;
      avatar_url?: string | null;
    } = {};
    if (existing.role !== roleFromConfig) patch.role = roleFromConfig;
    if (email && existing.email !== email) patch.email = email;
    if (resolvedFullName && existing.full_name !== resolvedFullName) patch.full_name = resolvedFullName;
    if (resolvedRosterStudentNumber && resolvedRosterStudentNumber !== existing.student_number) {
      patch.student_number = resolvedRosterStudentNumber;
    }
    if (roster.course_year && roster.course_year !== existing.course_year) {
      patch.course_year = roster.course_year;
    }
    if (avatar_url && existing.avatar_url !== avatar_url) patch.avatar_url = avatar_url;

    if (Object.keys(patch).length > 0) {
      const { data, error } = await supabase.from('users').update(patch).eq('id', existing.id).select().maybeSingle();
      if (!error && data) return { ...data, avatar_url: data.avatar_url ?? avatar_url ?? existing.avatar_url ?? null };
      /** Likely cause if this fails on `avatar_url`: column is missing — retry without it so older DBs still sync the rest. */
      if (error && /avatar_url/i.test(error.message ?? '')) {
        const { avatar_url: _ignored, ...rest } = patch;
        void _ignored;
        if (Object.keys(rest).length > 0) {
          const retry = await supabase.from('users').update(rest).eq('id', existing.id).select().maybeSingle();
          if (!retry.error && retry.data) return { ...retry.data, avatar_url };
        }
        return { ...existing, ...patch, avatar_url };
      }
      if (error && import.meta.env.DEV) console.warn('[auth] Profile sync failed:', error.message);
      if (error) return { ...existing, ...patch };
    }
    return { ...existing, avatar_url: existing.avatar_url ?? avatar_url ?? null };
  }

  const full_name = resolvedFullName || email.split('@')[0] || 'User';

  const insertRow: Record<string, unknown> = {
    id: authUser.id,
    email,
    full_name,
    role: roleFromConfig,
  };
  if (resolvedRosterStudentNumber) insertRow.student_number = resolvedRosterStudentNumber;
  if (roster.course_year) insertRow.course_year = roster.course_year;
  if (avatar_url) insertRow.avatar_url = avatar_url;

  const { data, error } = await supabase
    .from('users')
    .upsert(insertRow, { onConflict: 'id' })
    .select()
    .maybeSingle();

  if (error) {
    /** Retry once without avatar_url so legacy schemas without the column still create the profile. */
    if (/avatar_url/i.test(error.message ?? '')) {
      const { avatar_url: _drop, ...rest } = insertRow as Record<string, unknown>;
      void _drop;
      const retry = await supabase.from('users').upsert(rest, { onConflict: 'id' }).select().maybeSingle();
      if (!retry.error && retry.data) return { ...retry.data, avatar_url };
    }
    if (import.meta.env.DEV) console.warn('[auth] Could not upsert user profile — using auth metadata only:', error.message);
    return fallbackProfile(authUser);
  }
  return data ? { ...data, avatar_url: data.avatar_url ?? avatar_url ?? null } : fallbackProfile(authUser);
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

/**
 * Student sign-in is limited to IT332 / CS342 students whose Gmail appears on the
 * official course class list (`INVITED_STUDENT_GMAILS`). Teachers and admins
 * Staff (sole instructor Gmail) are always allowed; everyone else must be on the class list.
 */
function rejectIfNotInvitedStudent(profile: AppUser): boolean {
  if (profile.role !== 'student') return false;
  if (isInvitedStudent(profile.email)) return false;
  sessionStorage.setItem(
    STUDENT_EMAIL_REJECT_STORAGE_KEY,
    'Smart Docs is for IT332 / CS342 students on the official class list only. This Google account is not on that list, ' +
      'so you cannot open the class roster and course tools here. Sign in with the Gmail your instructor has on the ' +
      'course roster, or contact your instructor or the Smart Docs team if your email should be updated.'
  );
  return true;
}

const SESSION_BOOT_MS = 8_000;
/** OAuth return: unlock login UI if PKCE/profile boot stalls. */
const SESSION_BOOT_OAUTH_CALLBACK_MS = 16_000;
const OAUTH_PKCE_HARD_CAP_MS = 12_000;

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
  /**
   * Auth `user.id` after campus + class-list gates succeeded. Used so duplicate
   * `SIGNED_IN` / `USER_UPDATED` events (e.g. tab refocus, token sync) do not call
   * `setUser(null)` again — that was remounting the whole app shell ("Verifying access")
   * and resetting scroll on /class-list and other routes.
   */
  const hydratedAuthUserIdRef = useRef<string | null>(null);

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
        const authId = next.user.id;
        if (hydratedAuthUserIdRef.current === authId) {
          /** Same account already passed gates — keep UI mounted; only rotate session. */
          setLoading(false);
          return;
        }
        profileLoadGen.current += 1;
        const gen = profileLoadGen.current;
        /** Do not set `user` until campus + class-list gates pass — avoids flashing the app shell to unauthorized accounts. */
        setUser(null);
        setLoading(true);
        void ensureUserProfileOrFallback(next.user)
          .then(async (profile) => {
            if (!alive) return;
            if (gen !== profileLoadGen.current) return;
            if (rejectStudentIfWrongCampusEmail(profile)) {
              hydratedAuthUserIdRef.current = null;
              await supabase.auth.signOut({ scope: 'global' });
              return;
            }
            if (rejectIfNotInvitedStudent(profile)) {
              hydratedAuthUserIdRef.current = null;
              await supabase.auth.signOut({ scope: 'global' });
              return;
            }
            mergeProfileIntoClassRosterCache(profile);
            hydratedAuthUserIdRef.current = profile.id;
            setUser(profile);
          })
          .catch((e) => {
            if (import.meta.env.DEV) console.warn('[auth] profile gate failed:', e);
            if (!alive || gen !== profileLoadGen.current) return;
            const fallback = fallbackProfile(next.user);
            hydratedAuthUserIdRef.current = fallback.id;
            setUser(fallback);
          })
          .finally(() => {
            if (alive && gen === profileLoadGen.current) setLoading(false);
          });
      } else {
        profileLoadGen.current += 1;
        hydratedAuthUserIdRef.current = null;
        setUser(null);
        setLoading(false);
      }
    }

    void (async () => {
      const { data: subData } = supabase.auth.onAuthStateChange((event, next) => {
        if (event === 'INITIAL_SESSION') {
          /** If Supabase already has a session (e.g. after PKCE), apply it even on `/login?code=`. */
          if (!oauthLanding || next?.user) apply(next ?? null);
          return;
        }
        if (event === 'SIGNED_OUT') {
          apply(null);
          return;
        }
        if (event === 'TOKEN_REFRESHED' && next) {
          /** Refresh must not clear `user` or re-run roster gates — that would flash the access gate. */
          if (!alive) return;
          setSession(next);
          return;
        }
        if (event === 'USER_UPDATED' && next?.user) {
          /** Metadata sync — must not clear `user` or the SPA remounts and scroll resets. */
          if (!alive) return;
          window.clearTimeout(safetyTimer);
          setSession(next);
          return;
        }
        if (event === 'SIGNED_IN' && next?.user) {
          apply(next);
        }
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
        const redirect = getOAuthRedirectTo();
        const portNote =
          import.meta.env.DEV &&
          typeof window !== 'undefined' &&
          window.location.port &&
          window.location.port !== '5173'
            ? ' Use http://localhost:5173/login (stop extra dev servers on 5174/5175).'
            : '';
        try {
          sessionStorage.setItem(
            OAUTH_CALLBACK_ERROR_STORAGE_KEY,
            `Sign-in did not finish after Google returned.${portNote} Add Redirect URL exactly: ${redirect} in Supabase → Authentication → URL Configuration. Enable Google provider. Add your Gmail under Google Cloud → Audience → Test users.`
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
    hydratedAuthUserIdRef.current = null;
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

import { useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  GraduationCap,
  Mail,
  Calendar,
  ChevronRight,
  RefreshCw,
  Users,
} from 'lucide-react';
import { getClassRosterCacheStudents, mergeStudentRosterPreferDb } from '../../lib/classRosterCache';
import { supabase, getSupabaseProjectHost } from '../../lib/supabase';
import { isUsersTableMissingError } from '../../lib/supabaseUsersSetupHint';
import type { AppUser } from '../../types';

function initials(name: string, fallback: string): string {
  const src = name.trim() || fallback.trim();
  const p = src.split(/\s+/).filter(Boolean);
  if (p.length >= 2) return (p[0][0] + p[p.length - 1][0]).toUpperCase().slice(0, 2);
  if (p.length === 1 && p[0].length >= 2) return p[0].slice(0, 2).toUpperCase();
  return src.slice(0, 1).toUpperCase() || '?';
}

export default function UserManagement() {
  const [students, setStudents] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [usersTableMissing, setUsersTableMissing] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setUsersTableMissing(false);

    const cachedStudents = getClassRosterCacheStudents();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('role', 'student')
      .order('full_name', { ascending: true });

    if (error) {
      const missingTbl = isUsersTableMissingError(error.message);
      setUsersTableMissing(missingTbl);
      setLoadError(error.message);
      setStudents(mergeStudentRosterPreferDb([], cachedStudents));
    } else {
      setLoadError(null);
      setStudents(mergeStudentRosterPreferDb((data ?? []) as AppUser[], cachedStudents));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((u) => {
      const name = (u.full_name || '').toLowerCase();
      const mail = (u.email || '').toLowerCase();
      return !q || name.includes(q) || mail.includes(q);
    });
  }, [students, search]);

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-100/95 via-[#faf8f8] to-slate-100/85">
      <div className="p-6 md:p-8 max-w-5xl mx-auto pb-16">
        <header className="mb-10">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div>
              <p className="text-xs font-semibold tracking-[0.14em] uppercase text-[#84001B]">Directory</p>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mt-1.5 tracking-tight flex items-center gap-3">
                <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-[#84001B] text-[#ffd21a] shrink-0 shadow-lg shadow-[#84001B]/20">
                  <Users className="w-[22px] h-[22px]" aria-hidden />
                </span>
                Class list
              </h1>
              <p className="text-slate-600 text-sm mt-2 max-w-xl leading-relaxed">
                Student accounts only. Search by name or email and cross-check uploads from the submission roster.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Sync
              </button>
              <Link
                to="/inbox"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Inbox
                <ChevronRight className="w-3.5 h-3.5 opacity-70" />
              </Link>
              <Link
                to="/student-submissions"
                className="inline-flex items-center gap-2 rounded-xl bg-[#84001B] px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-[#84001B]/20 hover:bg-[#6b0016]"
              >
                Submission roster
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </header>

        {usersTableMissing && students.length > 0 && (
          <div
            className="mb-6 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950 shadow-sm"
            role="status"
          >
            <p className="font-semibold">Showing students saved on this device</p>
            <p className="mt-1 text-xs text-sky-900/90">
              The database table is still missing from the API, but accounts that signed in with Google on{' '}
              <span className="font-medium">this browser</span> are cached here. Run the SQL below on the matching
              Supabase project for a full class list.
            </p>
          </div>
        )}

        {loadError && (
          <div
            className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm"
            role="alert"
          >
            <p className="font-semibold">Could not load the class list from Supabase</p>
            <p className="mt-1 text-amber-900/90">{loadError}</p>
            <p className="mt-2 text-xs font-medium text-amber-950/90">
              App is using project host:{' '}
              <code className="rounded bg-amber-100/90 px-1.5 py-0.5">{getSupabaseProjectHost()}</code>
              <span className="font-normal text-amber-900/80">
                {' '}
                — open this exact project in the Supabase dashboard when you run the SQL.
              </span>
            </p>
            {isUsersTableMissingError(loadError) ? (
              <ol className="mt-3 list-decimal list-inside space-y-2 text-xs text-amber-900/85">
                <li>
                  Open Supabase Dashboard for <span className="font-medium">that</span> project →{' '}
                  <span className="font-medium">SQL Editor</span> → New query.
                </li>
                <li>
                  Paste and run <span className="font-medium">the entire file</span>{' '}
                  <code className="rounded bg-amber-100/80 px-1">docs/supabase-bootstrap-public-users.sql</code>
                  . It creates the table, RLS, grants, and runs{' '}
                  <code className="rounded bg-amber-100/80 px-1">NOTIFY pgrst, &apos;reload schema&apos;</code> (needed
                  on PostgREST v14+).
                </li>
                <li>
                  Wait ~10 seconds, then click <span className="font-medium">Sync</span> here. If it still errors, run only:{' '}
                  <code className="rounded bg-amber-100/80 px-1">notify pgrst, &apos;reload schema&apos;;</code>
                </li>
                <li>
                  Sign out and sign back in with Google once so your row is written to{' '}
                  <code className="rounded bg-amber-100/80 px-1">public.users</code>.
                </li>
              </ol>
            ) : (
              <p className="mt-2 text-xs text-amber-900/75">
                If students already use Google sign-in but you still see no rows, confirm RLS from{' '}
                <code className="rounded bg-amber-100/80 px-1">docs/supabase-bootstrap-public-users.sql</code> or{' '}
                <code className="rounded bg-amber-100/80 px-1">docs/supabase-rls-teacher-read-students.sql</code>{' '}
                so staff can read <code className="rounded bg-amber-100/80 px-1">role = &apos;student&apos;</code> profiles.
              </p>
            )}
          </div>
        )}

        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Overview</h2>
          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 md:p-7 shadow-sm border-l-[4px] border-l-[#ffd21a] flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-[#ffd21a] text-[#84001B] flex items-center justify-center shrink-0 shadow-inner">
              <GraduationCap className="w-8 h-8" aria-hidden />
            </div>
            <div>
              <p className="text-4xl font-bold text-slate-900 tabular-nums leading-none">
                {loading ? '—' : students.length}
              </p>
              <p className="text-sm font-semibold text-slate-800 mt-2">Students enrolled</p>
              <p className="text-xs text-slate-500 mt-1">
                Rows with role <span className="font-medium text-[#84001B]">student</span> in your workspace
                {usersTableMissing && (
                  <span className="block mt-1 text-amber-800/90">
                    API reports the <code className="text-[11px]">users</code> table is missing — count may reflect this
                    browser&apos;s offline cache only.
                  </span>
                )}
              </p>
            </div>
          </div>
        </section>

        <div className="rounded-2xl border border-slate-200/90 bg-white/80 backdrop-blur-sm shadow-sm p-4 sm:p-5 mb-6">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search students by name or email…"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B]/40 bg-white"
              disabled={loading}
            />
          </div>
          {!loading && students.length > 0 && (
            <p className="text-[11px] text-slate-500 mt-3">
              Showing{' '}
              <span className="font-semibold text-slate-700 tabular-nums">{filtered.length}</span> of{' '}
              <span className="tabular-nums">{students.length}</span> student{students.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-[60px] rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : students.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-6 py-16 text-center">
            <GraduationCap className="w-14 h-14 text-slate-200 mx-auto mb-4" aria-hidden />
            <p className="text-lg font-semibold text-slate-800">No students yet</p>
            <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
              {usersTableMissing ? (
                <>
                  Fix the yellow alert above first (create <code className="text-xs bg-slate-100 px-1 rounded">public.users</code> on{' '}
                  <span className="font-medium text-slate-700">{getSupabaseProjectHost()}</span>). Until then, only Google
                  sign-ins on <span className="font-medium text-slate-700">this same browser</span> are remembered offline.
                </>
              ) : (
                <>
                  When someone signs in with Google, the app saves their Gmail and name to{' '}
                  <code className="text-xs bg-slate-100 px-1 rounded">public.users</code> as role{' '}
                  <span className="font-medium text-slate-700">student</span> (unless they are listed as a teacher in your
                  env). They appear here after that—use <span className="font-medium text-slate-700">Sync</span> or return to
                  this tab to refresh.
                </>
              )}
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 mt-6 text-xs font-semibold text-[#84001B] hover:underline"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Try syncing again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
            <Search className="w-10 h-10 text-slate-200 mx-auto mb-3" aria-hidden />
            <p className="text-sm font-semibold text-slate-800">No matches</p>
            <p className="text-xs text-slate-500 mt-1">Try a shorter search or clear the field.</p>
            <button
              type="button"
              onClick={() => setSearch('')}
              className="mt-5 text-xs font-semibold text-[#84001B] hover:underline"
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
            <div className="hidden md:grid grid-cols-12 gap-3 px-5 py-3 border-b border-slate-100 bg-slate-50/80 text-[11px] font-bold text-slate-500 uppercase tracking-wide">
              <div className="col-span-5">Student</div>
              <div className="col-span-6">Email</div>
              <div className="col-span-1 text-right pr-1">Joined</div>
            </div>
            <ul className="divide-y divide-slate-100 max-h-[min(560px,65vh)] overflow-y-auto">
              {filtered.map((u) => (
                <li key={u.id}>
                  <div className="grid md:grid-cols-12 gap-2 md:gap-3 items-center px-4 md:px-5 py-3.5 hover:bg-red-50/40 transition-colors">
                    <div className="md:col-span-5 flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-[11px] font-bold bg-gradient-to-br from-[#ffd21a] to-[#f5c400] text-[#84001B]">
                        {initials(u.full_name, u.email)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 text-sm truncate">
                          {u.full_name?.trim() || 'Unnamed'}
                        </p>
                        <p className="text-[11px] text-slate-400 md:hidden truncate">{u.email}</p>
                      </div>
                    </div>
                    <div className="md:col-span-6 hidden md:flex items-center gap-2 text-sm text-slate-600 min-w-0">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden />
                      <span className="truncate">{u.email || '—'}</span>
                    </div>
                    <div className="md:col-span-1 flex items-center md:justify-end gap-1.5 text-[11px] text-slate-500 tabular-nums">
                      <Calendar className="w-3.5 h-3.5 text-slate-300 hidden md:block" aria-hidden />
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

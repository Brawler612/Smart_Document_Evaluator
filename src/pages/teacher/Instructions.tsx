import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Inbox,
  RefreshCw,
  Users,
  Mail,
  GraduationCap,
} from 'lucide-react';
import {
  TeacherWorkspaceShell,
  TeacherPageHeader,
  TeacherSearchSurface,
  TeacherAmberCue,
  teacherMaroonTheadClasses,
  teacherRoundedTableShell,
} from '../../components/teacher/TeacherWorkspaceChrome';
import { syncAllLocalSubmissionsToSupabase } from '../../lib/localSubmissionSync';
import { fetchTeacherSubmissionRows, type TeacherSubmission } from '../../lib/teacherSubmissionLoad';
import { studentSubmissionsLinkForSubmission } from '../../lib/gradingRoutes';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import type { AppUser } from '../../types';

const ATTENTION: Array<TeacherSubmission['status']> = ['submitted', 'under_review', 'resubmit'];

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const m = Math.round((Date.now() - then) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 14) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function statusLabel(s: TeacherSubmission['status']): string {
  if (s === 'under_review') return 'In review';
  if (s === 'resubmit') return 'Resubmit';
  return 'New';
}

function statusStyles(s: TeacherSubmission['status']): string {
  if (s === 'submitted') return 'bg-rose-100 text-[#84001B] border border-rose-200/80';
  if (s === 'under_review') return 'bg-[#ffd21a]/20 text-[#5c0014] border border-[#ffd21a]/40';
  return 'bg-red-50 text-red-800 border border-red-100';
}

function studentInitials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length >= 2) return (p[0][0] + p[p.length - 1][0]).toUpperCase().slice(0, 2);
  if (p.length === 1 && p[0].length >= 2) return p[0].slice(0, 2).toUpperCase();
  return p[0]?.[0]?.toUpperCase() ?? '?';
}

export default function Instructions() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TeacherSubmission[]>([]);
  const [students, setStudents] = useState<AppUser[]>([]);
  const [classLoading, setClassLoading] = useState(true);
  const [rosterSearch, setRosterSearch] = useState('');

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      await syncAllLocalSubmissionsToSupabase();
      const all = await fetchTeacherSubmissionRows();
      setRows(all.filter((r) => ATTENTION.includes(r.status)));
    } catch (e) {
      console.error('[inbox]', e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!user?.id) return;
    void (async () => {
      setClassLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'student')
        .order('full_name', { ascending: true });
      if (!error && data) setStudents(data as AppUser[]);
      else setStudents([]);
      setClassLoading(false);
    })();
  }, [user?.id]);

  const filteredStudents = useMemo(() => {
    const q = rosterSearch.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        (s.full_name || '').toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q)
    );
  }, [students, rosterSearch]);

  const counts = {
    submitted: rows.filter((r) => r.status === 'submitted').length,
    under_review: rows.filter((r) => r.status === 'under_review').length,
    resubmit: rows.filter((r) => r.status === 'resubmit').length,
  };

  const preview = [...rows].sort(
    (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
  ).slice(0, 14);

  return (
    <TeacherWorkspaceShell>
      <TeacherPageHeader
        eyebrow="Inbox · Teacher workspace"
        title="Needs attention"
        icon={Inbox}
        description={
          <>
            Narrow feed of submissions that still need eyes—mirrors signals from{' '}
            <Link className="font-semibold text-[#84001B] hover:underline" to="/class-list">
              Class list
            </Link>
            , Submission roster, and Grading workspace. Refresh after class list &quot;Sync&quot; for freshest counts.
          </>
        }
        actions={
          <>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <Link
              to="/class-list"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Class list
              <ChevronRight className="w-3.5 h-3.5 opacity-70" />
            </Link>
            <Link
              to="/grading"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Grading
              <ChevronRight className="w-3.5 h-3.5 opacity-70" />
            </Link>
            <Link
              to="/student-submissions"
              className="inline-flex items-center gap-2 rounded-xl bg-[#84001B] px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-[#84001B]/20 hover:bg-[#6b0016]"
            >
              Full roster
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </>
        }
      />

        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Overview</h2>
          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 md:p-7 shadow-sm border-l-[4px] border-l-[#ffd21a] flex flex-col sm:flex-row sm:items-center gap-5 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-[#ffd21a] text-[#84001B] flex items-center justify-center shrink-0 shadow-inner">
              <Bell className="w-7 h-7" aria-hidden />
            </div>
            <div>
              <p className="text-4xl font-bold text-slate-900 tabular-nums leading-none">
                {loading ? '—' : counts.submitted + counts.under_review + counts.resubmit}
              </p>
              <p className="text-sm font-semibold text-slate-800 mt-2">Items needing attention</p>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                New <span className="font-semibold text-slate-700">{loading ? '—' : counts.submitted}</span> · In review{' '}
                <span className="font-semibold text-slate-700">{loading ? '—' : counts.under_review}</span> · Resubmit{' '}
                <span className="font-semibold text-slate-700">{loading ? '—' : counts.resubmit}</span>
              </p>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <InboxStat
            title="New"
            subtitle="Needs first look"
            value={counts.submitted}
            icon={<Bell className="w-5 h-5 text-[#84001B]" />}
            accent="border-[#84001B]/15 bg-[#84001B]/10"
          />
          <InboxStat
            title="In review"
            subtitle="You're grading"
            value={counts.under_review}
            icon={<CheckCircle2 className="w-5 h-5 text-[#b8860b]" />}
            accent="border-[#ffd21a]/35 bg-[#ffd21a]/10"
          />
          <InboxStat
            title="Resubmit"
            subtitle="Awaiting student"
            value={counts.resubmit}
            icon={<AlertTriangle className="w-5 h-5 text-red-700" />}
            accent="border-red-100 bg-red-50/60"
          />
        </div>

        <section className={teacherRoundedTableShell}>
          <TeacherAmberCue title="Open items">
            Same statuses you filter on{' '}
            <Link className="font-semibold text-amber-950 underline-offset-2 hover:underline" to="/student-submissions">
              Submission roster
            </Link>{' '}
            and Grading workspace. Tap <span className="font-semibold">Review</span> to open the roster scrolled to that
            upload (then use the learner link or Grading workspace to score). Scroll sideways on narrow screens.
          </TeacherAmberCue>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-3.5 border-b border-slate-100 bg-white">
            <h2 className="font-semibold text-slate-900 text-sm md:text-base">Latest in queue</h2>
            <Link
              to="/grading"
              className="text-xs font-semibold text-[#84001B] hover:underline inline-flex items-center gap-1 rounded-lg border border-[#84001B]/25 px-2.5 py-1 hover:bg-[#84001B]/5"
            >
              Open grading workspace
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="p-4 md:p-5 bg-slate-50/40">
            {loading ? (
              <div className="space-y-2">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-[52px] rounded-xl bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : preview.length === 0 ? (
              <div className="text-center px-4 py-14 rounded-xl border border-dashed border-slate-200 bg-slate-50/70">
                <div className="w-12 h-12 rounded-2xl bg-[#ffd21a]/25 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-6 h-6 text-[#84001B]" aria-hidden />
                </div>
                <p className="text-sm font-semibold text-slate-900">You&apos;re all caught up</p>
                <p className="text-xs text-slate-500 mt-1.5 max-w-xs mx-auto">
                  No open submissions right now. The roster updates as soon as learners upload files.
                </p>
                <Link
                  to="/reports"
                  className="inline-flex items-center gap-1.5 mt-5 text-xs font-semibold text-[#84001B] hover:underline"
                >
                  View reports snapshot
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white shadow-sm">
                <table className="w-full text-sm text-left min-w-[720px]">
                  <thead>
                    <tr className={teacherMaroonTheadClasses}>
                      <th className="px-4 py-3 font-semibold">File</th>
                      <th className="px-4 py-3 font-semibold">Learner</th>
                      <th className="px-4 py-3 font-semibold">Assignment</th>
                      <th className="px-4 py-3 font-semibold whitespace-nowrap">Submitted</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.map((item) => (
                      <tr key={item.id} className="bg-white hover:bg-[#fff8f9]/90">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#84001B] to-[#5c0014] flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                              {(item.file_name || '?').slice(0, 1).toUpperCase()}
                            </div>
                            <span className="font-semibold text-slate-900 truncate">{item.file_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-700 truncate max-w-[160px]">
                          {item.users?.full_name || 'Learner'}
                        </td>
                        <td className="px-4 py-3 text-slate-600 truncate max-w-[180px]">
                          {item.assignments?.title || '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">{relativeTime(item.submitted_at)}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-[11px] px-2.5 py-1 rounded-full font-semibold capitalize inline-block ${statusStyles(item.status)}`}
                          >
                            {statusLabel(item.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            to={studentSubmissionsLinkForSubmission(item.id)}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#84001B] text-white text-xs font-semibold px-3 py-2 hover:bg-[#6b0016] shadow-sm"
                          >
                            Review
                            <ChevronRight className="w-3.5 h-3.5 opacity-90" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section className={`mt-10 ${teacherRoundedTableShell}`}>
          <TeacherAmberCue title="Quick roster">
            Students from Supabase <code className="text-[11px] bg-amber-100/60 px-1 rounded">users</code>. Open{' '}
            <span className="font-semibold">Full class list</span> for Remove / Delete actions and full directory columns.
          </TeacherAmberCue>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-3.5 border-b border-slate-100 bg-white">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#ffd21a]/90 flex items-center justify-center shrink-0 shadow-sm">
                <GraduationCap className="w-5 h-5 text-[#84001B]" aria-hidden />
              </div>
              <div className="min-w-0">
                <h2 className="font-semibold text-slate-900 text-sm md:text-base">Class roster snippet</h2>
                <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                  {classLoading ? 'Loading…' : `${students.length} on file`}
                </p>
              </div>
            </div>
            <Link
              to="/class-list"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-[#84001B] text-xs font-semibold px-3.5 py-2 shadow-sm hover:bg-[#fff8f9] shrink-0 self-start sm:self-center"
            >
              <Users className="w-3.5 h-3.5" />
              Full class list
              <ChevronRight className="w-3.5 h-3.5 opacity-90" />
            </Link>
          </div>

          <div className="p-4 md:p-5">
            <TeacherSearchSurface
              value={rosterSearch}
              onChange={setRosterSearch}
              placeholder="Search by name or email…"
              disabled={classLoading || students.length === 0}
              footer={
                !classLoading && students.length > 0 ? (
                  <p className="text-[11px] text-slate-500 mt-3">
                    Showing <span className="font-semibold text-slate-700">{filteredStudents.length}</span> of{' '}
                    {students.length} student{students.length !== 1 ? 's' : ''}
                    {rosterSearch.trim() ? ` matching “${rosterSearch.trim()}”` : ''}
                  </p>
                ) : null
              }
            />

            {classLoading ? (
              <div className="space-y-2 max-h-[min(340px,50vh)] overflow-hidden mt-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-[52px] rounded-xl bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : students.length === 0 ? (
              <div className="text-center py-10 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 mt-2">
                <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" aria-hidden />
                <p className="text-sm font-medium text-slate-700">No students yet</p>
                <p className="text-xs text-slate-500 mt-1 max-w-[280px] mx-auto">
                  When learner accounts appear in Supabase with role &quot;student&quot;, they show up here automatically.
                </p>
              </div>
            ) : filteredStudents.length === 0 ? (
              <p className="text-sm text-center text-slate-500 py-8">No names match &quot;{rosterSearch.trim()}&quot;.</p>
            ) : (
              <div className="overflow-x-auto max-h-[min(340px,50vh)] overflow-y-auto rounded-xl border border-slate-100 bg-white mt-2">
                <table className="w-full text-sm text-left min-w-[440px]">
                  <thead className="sticky top-0 z-[1]">
                    <tr className={teacherMaroonTheadClasses}>
                      <th className="px-4 py-3 font-semibold">Student</th>
                      <th className="px-4 py-3 font-semibold">Email</th>
                      <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">Role</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStudents.map((s) => (
                      <tr key={s.id} className="bg-white hover:bg-[#fff8f9]/90">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#ffd21a] to-[#f5c400] text-[#84001B] flex items-center justify-center text-[10px] font-bold shrink-0 shadow-sm"
                              aria-hidden
                            >
                              {studentInitials(s.full_name || s.email)}
                            </div>
                            <span className="font-semibold text-slate-900 truncate">{s.full_name || 'Unnamed'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 truncate max-w-[220px]">
                          <span className="inline-flex items-center gap-1.5 min-w-0">
                            <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden />
                            <span className="truncate">{s.email || '—'}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-[#84001B] bg-[#ffd21a]/30 border border-[#ffd21a]/40 rounded-full px-2 py-0.5 inline-block">
                            Student
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
    </TeacherWorkspaceShell>
  );
}

function InboxStat({
  title,
  subtitle,
  value,
  icon,
  accent,
}: {
  title: string;
  subtitle: string;
  value: number;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <div className={`rounded-2xl border p-5 bg-white shadow-sm ${accent}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="w-11 h-11 rounded-xl bg-white/90 flex items-center justify-center border border-black/[0.04] shadow-sm">
          {icon}
        </div>
      </div>
      <p className="text-3xl font-bold text-slate-900 tabular-nums leading-none">{value}</p>
      <p className="text-sm font-semibold text-slate-800 mt-2">{title}</p>
      <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
    </div>
  );
}

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Inbox,
  RefreshCw,
  Search,
  Users,
  Mail,
  GraduationCap,
} from 'lucide-react';
import { fetchTeacherSubmissionRows, type TeacherSubmission } from '../../lib/teacherSubmissionLoad';
import { gradingLinkForSubmission } from '../../lib/gradingRoutes';
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
    <div className="min-h-full bg-gradient-to-b from-slate-100/95 via-[#faf8f8] to-slate-100/85">
      <div className="p-6 md:p-8 max-w-4xl mx-auto pb-16">
        <header className="mb-10">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
            <div>
              <p className="text-xs font-semibold tracking-[0.14em] uppercase text-[#84001B]">Inbox</p>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mt-1.5 tracking-tight flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#84001B] text-[#ffd21a] shrink-0">
                  <Inbox className="w-[22px] h-[22px]" aria-hidden />
                </span>
                Needs attention
              </h1>
              <p className="text-slate-600 text-sm mt-2 max-w-lg leading-relaxed">
                Anything still open on your roster—new uploads, submissions in progress, or students asked to redo
                work. Fresh items bubble to the top.
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
                Refresh
              </button>
              <Link
                to="/student-submissions"
                className="inline-flex items-center gap-2 rounded-xl bg-[#84001B] px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-[#84001B]/20 hover:bg-[#6b0016]"
              >
                Full roster
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </header>

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

        <section className="bg-white border border-slate-200/90 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 border-b border-slate-100 bg-slate-50/50">
            <h2 className="font-semibold text-slate-900 text-sm md:text-base">Latest in queue</h2>
            <Link
              to="/grading"
              className="text-xs font-semibold text-[#84001B] hover:underline inline-flex items-center gap-1"
            >
              Open grading workspace
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="p-4 md:p-5">
            {loading ? (
              <div className="space-y-2">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-[72px] rounded-xl bg-slate-100 animate-pulse" />
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
              <ul className="space-y-2">
                {preview.map((item) => (
                  <li key={item.id}>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl border border-slate-100 bg-slate-50/40 hover:bg-red-50/30 hover:border-[#84001B]/15 transition-colors">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#84001B] to-[#5c0014] flex items-center justify-center text-[11px] font-bold text-white shrink-0">
                          {(item.file_name || '?').slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900 truncate">{item.file_name}</p>
                          <p className="text-xs text-slate-500 truncate mt-0.5">
                            {item.users?.full_name || 'Learner'}
                            {' · '}
                            {item.assignments?.title && (
                              <>
                                <span className="text-slate-600">{item.assignments.title}</span>
                                {' · '}
                              </>
                            )}
                            {relativeTime(item.submitted_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end shrink-0">
                        <span
                          className={`text-[11px] px-2.5 py-1 rounded-full font-semibold capitalize ${statusStyles(item.status)}`}
                        >
                          {statusLabel(item.status)}
                        </span>
                        <Link
                          to={gradingLinkForSubmission(item.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#84001B] text-white text-xs font-semibold px-3 py-2 hover:bg-[#6b0016] shadow-sm"
                        >
                          Review
                          <ChevronRight className="w-3.5 h-3.5 opacity-90" />
                        </Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="mt-8 bg-white border border-slate-200/90 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-5 py-4 border-b border-slate-100 bg-slate-50/60">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#ffd21a]/35 flex items-center justify-center shrink-0">
                <GraduationCap className="w-5 h-5 text-[#84001B]" aria-hidden />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">Class roster</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Students on file ({classLoading ? '…' : students.length}). Search here or open the full list to
                  edit roles and details.
                </p>
              </div>
            </div>
            <Link
              to="/class-list"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#84001B] text-white text-xs font-semibold px-3.5 py-2 shadow-sm hover:bg-[#6b0016] shrink-0 self-start sm:self-center"
            >
              <Users className="w-3.5 h-3.5" />
              Full class list
              <ChevronRight className="w-3.5 h-3.5 opacity-90" />
            </Link>
          </div>

          <div className="p-4 md:p-5">
            <div className="relative mb-4">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden />
              <input
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
                placeholder="Find a student by name or email…"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B]/40 bg-white"
                disabled={classLoading || students.length === 0}
              />
            </div>

            {classLoading ? (
              <div className="space-y-2 max-h-[min(340px,50vh)] overflow-hidden">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-[52px] rounded-xl bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : students.length === 0 ? (
              <div className="text-center py-10 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/70">
                <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" aria-hidden />
                <p className="text-sm font-medium text-slate-700">No students yet</p>
                <p className="text-xs text-slate-500 mt-1 max-w-[280px] mx-auto">
                  When learner accounts appear in Supabase with role &quot;student&quot;, they show up here automatically.
                </p>
              </div>
            ) : filteredStudents.length === 0 ? (
              <p className="text-sm text-center text-slate-500 py-8">No names match &quot;{rosterSearch.trim()}&quot;.</p>
            ) : (
              <ul className="max-h-[min(340px,50vh)] overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-100">
                {filteredStudents.map((s) => (
                  <li key={s.id}>
                    <div className="flex items-center gap-3 px-3 py-3 hover:bg-red-50/40 transition-colors">
                      <div
                        className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#ffd21a] to-[#f5c400] text-[#84001B] flex items-center justify-center text-[11px] font-bold shrink-0 shadow-sm"
                        aria-hidden
                      >
                        {studentInitials(s.full_name || s.email)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{s.full_name || 'Unnamed'}</p>
                        <p className="text-xs text-slate-500 truncate flex items-center gap-1.5 mt-0.5">
                          <Mail className="w-3 h-3 text-slate-400 shrink-0" aria-hidden />
                          {s.email || '—'}
                        </p>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-[#84001B] bg-[#ffd21a]/30 border border-[#ffd21a]/40 rounded-full px-2 py-0.5 shrink-0">
                        Student
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
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

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ClipboardList,
  CheckSquare,
  Users,
  ChevronRight,
  Sparkles,
  Inbox,
  BarChart3,
  Settings,
  FileText,
  GraduationCap,
  Clock,
} from 'lucide-react';
import {
  TeacherWorkspaceShell,
  TeacherPageHeader,
  TeacherAmberCue,
  teacherMaroonTheadClasses,
  teacherRoundedTableShell,
} from '../../components/teacher/TeacherWorkspaceChrome';
import { supabase } from '../../lib/supabase';
import { studentSubmissionsLinkForSubmission } from '../../lib/gradingRoutes';
import { useAuth } from '../../context/AuthContext';

type SubmissionStatus = 'submitted' | 'under_review' | 'reviewed' | 'resubmit';
type SubmissionRow = {
  id: string;
  file_name: string;
  status: SubmissionStatus;
  submitted_at: string;
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const m = Math.round((Date.now() - then) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function TeacherDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    needsGrading: 0,
    inReview: 0,
    students: 0,
    graded: 0,
  });
  const [statusSummary, setStatusSummary] = useState({
    submitted: 0,
    under_review: 0,
    reviewed: 0,
    resubmit: 0,
  });
  const [recentSubs, setRecentSubs] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submissionTable, setSubmissionTable] = useState<'submissions' | 'submission' | null>(null);

  async function resolveSubmissionTable(): Promise<'submissions' | 'submission' | null> {
    if (submissionTable) return submissionTable;
    const plural = await supabase.from('submissions').select('id').limit(1);
    if (!plural.error) {
      setSubmissionTable('submissions');
      return 'submissions';
    }
    const singular = await supabase.from('submission').select('id').limit(1);
    if (!singular.error) {
      setSubmissionTable('submission');
      return 'submission';
    }
    return null;
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      const table = await resolveSubmissionTable();
      const [s, u] = await Promise.all([
        table
          ? supabase
              .from(table)
              .select('id,file_name,status,submitted_at')
              .order('submitted_at', { ascending: false })
              .limit(150)
          : Promise.resolve({ data: [] as SubmissionRow[] }),
        supabase.from('users').select('id', { count: 'exact' }).eq('role', 'student'),
      ]);
      const submissionRows = (s.data || []) as SubmissionRow[];
      const graded = submissionRows.filter((row) => row.status === 'reviewed').length;

      setStats({
        needsGrading: submissionRows.filter((row) => row.status === 'submitted').length,
        inReview: submissionRows.filter((row) => row.status === 'under_review').length,
        students: u.count || 0,
        graded,
      });
      setStatusSummary({
        submitted: submissionRows.filter((row) => row.status === 'submitted').length,
        under_review: submissionRows.filter((row) => row.status === 'under_review').length,
        reviewed: submissionRows.filter((row) => row.status === 'reviewed').length,
        resubmit: submissionRows.filter((row) => row.status === 'resubmit').length,
      });
      setRecentSubs(submissionRows.slice(0, 6));
      setLoading(false);
    })();
  }, [user]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = user?.full_name?.trim().split(/\s+/)[0] ?? 'there';
  const weekday = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const jumpLinks = [
    { to: '/grading', label: 'Grading', Icon: ClipboardList, desc: 'Score & AI review' },
    { to: '/student-submissions', label: 'Roster', Icon: FileText, desc: 'All uploads' },
    { to: '/inbox', label: 'Inbox', Icon: Inbox, desc: 'Needs attention' },
    { to: '/class-list', label: 'Students', Icon: GraduationCap, desc: 'Class list' },
    { to: '/reports', label: 'Reports', Icon: BarChart3, desc: 'Analytics' },
    { to: '/teacher-settings', label: 'Settings', Icon: Settings, desc: 'Workspace' },
  ];

  const statusTiles = [
    {
      label: 'New',
      count: statusSummary.submitted,
      sub: 'Submitted',
      light: 'bg-rose-50/90 text-[#84001B]',
      bar: 'bg-[#84001B]',
    },
    {
      label: 'Review',
      count: statusSummary.under_review,
      sub: 'In progress',
      light: 'bg-[#ffd21a]/15 text-[#5c0014]',
      bar: 'bg-[#ffd21a]',
    },
    {
      label: 'Done',
      count: statusSummary.reviewed,
      sub: 'Reviewed',
      light: 'bg-[#84001B]/06 text-[#84001B]',
      bar: 'bg-[#84001B]/65',
    },
    {
      label: 'Redo',
      count: statusSummary.resubmit,
      sub: 'Resubmit',
      light: 'bg-red-50 text-red-900',
      bar: 'bg-red-600',
    },
  ];

  const totalTracked = Object.values(statusSummary).reduce((a, b) => a + b, 0);

  return (
    <TeacherWorkspaceShell maxWidthClass="max-w-6xl">
      <TeacherPageHeader
        eyebrow="Dashboard"
        title={
          <>
            {greeting}, {firstName}!
          </>
        }
        icon={Sparkles}
        description={
          <p className="text-slate-500 text-sm flex flex-wrap items-center gap-x-2 gap-y-1">
            <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden />
            <span>{weekday}</span>
            <span className="text-slate-300">·</span>
            <span>Queue snapshot and quickest paths into grading.</span>
          </p>
        }
        actions={
          <Link
            to="/grading"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#84001B] text-white px-4 py-2.5 text-sm font-semibold shadow-lg shadow-[#84001B]/25 hover:bg-[#6b0016] shrink-0"
          >
            Open grading
            <ChevronRight className="w-4 h-4" />
          </Link>
        }
      />

        <section className="mb-8 rounded-2xl overflow-hidden border border-[#84001B]/20 shadow-lg shadow-[#84001B]/10">
          <div className="bg-gradient-to-r from-[#84001B] via-[#720018] to-[#5c0014] px-5 py-5 md:px-7 md:py-6 text-white">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
              <div className="flex gap-4 min-w-0">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                    stats.needsGrading > 0 ? 'bg-[#ffd21a] text-[#84001B]' : 'bg-white/15 text-white'
                  }`}
                >
                  {stats.needsGrading > 0 ? (
                    <Sparkles className="w-6 h-6" aria-hidden />
                  ) : (
                    <CheckSquare className="w-6 h-6" aria-hidden />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#ffd21a]/90">
                    Today&apos;s focus
                  </p>
                  <p className="text-lg md:text-xl font-bold mt-1 leading-snug">
                    {stats.needsGrading > 0 ? (
                      <>
                        {stats.needsGrading} submission{stats.needsGrading !== 1 ? 's' : ''} ready for a first pass
                      </>
                    ) : (
                      <>You&apos;re caught up on new uploads</>
                    )}
                  </p>
                  <p className="text-sm text-white/75 mt-1.5 max-w-xl">
                    Open grading to run checks, adjust scores, and publish when you&apos;re satisfied—students only see
                    approved grades.
                  </p>
                </div>
              </div>
              <Link
                to="/grading"
                className="inline-flex items-center justify-center gap-2 bg-[#ffd21a] text-[#84001B] hover:bg-[#ffe566] transition-colors rounded-xl px-5 py-3 text-sm font-bold shrink-0 shadow-md"
              >
                Grading workspace
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>

        <section className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">At a glance</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {[
              {
                label: 'Needs grading',
                value: stats.needsGrading,
                Icon: ClipboardList,
                iconWrap: 'bg-[#84001B] text-white',
                to: '/grading',
                hint: 'Submitted',
              },
              {
                label: 'In review',
                value: stats.inReview,
                Icon: CheckSquare,
                iconWrap: 'bg-[#ffd21a] text-[#84001B]',
                to: '/grading',
                hint: 'In progress',
              },
              {
                label: 'Students',
                value: stats.students,
                Icon: Users,
                iconWrap: 'bg-[#84001B]/12 text-[#84001B]',
                to: '/class-list',
                hint: 'Enrolled',
              },
              {
                label: 'Graded',
                value: stats.graded,
                Icon: BarChart3,
                iconWrap: 'bg-red-50 text-[#84001B]',
                to: '/reports',
                hint: 'In latest sample',
              },
            ].map(({ label, value, Icon, iconWrap, to, hint }) => (
              <Link key={label} to={to} className="group">
                <div className="h-full bg-white border border-slate-200/90 rounded-2xl p-4 md:p-5 shadow-sm hover:shadow-md hover:border-[#84001B]/20 transition-all">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 ${iconWrap} group-hover:scale-[1.02] transition-transform`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <p className="text-2xl md:text-3xl font-bold text-slate-900 tabular-nums">
                    {loading ? '—' : value}
                  </p>
                  <p className="text-sm font-semibold text-slate-800 mt-0.5">{label}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>
                </div>
              </Link>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 mt-2 px-0.5">
            Submission counts reflect up to the 150 most recent turn-ins in your database.
          </p>
        </section>

        <div className="grid lg:grid-cols-5 gap-6 mb-8">
          <div className="lg:col-span-3 space-y-5">
            <div className="rounded-2xl border border-slate-200/90 bg-white p-5 md:p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-5">
                <h2 className="font-semibold text-slate-900">Submission mix</h2>
                <Link
                  to="/reports"
                  className="text-xs font-semibold text-[#84001B] hover:underline inline-flex items-center gap-0.5"
                >
                  Full reports
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              {loading ? (
                <div className="grid sm:grid-cols-2 gap-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-24 rounded-xl bg-slate-100 animate-pulse" />
                  ))}
                </div>
              ) : totalTracked === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/60">
                  No submissions in the recent window yet—open the{' '}
                  <Link className="text-[#84001B] font-semibold underline" to="/student-submissions">
                    roster
                  </Link>{' '}
                  when files start arriving.
                </p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  {statusTiles.map(({ label, count, sub, light, bar }) => (
                    <div key={label} className={`rounded-xl p-4 border border-black/[0.04] ${light}`}>
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-2xl font-bold tabular-nums text-slate-900">{count}</p>
                        <span className="text-[10px] font-bold uppercase tracking-wide opacity-70">{label}</span>
                      </div>
                      <p className="text-xs font-medium mt-1 opacity-90">{sub}</p>
                      <div className="h-1.5 bg-black/5 rounded-full mt-3 overflow-hidden">
                        <div
                          className={`h-full ${bar} rounded-full transition-all`}
                          style={{
                            width: totalTracked > 0 ? `${(count / totalTracked) * 100}%` : '0%',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {!loading && recentSubs.length > 0 && (
              <div className={teacherRoundedTableShell}>
                <TeacherAmberCue title="Latest activity">
                  Recent uploads from your database sample—same maroon spreadsheet header as Class list. Tap the file or
                  Review to open the submission roster on that upload.
                </TeacherAmberCue>
                <div className="flex items-center justify-between gap-2 px-5 py-3 border-b border-slate-100 bg-white">
                  <h2 className="font-semibold text-slate-900 text-sm">Turn-ins</h2>
                  <Link
                    to="/student-submissions"
                    className="text-xs font-semibold text-[#84001B] hover:underline inline-flex items-center gap-0.5"
                  >
                    View all
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left min-w-[520px]">
                    <thead>
                      <tr className={teacherMaroonTheadClasses}>
                        <th className="px-4 py-3 font-semibold">File</th>
                        <th className="px-4 py-3 font-semibold whitespace-nowrap">Submitted</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold text-right w-24">Roster</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {recentSubs.map((row) => (
                        <tr key={row.id} className="bg-white hover:bg-red-50/40">
                          <td className="px-4 py-3">
                            <Link
                              to={studentSubmissionsLinkForSubmission(row.id)}
                              className="flex items-center gap-2 min-w-0 group"
                              title="View this upload on the submission roster"
                            >
                              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#84001B] to-[#5c0014] text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                                {(row.file_name || '?').slice(0, 1).toUpperCase()}
                              </div>
                              <span className="font-medium text-slate-900 truncate group-hover:text-[#84001B]">
                                {row.file_name}
                              </span>
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">
                            {relativeTime(row.submitted_at)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full inline-block ${
                                row.status === 'submitted'
                                  ? 'bg-rose-100 text-[#84001B]'
                                  : row.status === 'under_review'
                                    ? 'bg-[#ffd21a]/30 text-[#5c0014]'
                                    : row.status === 'reviewed'
                                      ? 'bg-[#84001B]/10 text-[#84001B]'
                                      : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {row.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              to={studentSubmissionsLinkForSubmission(row.id)}
                              className="inline-flex items-center gap-0.5 text-xs font-semibold text-[#84001B] hover:underline"
                              title="Open submission roster on this file"
                            >
                              Review
                              <ChevronRight className="w-3.5 h-3.5 opacity-70" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-2">
            <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sticky top-4">
              <h2 className="text-sm font-semibold text-slate-900 mb-1">Jump to</h2>
              <p className="text-[11px] text-slate-500 mb-4">Common screens without using the sidebar.</p>
              <div className="space-y-2">
                {jumpLinks.map(({ to, label, Icon, desc }) => (
                  <Link
                    key={to}
                    to={to}
                    className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5 hover:border-[#84001B]/25 hover:bg-red-50/40 transition-all group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-[#84001B]/10 flex items-center justify-center text-[#84001B] group-hover:bg-[#ffd21a]/30">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{label}</p>
                      <p className="text-[11px] text-slate-500">{desc}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-[#84001B] shrink-0" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        <section className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white to-slate-50/80 p-6 md:p-7 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="max-w-2xl">
              <p className="font-semibold text-slate-900 text-lg">How grading works</p>
              <ol className="mt-3 space-y-2 text-sm text-slate-600 list-decimal list-inside marker:text-[#84001B] marker:font-bold">
                <li>Student files appear in grading and on the roster with a status.</li>
                <li>Use AI-assisted suggestions, then edit scores and feedback before publishing.</li>
                <li>Only approved grades are shown to learners—redo flows use the resubmit path.</li>
              </ol>
            </div>
            <Link
              to="/grading"
              className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-[#84001B] text-white px-4 py-2.5 text-sm font-semibold hover:bg-[#6b0016] shadow-md shadow-[#84001B]/20"
            >
              Start in grading
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </section>
    </TeacherWorkspaceShell>
  );
}

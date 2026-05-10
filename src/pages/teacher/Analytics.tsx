import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  TrendingUp,
  Users,
  FileText,
  CheckCircle,
  Clock,
  Award,
  ChevronRight,
  PieChart,
} from 'lucide-react';
import {
  TeacherWorkspaceShell,
  TeacherPageHeader,
  TeacherAmberCue,
  teacherMaroonTheadClasses,
  teacherRoundedTableShell,
} from '../../components/teacher/TeacherWorkspaceChrome';
import { supabase } from '../../lib/supabase';
import { gradingLinkForSubmission } from '../../lib/gradingRoutes';
import { useAuth } from '../../context/AuthContext';

interface Stats {
  totalAssignments: number;
  activeAssignments: number;
  totalSubmissions: number;
  pendingReviews: number;
  underReviewCount: number;
  reviewedSubmissions: number;
  avgScore: number;
  totalStudents: number;
  resubmitCount: number;
}

interface DocTypeStat {
  type: string;
  count: number;
}
interface RecentSub {
  id: string;
  file_name: string;
  score: number | null;
  submitted_at: string;
  users: { full_name: string } | null;
}

export default function Analytics() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({
    totalAssignments: 0,
    activeAssignments: 0,
    totalSubmissions: 0,
    pendingReviews: 0,
    underReviewCount: 0,
    reviewedSubmissions: 0,
    avgScore: 0,
    totalStudents: 0,
    resubmitCount: 0,
  });
  const [docTypeStats, setDocTypeStats] = useState<DocTypeStat[]>([]);
  const [recentSubs, setRecentSubs] = useState<RecentSub[]>([]);
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
      const table = await resolveSubmissionTable();
      const [asgn, subs, students, scored] = await Promise.all([
        supabase.from('assignments').select('id, status, document_type').eq('teacher_id', user!.id),
        table
          ? supabase
              .from(table)
              .select('id, status, score, submitted_at, file_name, users(full_name)')
              .order('submitted_at', { ascending: false })
          : Promise.resolve({ data: [] } as { data: unknown[] }),
        supabase.from('users').select('id', { count: 'exact' }).eq('role', 'student'),
        table
          ? supabase.from(table).select('score').eq('status', 'reviewed').not('score', 'is', null)
          : Promise.resolve({ data: [] as { score: number | null }[] }),
      ]);

      const asgnData = asgn.data || [];
      const scoredData = (scored.data || []) as { score: number | null }[];
      const subsData = (subs.data || []) as {
        id: string;
        status: string;
        score: number | null;
        submitted_at: string;
        file_name: string;
        users: { full_name: string } | null;
      }[];

      const avgScore =
        scoredData.length > 0
          ? Math.round(
              scoredData.reduce((s, r) => s + (r.score || 0), 0) /
                scoredData.length
            )
          : 0;

      const typeCount: Record<string, number> = {};
      asgnData.forEach((a) => {
        typeCount[a.document_type] = (typeCount[a.document_type] || 0) + 1;
      });

      setStats({
        totalAssignments: asgnData.length,
        activeAssignments: asgnData.filter((a) => a.status === 'active').length,
        totalSubmissions: subsData.length,
        pendingReviews: subsData.filter((s) => s.status === 'submitted').length,
        underReviewCount: subsData.filter((s) => s.status === 'under_review').length,
        reviewedSubmissions: subsData.filter((s) => s.status === 'reviewed').length,
        resubmitCount: subsData.filter((s) => s.status === 'resubmit').length,
        avgScore,
        totalStudents: students.count || 0,
      });
      setDocTypeStats(Object.entries(typeCount).map(([type, count]) => ({ type, count })));
      setRecentSubs(subsData.slice(0, 8).map((s) => ({ ...s })));
      setLoading(false);
    })();
  }, [user]);

  const maxDocCount = Math.max(...docTypeStats.map((d) => d.count), 1);
  const reviewRate =
    stats.totalSubmissions > 0
      ? Math.round((stats.reviewedSubmissions / stats.totalSubmissions) * 100)
      : 0;

  const kpiPrimary = [
    {
      label: 'Total submissions',
      value: stats.totalSubmissions,
      sub: `${stats.pendingReviews} need first look`,
      Icon: FileText,
      iconWrap: 'bg-[#84001B] text-white',
    },
    {
      label: 'Average score',
      value: stats.reviewedSubmissions > 0 ? `${stats.avgScore}%` : '—',
      sub: `${stats.reviewedSubmissions} graded records`,
      Icon: Award,
      iconWrap: 'bg-[#ffd21a] text-[#84001B]',
    },
    {
      label: 'Review progress',
      value: `${reviewRate}%`,
      sub: 'of all turn-ins closed',
      Icon: CheckCircle,
      iconWrap: 'bg-[#6b0016] text-white',
    },
    {
      label: 'Active submissions',
      value: stats.activeAssignments,
      sub: `${stats.totalAssignments} total on record`,
      Icon: BarChart3,
      iconWrap: 'bg-[#84001B]/90 text-white',
    },
  ];

  const kpiSecondary = [
    {
      label: 'Pending review',
      value: stats.pendingReviews,
      Icon: Clock,
      iconWrap: 'bg-red-100 text-red-800',
    },
    {
      label: 'In review',
      value: stats.underReviewCount,
      Icon: FileText,
      iconWrap: 'bg-[#ffd21a]/25 text-[#84001B]',
    },
    {
      label: 'Resubmissions',
      value: stats.resubmitCount,
      Icon: TrendingUp,
      iconWrap: 'bg-red-50 text-red-700',
    },
    {
      label: 'Students enrolled',
      value: stats.totalStudents,
      Icon: Users,
      iconWrap: 'bg-[#84001B]/10 text-[#84001B]',
    },
  ];

  function formatShortDate(iso: string) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  const statusBuckets = [
    {
      label: 'Submitted',
      count: stats.pendingReviews,
      light: 'bg-rose-50/90 text-[#84001B] border border-rose-100',
      bar: 'bg-[#84001B]',
    },
    {
      label: 'Under review',
      count: stats.underReviewCount,
      light: 'bg-[#ffd21a]/12 text-[#5c0014] border border-[#ffd21a]/30',
      bar: 'bg-[#ffd21a]',
    },
    {
      label: 'Reviewed',
      count: stats.reviewedSubmissions,
      light: 'bg-[#84001B]/06 text-[#84001B] border border-[#84001B]/15',
      bar: 'bg-[#84001B]/70',
    },
    {
      label: 'Resubmit',
      count: stats.resubmitCount,
      light: 'bg-red-50 text-red-900 border border-red-100',
      bar: 'bg-red-600',
    },
  ];

  return (
    <TeacherWorkspaceShell>
      <TeacherPageHeader
        eyebrow="Reports"
        title="Course snapshot"
        icon={BarChart3}
        description="One place to see grading throughput, backlog, and how submissions break down—aligned with live submission data from your workspace."
        actions={
          <>
            <Link
              to="/student-submissions"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Submission roster
              <ChevronRight className="w-3.5 h-3.5 opacity-70" />
            </Link>
            <Link
              to="/grading"
              className="inline-flex items-center gap-2 rounded-xl bg-[#84001B] px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-[#84001B]/20 hover:bg-[#6b0016]"
            >
              Grading workspace
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </>
        }
      />

        {loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-white/80 border border-slate-200/80 rounded-2xl animate-pulse" />
              ))}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 bg-white/60 rounded-xl animate-pulse" />
              ))}
            </div>
          </div>
        ) : (
          <>
            <section className="mb-6">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Key metrics</h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {kpiPrimary.map(({ label, value, sub, Icon, iconWrap }) => (
                  <div
                    key={label}
                    className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-[#84001B]/15 transition-all"
                  >
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 ${iconWrap}`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <p className="text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
                    <p className="text-sm font-medium text-slate-700 mt-0.5">{label}</p>
                    <p className="text-xs text-slate-500 mt-1">{sub}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="mb-10">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Pipeline</h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {kpiSecondary.map(({ label, value, Icon, iconWrap }) => (
                  <div
                    key={label}
                    className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white/90 px-4 py-3"
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconWrap}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-lg font-bold text-slate-900 tabular-nums leading-none">{value}</p>
                      <p className="text-[11px] font-medium text-slate-500 mt-1">{label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <div className="grid lg:grid-cols-2 gap-6">
              <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center justify-between gap-2 mb-5">
                  <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                    <PieChart className="w-4 h-4 text-[#84001B]" />
                    Submissions by document type
                  </h2>
                  <span className="text-[11px] text-slate-400 tabular-nums">{stats.totalAssignments} total</span>
                </div>
                {docTypeStats.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-5 py-10 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-[#84001B]/10 flex items-center justify-center mx-auto mb-3">
                      <BarChart3 className="w-6 h-6 text-[#84001B]" />
                    </div>
                    <p className="text-sm font-medium text-slate-800">No submissions yet</p>
                    <p className="text-xs text-slate-500 mt-1.5 max-w-[260px] mx-auto">
                      Add submission tasks first—this chart fills in automatically from each task’s document type.
                    </p>
                    <Link
                      to="/dashboard"
                      className="inline-flex items-center gap-1.5 mt-5 text-xs font-semibold text-[#84001B] hover:underline"
                    >
                      Go to dashboard
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {docTypeStats
                      .sort((a, b) => b.count - a.count)
                      .map(({ type, count }) => (
                        <div key={type}>
                          <div className="flex justify-between items-baseline gap-3 text-sm mb-2">
                            <span className="font-semibold text-slate-800 truncate">{type}</span>
                            <span className="text-slate-500 shrink-0 tabular-nums">
                              {count} submission{count !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-[#84001B] to-[#ffd21a] transition-all duration-700"
                              style={{ width: `${(count / maxDocCount) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              <div className={teacherRoundedTableShell}>
                <TeacherAmberCue title="Recent submissions">
                  Class-list style table: file, learner, when it landed, score if any, and a Grade shortcut. Use horizontal
                  scroll on small viewports.
                </TeacherAmberCue>
                <div className="flex items-center justify-between gap-2 px-5 py-3 border-b border-slate-100 bg-white">
                  <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#84001B]" aria-hidden />
                    Latest turn-ins
                  </h2>
                  <Link to="/grading" className="text-[11px] font-semibold text-[#84001B] hover:underline">
                    Open queue →
                  </Link>
                </div>
                {recentSubs.length === 0 ? (
                  <div className="p-6">
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-5 py-10 text-center">
                      <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" aria-hidden />
                      <p className="text-sm font-medium text-slate-800">No submissions yet</p>
                      <p className="text-xs text-slate-500 mt-1.5 max-w-[260px] mx-auto">
                        When students upload work, the latest files appear here with quick links to grade.
                      </p>
                      <Link
                        to="/student-submissions"
                        className="inline-flex items-center gap-1.5 mt-5 text-xs font-semibold text-[#84001B] hover:underline"
                      >
                        View roster
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left min-w-[640px]">
                      <thead>
                        <tr className={teacherMaroonTheadClasses}>
                          <th className="px-4 py-3 font-semibold">File</th>
                          <th className="px-4 py-3 font-semibold">Learner</th>
                          <th className="px-4 py-3 font-semibold whitespace-nowrap">Submitted</th>
                          <th className="px-4 py-3 font-semibold">Score</th>
                          <th className="px-4 py-3 font-semibold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {recentSubs.map((s) => (
                          <tr key={s.id} className="bg-white hover:bg-red-50/40">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#84001B] to-[#5c0014] text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                                  {(s.file_name || '?').slice(0, 1).toUpperCase()}
                                </div>
                                <span className="font-semibold text-slate-900 truncate">{s.file_name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-700 truncate max-w-[140px]">
                              {s.users?.full_name ?? 'Learner'}
                            </td>
                            <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">{formatShortDate(s.submitted_at)}</td>
                            <td className="px-4 py-3">
                              {s.score != null ? (
                                <span
                                  className={`text-xs font-bold px-2 py-1 rounded-lg tabular-nums inline-block ${
                                    s.score >= 80
                                      ? 'bg-[#ffd21a]/35 text-[#5c0014]'
                                      : s.score >= 60
                                        ? 'bg-[#84001B]/12 text-[#84001B]'
                                        : 'bg-red-100 text-red-800'
                                  }`}
                                >
                                  {s.score}%
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                  Pending
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Link
                                to={gradingLinkForSubmission(s.id)}
                                className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-[#84001B] hover:underline px-1.5 py-1 rounded-md hover:bg-red-50"
                              >
                                Grade
                                <ChevronRight className="w-3 h-3" />
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="lg:col-span-2 bg-white border border-slate-200/90 rounded-2xl p-6 md:p-7 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                  <h2 className="font-semibold text-slate-900 text-lg flex items-center gap-2">
                    <PieChart className="w-5 h-5 text-[#84001B]" />
                    Submission status mix
                  </h2>
                  <p className="text-xs text-slate-500">
                    Shares of{' '}
                    <span className="font-semibold text-slate-700 tabular-nums">{stats.totalSubmissions}</span>{' '}
                    total uploads
                  </p>
                </div>
                {stats.totalSubmissions === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8 border border-dashed border-slate-200 rounded-xl bg-slate-50/60">
                    Status bars appear once students submit work—open{' '}
                    <Link className="text-[#84001B] font-semibold underline" to="/student-submissions">
                      the roster
                    </Link>{' '}
                    to monitor new files.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                    {statusBuckets.map(({ label, count, light, bar }) => (
                      <div key={label} className={`rounded-xl p-4 ${light}`}>
                        <p className="text-2xl font-bold tabular-nums text-slate-900">{Math.max(0, count)}</p>
                        <p className="text-sm font-semibold mt-1">{label}</p>
                        <div className="h-2 bg-black/5 rounded-full mt-3 overflow-hidden">
                          <div
                            className={`h-full ${bar} rounded-full transition-all`}
                            style={{
                              width:
                                stats.totalSubmissions > 0
                                  ? `${(Math.max(0, count) / stats.totalSubmissions) * 100}%`
                                  : '0%',
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
    </TeacherWorkspaceShell>
  );
}

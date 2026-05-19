import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  TrendingUp,
  Star,
  Target,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Award,
  Activity,
} from 'lucide-react';
import {
  StudentPageHero,
  StudentWorkspaceShell,
  studentCardClasses,
} from '../../components/student/StudentWorkspaceChrome';
import {
  buildEffectiveSubmittedAssignmentIds,
  formatShortDate,
  useStudentWorkspace,
} from '../../lib/studentWorkspaceData';

function pct(num: number, den: number): number {
  if (!den) return 0;
  return Math.round((num / den) * 100);
}

export default function StudentAnalytics() {
  const { loading, assignments, submissions } = useStudentWorkspace();

  /** `resubmit` rows aren't counted as completed for analytics, matching Tasks/Dashboard/Boards behavior. */
  const submittedAssignmentIds = useMemo(
    () => buildEffectiveSubmittedAssignmentIds(submissions),
    [submissions]
  );

  const reviewed = submissions.filter((s) => s.status === 'reviewed');
  const reviewedScored = reviewed.filter((s) => s.score != null) as Array<typeof reviewed[number] & { score: number }>;
  const avgScore = reviewedScored.length
    ? Math.round(reviewedScored.reduce((acc, s) => acc + s.score, 0) / reviewedScored.length)
    : null;
  const bestScore = reviewedScored.length ? Math.max(...reviewedScored.map((s) => s.score)) : null;
  const worstScore = reviewedScored.length ? Math.min(...reviewedScored.map((s) => s.score)) : null;

  const onTimeFor = useMemo(() => {
    let onTime = 0;
    let late = 0;
    submissions.forEach((s) => {
      if (!s.assignment_id) return;
      const a = assignments.find((x) => x.id === s.assignment_id);
      if (!a?.due_date) return;
      const submitted = new Date(s.submitted_at).getTime();
      const due = new Date(a.due_date).getTime();
      if (Number.isNaN(submitted) || Number.isNaN(due)) return;
      if (submitted <= due + 24 * 60 * 60 * 1000) onTime += 1;
      else late += 1;
    });
    return { onTime, late, total: onTime + late };
  }, [submissions, assignments]);

  const byDocType = useMemo(() => {
    const map = new Map<string, { count: number; reviewed: number; sumScore: number; scoredCount: number }>();
    submissions.forEach((s) => {
      const t = s.submission_doc_type || s.assignment_doc_type || 'SPP';
      const cur = map.get(t) ?? { count: 0, reviewed: 0, sumScore: 0, scoredCount: 0 };
      cur.count += 1;
      if (s.status === 'reviewed') cur.reviewed += 1;
      if (s.score != null) {
        cur.sumScore += s.score;
        cur.scoredCount += 1;
      }
      map.set(t, cur);
    });
    return Array.from(map.entries())
      .map(([type, v]) => ({
        type,
        count: v.count,
        reviewed: v.reviewed,
        avg: v.scoredCount ? Math.round(v.sumScore / v.scoredCount) : null,
      }))
      .sort((a, b) => b.count - a.count);
  }, [submissions]);

  const byStatus = useMemo(() => {
    const counts = { submitted: 0, under_review: 0, reviewed: 0, resubmit: 0 };
    submissions.forEach((s) => {
      if (s.status in counts) counts[s.status] += 1;
    });
    return counts;
  }, [submissions]);

  const totalActive = assignments.filter((a) => a.status === 'active').length;
  const activeAssignmentIds = useMemo(
    () => new Set(assignments.filter((a) => a.status === 'active').map((a) => a.id)),
    [assignments]
  );
  const submittedActiveCount = useMemo(() => {
    let n = 0;
    for (const id of submittedAssignmentIds) {
      if (activeAssignmentIds.has(id)) n += 1;
    }
    return n;
  }, [submittedAssignmentIds, activeAssignmentIds]);
  const completion = pct(submittedActiveCount, totalActive);

  const recentTrend = useMemo(() => {
    return [...reviewedScored]
      .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime())
      .slice(-8);
  }, [reviewedScored]);
  const trendMax = recentTrend.length ? Math.max(...recentTrend.map((s) => s.score), 100) : 100;

  return (
    <StudentWorkspaceShell>
      <StudentPageHero
        eyebrow="Workspace · Analytics"
        title="Analytics"
        icon={BarChart3}
        description="Personal performance over time. Average score, completion rate, on-time rate, and breakdowns by document type."
        kpis={[
          { label: 'Avg', value: loading ? '—' : avgScore != null ? `${avgScore}%` : '—' },
          { label: 'Best', value: loading ? '—' : bestScore != null ? `${bestScore}%` : '—', accent: 'yellow' },
          { label: 'Done', value: loading ? '—' : `${completion}%` },
        ]}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          {
            label: 'Average score',
            value: avgScore != null ? `${avgScore}%` : '—',
            sub: reviewedScored.length ? `from ${reviewedScored.length} graded` : 'no grades yet',
            Icon: Star,
            tint: 'bg-amber-500',
          },
          {
            label: 'Completion',
            value: `${completion}%`,
            sub: `${submittedAssignmentIds.size} of ${totalActive} active`,
            Icon: Target,
            tint: 'bg-emerald-600',
          },
          {
            label: 'On-time rate',
            value: onTimeFor.total ? `${pct(onTimeFor.onTime, onTimeFor.total)}%` : '—',
            sub: onTimeFor.total
              ? `${onTimeFor.onTime} on time · ${onTimeFor.late} late`
              : 'no due-date data',
            Icon: Clock,
            tint: 'bg-blue-600',
          },
          {
            label: 'Total submissions',
            value: submissions.length,
            sub: `${reviewed.length} graded`,
            Icon: Activity,
            tint: 'bg-[#84001B]',
          },
        ].map(({ label, value, sub, Icon, tint }) => (
          <div
            key={label}
            className={`${studentCardClasses} p-4 hover:shadow-md hover:border-[#84001B]/20 transition-all`}
          >
            <div className={`w-10 h-10 ${tint} rounded-xl flex items-center justify-center mb-3 text-white`}>
              <Icon className="w-5 h-5" aria-hidden />
            </div>
            <p className="text-2xl font-bold text-slate-900 tabular-nums">{loading ? '—' : value}</p>
            <p className="text-xs uppercase tracking-wide text-slate-400 mt-1 font-semibold">{label}</p>
            <p className="text-[11px] text-slate-500 mt-1">{loading ? '—' : sub}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1.1fr,1fr] gap-5 mb-5">
        <div className={`${studentCardClasses} p-5`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#84001B]" aria-hidden /> Score trend
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">Last {recentTrend.length || 0} graded submissions, oldest → newest</p>
            </div>
            <Link to="/sheets" className="text-xs font-semibold text-[#84001B] hover:underline">
              Open sheet →
            </Link>
          </div>
          {loading ? (
            <div className="h-48 rounded-xl bg-slate-100 animate-pulse" />
          ) : recentTrend.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center text-slate-300">
              <TrendingUp className="w-8 h-8 mb-2" aria-hidden />
              <p className="text-sm text-slate-400">Score trend appears once your work is graded.</p>
            </div>
          ) : (
            <div className="h-48 flex items-end gap-2">
              {recentTrend.map((s) => {
                const heightPct = Math.max(8, Math.round((s.score / trendMax) * 100));
                const tone =
                  s.score >= 90
                    ? 'from-emerald-400 to-emerald-600'
                    : s.score >= 75
                    ? 'from-amber-300 to-amber-500'
                    : s.score >= 60
                    ? 'from-orange-300 to-orange-500'
                    : 'from-red-300 to-red-500';
                return (
                  <div key={s.id} className="flex-1 min-w-[28px] flex flex-col items-center gap-1">
                    <div className="text-[10px] font-bold tabular-nums text-slate-700">{s.score}</div>
                    <div
                      className={`w-full rounded-t-md bg-gradient-to-t ${tone} shadow-sm transition-all`}
                      style={{ height: `${heightPct}%` }}
                      title={`${s.assignment_title || s.file_name} · ${formatShortDate(s.submitted_at)}`}
                    />
                    <div className="text-[9px] text-slate-400 truncate w-full text-center">
                      {formatShortDate(s.submitted_at)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className={`${studentCardClasses} p-5`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-slate-900 flex items-center gap-2">
                <Award className="w-4 h-4 text-[#84001B]" aria-hidden /> Status breakdown
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">Where each submission stands today</p>
            </div>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-10 rounded-lg bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : submissions.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-10">No submissions yet.</p>
          ) : (
            <div className="space-y-3">
              {[
                { id: 'submitted', label: 'Submitted', tone: 'bg-rose-200', count: byStatus.submitted },
                { id: 'under_review', label: 'Under review', tone: 'bg-amber-300', count: byStatus.under_review },
                { id: 'reviewed', label: 'Graded', tone: 'bg-emerald-300', count: byStatus.reviewed },
                { id: 'resubmit', label: 'Redo requested', tone: 'bg-red-300', count: byStatus.resubmit },
              ].map((row) => {
                const w = pct(row.count, submissions.length);
                return (
                  <div key={row.id}>
                    <div className="flex items-center justify-between text-[12px] mb-1">
                      <span className="font-semibold text-slate-700">{row.label}</span>
                      <span className="tabular-nums text-slate-500">
                        {row.count} <span className="text-slate-400">({w}%)</span>
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-full ${row.tone}`} style={{ width: `${w}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className={`${studentCardClasses} overflow-hidden`}>
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-900">By document type</h2>
            <span className="text-[11px] text-slate-500">{byDocType.length} type{byDocType.length !== 1 ? 's' : ''}</span>
          </div>
          {loading ? (
            <div className="p-5 space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-12 rounded-xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : byDocType.length === 0 ? (
            <p className="p-10 text-center text-sm text-slate-500">No submissions yet to break down.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {byDocType.map((row) => (
                <li
                  key={row.type}
                  className="px-5 py-3 flex items-center gap-4 hover:bg-slate-50 transition-colors"
                >
                  <span className="w-12 text-[11px] font-bold uppercase tracking-wide bg-rose-100 text-[#84001B] rounded-md px-2 py-1 text-center shrink-0">
                    {row.type}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-[12px] mb-1">
                      <span className="font-semibold text-slate-700 tabular-nums">
                        {row.count} submission{row.count !== 1 ? 's' : ''} · {row.reviewed} graded
                      </span>
                      <span className="tabular-nums text-slate-500">
                        {row.avg != null ? `Avg ${row.avg}%` : '—'}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#84001B] to-[#b8002b]"
                        style={{ width: `${pct(row.count, submissions.length)}%` }}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={`${studentCardClasses} p-5 space-y-4`}>
          <h2 className="font-bold text-slate-900 flex items-center gap-2">
            <Target className="w-4 h-4 text-[#84001B]" aria-hidden /> Quick insights
          </h2>
          {loading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-12 rounded-xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : (
            <ul className="space-y-3 text-sm">
              <li className="flex gap-3 items-start rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">
                    Completion rate: <span className="tabular-nums">{completion}%</span>
                  </p>
                  <p className="text-[12px] text-slate-500 mt-0.5">
                    {submittedAssignmentIds.size} of {totalActive} active assignments have at least one submission.
                  </p>
                </div>
              </li>
              <li className="flex gap-3 items-start rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <Clock className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">
                    On-time rate:{' '}
                    <span className="tabular-nums">
                      {onTimeFor.total ? `${pct(onTimeFor.onTime, onTimeFor.total)}%` : 'n/a'}
                    </span>
                  </p>
                  <p className="text-[12px] text-slate-500 mt-0.5">
                    {onTimeFor.total
                      ? `${onTimeFor.onTime} on time, ${onTimeFor.late} late submission${onTimeFor.late !== 1 ? 's' : ''}.`
                      : 'Need due-date data on assignments to compute.'}
                  </p>
                </div>
              </li>
              <li className="flex gap-3 items-start rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <Star className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">
                    Score range:{' '}
                    {worstScore != null && bestScore != null ? (
                      <span className="tabular-nums">
                        {worstScore}% → {bestScore}%
                      </span>
                    ) : (
                      'no graded scores'
                    )}
                  </p>
                  <p className="text-[12px] text-slate-500 mt-0.5">
                    {avgScore != null
                      ? `Average ${avgScore}% across ${reviewedScored.length} graded submission${reviewedScored.length !== 1 ? 's' : ''}.`
                      : 'Once your teacher posts a grade, this fills in.'}
                  </p>
                </div>
              </li>
              {byStatus.resubmit > 0 && (
                <li className="flex gap-3 items-start rounded-xl border border-red-200 bg-red-50/70 p-3">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-red-900">
                      {byStatus.resubmit} redo request{byStatus.resubmit !== 1 ? 's' : ''} pending
                    </p>
                    <p className="text-[12px] text-red-800/90 mt-0.5">
                      Address feedback on Submission status, then upload a new file.
                    </p>
                    <Link
                      to="/my-submissions"
                      className="mt-2 inline-flex items-center gap-1 text-[12px] font-bold text-red-900 hover:underline"
                    >
                      Open Submission status <ChevronRight className="w-3 h-3" />
                    </Link>
                  </div>
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </StudentWorkspaceShell>
  );
}

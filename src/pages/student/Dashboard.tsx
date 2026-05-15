import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Home,
  FileText,
  ClipboardList,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ChevronRight,
  Star,
  Upload,
  Sparkles,
  Calendar,
  Folder,
  Table2,
  BarChart3,
  ListChecks,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  StudentPageHero,
  StudentStatusPill,
  StudentWorkspaceShell,
  studentCardClasses,
} from '../../components/student/StudentWorkspaceChrome';
import {
  buildEffectiveSubmittedAssignmentIds,
  describeDueRelative,
  formatShortDate,
  useStudentWorkspace,
} from '../../lib/studentWorkspaceData';
import StudentDeadlineReminders from '../../components/student/StudentDeadlineReminders';

const QUICK_LINKS: { to: string; label: string; description: string; icon: typeof Home; tint: string }[] = [
  {
    to: '/assignments',
    label: 'Submit Work',
    description: 'Quick path or per-task uploads',
    icon: Upload,
    tint: 'bg-[#84001B] text-[#ffd21a]',
  },
  {
    to: '/my-submissions',
    label: 'Submission Status',
    description: 'Scores, feedback, and remove uploads',
    icon: FileText,
    tint: 'bg-blue-50 text-blue-700',
  },
  {
    to: '/tasks',
    label: 'Tasks',
    description: 'A focused to-do view with due dates',
    icon: ListChecks,
    tint: 'bg-rose-100 text-[#84001B]',
  },
  {
    to: '/boards',
    label: 'Boards',
    description: 'Kanban across submission status',
    icon: ClipboardList,
    tint: 'bg-amber-100 text-amber-800',
  },
  {
    to: '/calendar',
    label: 'Calendar',
    description: 'Due dates and what you sent',
    icon: Calendar,
    tint: 'bg-emerald-50 text-emerald-700',
  },
  {
    to: '/drive',
    label: 'Drive',
    description: 'Every file you have uploaded',
    icon: Folder,
    tint: 'bg-sky-50 text-sky-700',
  },
  {
    to: '/sheets',
    label: 'Sheets',
    description: 'Spreadsheet of submissions and scores',
    icon: Table2,
    tint: 'bg-violet-50 text-violet-700',
  },
  {
    to: '/analytics',
    label: 'Analytics',
    description: 'Average score, on-time rate, by type',
    icon: BarChart3,
    tint: 'bg-slate-100 text-slate-700',
  },
  {
    to: '/team-14',
    label: 'Team 14',
    description: 'Your team roster and emails',
    icon: Sparkles,
    tint: 'bg-[#ffd21a]/40 text-[#84001B]',
  },
];

export default function StudentDashboard() {
  const { user } = useAuth();
  const { loading, assignments, submissions } = useStudentWorkspace();

  const submittedAssignmentIds = useMemo(
    () => buildEffectiveSubmittedAssignmentIds(submissions),
    [submissions]
  );

  const openAssignments = useMemo(
    () =>
      assignments.filter((a) => a.status === 'active' && !submittedAssignmentIds.has(a.id)),
    [assignments, submittedAssignmentIds]
  );

  const reviewed = submissions.filter((s) => s.status === 'reviewed');
  const resubmit = submissions.filter((s) => s.status === 'resubmit');
  const inReview = submissions.filter((s) => s.status === 'under_review');
  const reviewedScores = reviewed.filter((s) => s.score != null) as Array<typeof reviewed[number] & { score: number }>;
  const avgScore = reviewedScores.length
    ? Math.round(reviewedScores.reduce((acc, s) => acc + s.score, 0) / reviewedScores.length)
    : null;

  const overdue = openAssignments.filter((a) => describeDueRelative(a.due_date).tone === 'overdue');
  const dueSoon = openAssignments
    .map((a) => ({ a, due: describeDueRelative(a.due_date) }))
    .filter((x) => x.due.tone === 'today' || x.due.tone === 'soon')
    .sort((a, b) => (a.due.days ?? 99) - (b.due.days ?? 99))
    .slice(0, 4);

  const recentSubs = submissions.slice(0, 5);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = user?.full_name?.split(/\s+/)[0] ?? 'there';

  return (
    <StudentWorkspaceShell>
      <StudentPageHero
        eyebrow={`${greeting}${user?.full_name ? `, ${firstName}` : ''}`}
        title="Your student workspace"
        icon={Home}
        description={
          <>
            Track open assignments, sent work, and grading outcomes. Use the shortcuts below to jump into Tasks, Boards,
            Calendar, Drive, Sheets, or Analytics.
          </>
        }
        kpis={[
          { label: 'Open', value: loading ? '—' : openAssignments.length },
          { label: 'Sent', value: loading ? '—' : submissions.length, accent: 'yellow' },
          { label: 'Avg', value: loading ? '—' : avgScore != null ? `${avgScore}%` : '—' },
        ]}
      />

      <StudentDeadlineReminders />

      {!loading && resubmit.length > 0 && (
        <div
          role="alert"
          className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 flex gap-3 items-start shadow-sm"
        >
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" aria-hidden />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold text-red-950">
              Your instructor requested a revised upload ({resubmit.length} file{resubmit.length !== 1 ? 's' : ''})
            </p>
            <p className="text-red-900/90 mt-1">
              Open Submission Status to read feedback and submit again.
            </p>
            <Link
              to="/my-submissions"
              className="inline-flex items-center gap-1 mt-3 text-sm font-semibold text-red-900 underline hover:text-red-950"
            >
              Go to Submission Status
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

      {!loading && overdue.length > 0 && (
        <div
          role="alert"
          className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 flex gap-3 items-start shadow-sm"
        >
          <Clock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" aria-hidden />
          <div className="min-w-0 flex-1 text-sm text-amber-950">
            <p className="font-semibold">{overdue.length} task{overdue.length !== 1 ? 's are' : ' is'} past due</p>
            <p className="mt-0.5 text-xs text-amber-900/90">
              Send what you have — late uploads still reach your teacher.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {[
          { label: 'Open assignments', value: openAssignments.length, Icon: ClipboardList, link: '/tasks', accent: 'bg-[#84001B] text-white' },
          { label: 'Sent submissions', value: submissions.length, Icon: FileText, link: '/my-submissions', accent: 'bg-blue-600 text-white' },
          { label: 'Graded', value: reviewed.length, Icon: CheckCircle2, link: '/sheets', accent: 'bg-emerald-600 text-white' },
          { label: 'Avg score', value: avgScore != null ? `${avgScore}%` : '—', Icon: Star, link: '/analytics', accent: 'bg-amber-500 text-white' },
        ].map(({ label, value, Icon, link, accent }) => (
          <Link key={label} to={link} className="group">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-md hover:border-[#84001B]/25 transition-all">
              <div className={`w-12 h-12 ${accent} rounded-xl flex items-center justify-center mb-4`}>
                <Icon className="w-6 h-6" aria-hidden />
              </div>
              <p className="text-2xl font-bold text-slate-900 tabular-nums">{loading ? '—' : value}</p>
              <p className="text-xs uppercase tracking-wide text-slate-400 mt-1 font-semibold">{label}</p>
            </div>
          </Link>
        ))}
      </div>

      <section className="mb-8">
        <div className="flex items-end justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Workspace shortcuts</h2>
          <Link to="/team-14" className="text-xs font-semibold text-[#84001B] hover:underline">
            Open team roster →
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {QUICK_LINKS.map(({ to, label, description, icon: Icon, tint }) => (
            <Link
              key={to}
              to={to}
              className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md hover:border-[#84001B]/30 transition-all"
            >
              <div className={`w-10 h-10 rounded-xl ${tint} flex items-center justify-center mb-3`}>
                <Icon className="w-5 h-5" aria-hidden />
              </div>
              <p className="text-sm font-bold text-slate-900">{label}</p>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug line-clamp-2">{description}</p>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className={`${studentCardClasses} p-5`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-slate-900">Recent submissions</h2>
            <Link to="/my-submissions" className="text-xs font-semibold text-[#84001B] hover:underline flex items-center gap-1">
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          {loading ? (
            <SkList />
          ) : recentSubs.length === 0 ? (
            <Empty icon={<FileText className="w-8 h-8" />} text="No submissions yet" />
          ) : (
            <ul className="space-y-2">
              {recentSubs.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  <div className="w-9 h-9 bg-[#84001B]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-[#84001B]" aria-hidden />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{s.file_name}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {s.assignment_title || 'General queue'} · {formatShortDate(s.submitted_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {s.status === 'reviewed' && s.score != null && (
                      <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                        {s.score}%
                      </span>
                    )}
                    <StudentStatusPill status={s.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={`${studentCardClasses} p-5`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-slate-900">Due soon</h2>
            <Link to="/calendar" className="text-xs font-semibold text-[#84001B] hover:underline flex items-center gap-1">
              Open calendar <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          {loading ? (
            <SkList />
          ) : dueSoon.length === 0 && openAssignments.length === 0 ? (
            <Empty icon={<ClipboardList className="w-8 h-8" />} text="No open assignments" />
          ) : dueSoon.length === 0 ? (
            <Empty icon={<Clock className="w-8 h-8" />} text="No due dates set yet" />
          ) : (
            <ul className="space-y-2">
              {dueSoon.map(({ a, due }) => (
                <li
                  key={a.id}
                  className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  <div className="w-9 h-9 bg-[#ffd21a]/30 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-[#84001B]">{a.document_type}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{a.title}</p>
                    <p className="text-[11px] text-slate-500 truncate">{due.label}</p>
                  </div>
                  <Link
                    to="/assignments"
                    className="text-[11px] font-bold text-[#84001B] hover:underline whitespace-nowrap"
                  >
                    Turn in →
                  </Link>
                </li>
              ))}
              {inReview.length > 0 && (
                <li className="text-[11px] text-slate-500 mt-3 px-1">
                  {inReview.length} submission{inReview.length !== 1 ? 's' : ''} currently under review.
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </StudentWorkspaceShell>
  );
}

function SkList() {
  return (
    <div className="space-y-2">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
      ))}
    </div>
  );
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-slate-300">
      <div className="mb-2">{icon}</div>
      <p className="text-sm text-slate-400">{text}</p>
    </div>
  );
}

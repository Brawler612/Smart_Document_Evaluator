import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ListChecks,
  Search,
  AlertTriangle,
  Clock,
  Calendar,
  CheckCircle2,
  Upload,
  ChevronRight,
  RotateCcw,
  FileText,
} from 'lucide-react';
import {
  StudentPageHero,
  StudentStatusPill,
  StudentWorkspaceShell,
  studentCardClasses,
} from '../../components/student/StudentWorkspaceChrome';
import {
  buildEffectiveSubmittedAssignmentIds,
  buildLatestSubmissionByAssignment,
  buildResubmitHref,
  describeDueRelative,
  formatShortDate,
  useStudentWorkspace,
  type StudentAssignmentRow,
} from '../../lib/studentWorkspaceData';
import { SubmissionOpenLink, submissionHasOpenableFileUrl } from '../../components/SubmissionOpenLink';

type Group = 'overdue' | 'today' | 'thisWeek' | 'later' | 'noDate';
type GroupedItem = { a: StudentAssignmentRow; due: ReturnType<typeof describeDueRelative> };

const GROUP_TITLES: Record<Group, string> = {
  overdue: 'Overdue',
  today: 'Due today',
  thisWeek: 'This week',
  later: 'Later',
  noDate: 'No due date',
};

const GROUP_TONE: Record<Group, string> = {
  overdue: 'border-red-200 bg-red-50/70 text-red-800',
  today: 'border-amber-200 bg-amber-50/70 text-amber-900',
  thisWeek: 'border-[#ffd21a]/60 bg-[#ffd21a]/15 text-[#5c0014]',
  later: 'border-slate-200 bg-slate-50 text-slate-700',
  noDate: 'border-slate-200 bg-white text-slate-700',
};

function groupOf(item: GroupedItem): Group {
  const t = item.due.tone;
  if (t === 'overdue') return 'overdue';
  if (t === 'today') return 'today';
  if (t === 'soon') return 'thisWeek';
  if (t === 'future') return 'later';
  return 'noDate';
}

export default function StudentTasks() {
  const { loading, assignments, submissions } = useStudentWorkspace();
  const [search, setSearch] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);

  /** Excludes `resubmit` rows so teacher-flagged work re-appears as needing action. */
  const effectivelyDoneIds = useMemo(
    () => buildEffectiveSubmittedAssignmentIds(submissions),
    [submissions]
  );

  const submissionByAssignment = useMemo(
    () => buildLatestSubmissionByAssignment(submissions),
    [submissions]
  );

  const redoCount = useMemo(
    () => submissions.filter((s) => s.status === 'resubmit').length,
    [submissions]
  );

  const filteredAssignments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assignments
      .filter((a) => a.status === 'active')
      .filter((a) => {
        if (q) {
          const hay = `${a.title} ${a.document_type} ${a.description ?? ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (!showCompleted && effectivelyDoneIds.has(a.id)) return false;
        return true;
      });
  }, [assignments, search, showCompleted, effectivelyDoneIds]);

  const groups: Record<Group, GroupedItem[]> = {
    overdue: [],
    today: [],
    thisWeek: [],
    later: [],
    noDate: [],
  };
  filteredAssignments.forEach((a) => {
    const item: GroupedItem = { a, due: describeDueRelative(a.due_date) };
    groups[groupOf(item)].push(item);
  });

  const order: Group[] = ['overdue', 'today', 'thisWeek', 'later', 'noDate'];

  const totalOpen = assignments.filter((a) => a.status === 'active' && !effectivelyDoneIds.has(a.id)).length;
  const totalDone = assignments.filter((a) => effectivelyDoneIds.has(a.id)).length;

  return (
    <StudentWorkspaceShell>
      <StudentPageHero
        eyebrow="Workspace · Tasks"
        title="Tasks"
        icon={ListChecks}
        description="A focused to-do view of your active assignments. Grouped by urgency so the most important work is always at the top."
        kpis={[
          { label: 'Open', value: loading ? '—' : totalOpen },
          { label: 'Done', value: loading ? '—' : totalDone, accent: 'yellow' },
          { label: 'Redo', value: loading ? '—' : redoCount },
          { label: 'Overdue', value: loading ? '—' : groups.overdue.length },
        ]}
      />

      {!loading && redoCount > 0 && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/85 px-4 py-3 shadow-sm"
        >
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" aria-hidden />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-bold text-red-950">
              {redoCount === 1
                ? '1 submission needs a redo'
                : `${redoCount} submissions need a redo`}
            </p>
            <p className="mt-0.5 text-[12px] text-red-900/90 leading-relaxed">
              Your instructor flagged{' '}
              {redoCount === 1 ? 'an upload' : `${redoCount} uploads`} as needing a revised file. Tap{' '}
              <span className="font-semibold">Resubmit</span> on each task below to upload a new version.
            </p>
          </div>
        </div>
      )}

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:min-w-[300px] flex-1 sm:flex-none">
          <Search
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
            aria-hidden
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, document type, or description…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B]/40 bg-white shadow-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm cursor-pointer hover:bg-slate-50">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
              className="accent-[#84001B]"
            />
            Show completed
          </label>
          <Link
            to="/assignments"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#84001B] px-3.5 py-2 text-xs font-bold text-[#ffd21a] shadow-md shadow-[#84001B]/20 hover:bg-[#6b0016] transition-colors"
          >
            <Upload className="w-3.5 h-3.5" aria-hidden /> Submit
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filteredAssignments.length === 0 ? (
        <div className={`${studentCardClasses} p-10 text-center`}>
          <div className="mx-auto w-14 h-14 rounded-2xl bg-[#84001B]/10 flex items-center justify-center text-[#84001B] mb-3">
            <ListChecks className="w-7 h-7" aria-hidden />
          </div>
          <h3 className="font-bold text-slate-900">All clear</h3>
          <p className="text-sm text-slate-500 mt-1.5 max-w-sm mx-auto">
            Nothing matches the current filter. Try toggling{' '}
            <span className="font-semibold text-slate-700">Show completed</span> or clearing the search.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {order.map((g) => {
            const items = groups[g];
            if (items.length === 0) return null;
            return (
              <section key={g}>
                <div
                  className={`flex items-center justify-between gap-2 mb-3 px-3 py-2 rounded-xl border ${GROUP_TONE[g]}`}
                >
                  <div className="flex items-center gap-2">
                    {g === 'overdue' ? (
                      <AlertTriangle className="w-4 h-4" aria-hidden />
                    ) : g === 'today' ? (
                      <Clock className="w-4 h-4" aria-hidden />
                    ) : g === 'noDate' ? (
                      <Calendar className="w-4 h-4 opacity-60" aria-hidden />
                    ) : (
                      <Clock className="w-4 h-4" aria-hidden />
                    )}
                    <span className="text-[11px] font-bold uppercase tracking-wide">{GROUP_TITLES[g]}</span>
                  </div>
                  <span className="text-[10px] font-bold tabular-nums">{items.length}</span>
                </div>
                <ul className="space-y-2">
                  {items.map(({ a, due }) => {
                    const sub = submissionByAssignment.get(a.id);
                    const needsRedo = sub?.status === 'resubmit';
                    const done = !!sub && !needsRedo;
                    return (
                      <li
                        key={a.id}
                        className={`relative overflow-hidden rounded-2xl border bg-white p-4 transition-all ${
                          needsRedo
                            ? 'border-red-300 ring-2 ring-red-100 shadow-sm'
                            : done
                            ? 'border-slate-200/80 opacity-90'
                            : 'border-slate-200/90 hover:shadow-md hover:border-[#84001B]/25'
                        }`}
                      >
                        {needsRedo && (
                          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-red-500 to-red-400" aria-hidden />
                        )}
                        <div className="flex items-start gap-4">
                          <button
                            type="button"
                            disabled={!done && !needsRedo}
                            aria-label={
                              needsRedo
                                ? 'Needs redo — upload a new file'
                                : done
                                ? 'Submitted'
                                : 'Mark as submitted'
                            }
                            className={`mt-0.5 w-6 h-6 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                              needsRedo
                                ? 'bg-red-50 border-red-400 text-red-600'
                                : done
                                ? 'bg-emerald-500 border-emerald-600 text-white'
                                : 'bg-white border-slate-300 hover:border-[#84001B]'
                            }`}
                          >
                            {needsRedo ? (
                              <RotateCcw className="w-3.5 h-3.5" aria-hidden />
                            ) : done ? (
                              <CheckCircle2 className="w-4 h-4" aria-hidden />
                            ) : null}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3
                                className={`font-bold truncate ${
                                  done ? 'text-slate-500 line-through' : 'text-slate-900'
                                }`}
                              >
                                {a.title}
                              </h3>
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide bg-rose-100 text-[#84001B]">
                                {a.document_type}
                              </span>
                              {sub && <StudentStatusPill status={sub.status} />}
                              {needsRedo && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-red-600 text-white px-2 py-0.5 rounded-full">
                                  <RotateCcw className="w-3 h-3" aria-hidden />
                                  Needs redo
                                </span>
                              )}
                            </div>
                            {a.description && !done && !needsRedo && (
                              <p className="text-sm text-slate-500 mt-1 line-clamp-2">{a.description}</p>
                            )}
                            {needsRedo && sub && (
                              <div className="mt-2 rounded-xl border border-red-200 bg-red-50/80 p-2.5 text-[12px] text-red-950">
                                <p className="font-semibold mb-1 flex items-center gap-1.5">
                                  <AlertTriangle className="w-3.5 h-3.5 text-red-600" aria-hidden />
                                  Teacher requested a new file
                                </p>
                                {sub.feedback && (
                                  <p className="leading-relaxed text-red-900/90 line-clamp-3 mb-1.5">{sub.feedback}</p>
                                )}
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-900/80">
                                    <FileText className="w-3 h-3" aria-hidden />
                                    Previous file:{' '}
                                    <span className="font-mono truncate max-w-[14rem]">{sub.file_name}</span>
                                  </span>
                                  {submissionHasOpenableFileUrl(sub.file_url) && (
                                    <SubmissionOpenLink
                                      raw={sub.file_url!}
                                      fileName={sub.file_name}
                                      className="text-[11px] font-semibold text-red-800 underline underline-offset-2 hover:text-red-950"
                                    >
                                      Open previous
                                    </SubmissionOpenLink>
                                  )}
                                </div>
                              </div>
                            )}
                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
                                <Calendar className="w-3 h-3" aria-hidden />
                                {due.label}
                              </span>
                              {sub && (
                                <span className="text-[11px] text-slate-500">
                                  {needsRedo ? 'Previous attempt sent ' : 'Sent '}
                                  {formatShortDate(sub.submitted_at)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0">
                            {needsRedo && sub ? (
                              <Link
                                to={buildResubmitHref(sub)}
                                className="inline-flex items-center gap-1.5 bg-red-600 text-white text-xs px-3 py-2 rounded-xl hover:bg-red-700 font-bold shadow-sm whitespace-nowrap"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                Resubmit
                              </Link>
                            ) : done ? (
                              <Link
                                to="/my-submissions"
                                className="text-xs font-semibold text-[#84001B] hover:underline whitespace-nowrap"
                              >
                                View status →
                              </Link>
                            ) : (
                              <Link
                                to="/assignments"
                                className="inline-flex items-center gap-1 bg-[#84001B] text-white text-xs px-3 py-2 rounded-xl hover:bg-[#6b0016] font-semibold shadow-sm whitespace-nowrap"
                              >
                                Turn in <ChevronRight className="w-3 h-3" />
                              </Link>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </StudentWorkspaceShell>
  );
}

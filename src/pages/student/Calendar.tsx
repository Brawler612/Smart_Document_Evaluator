import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CheckCircle2,
  AlertTriangle,
  Star,
  Upload,
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
  type StudentAssignmentRow,
  type StudentSubmissionRow,
} from '../../lib/studentWorkspaceData';

type CalendarEvent =
  | { kind: 'due'; iso: string; assignment: StudentAssignmentRow; isLate: boolean; isMet: boolean }
  | { kind: 'submission'; iso: string; submission: StudentSubmissionRow };

function monthLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function buildMonthGrid(anchor: Date): Date[] {
  const first = startOfMonth(anchor);
  const dayOfWeek = first.getDay();
  const start = new Date(first);
  start.setDate(first.getDate() - dayOfWeek);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(d);
  }
  return cells;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function StudentCalendar() {
  const { loading, assignments, submissions } = useStudentWorkspace();
  const [anchor, setAnchor] = useState<Date>(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<Date>(() => new Date());

  const submittedAssignmentIds = useMemo(
    () => buildEffectiveSubmittedAssignmentIds(submissions),
    [submissions]
  );

  const events: CalendarEvent[] = useMemo(() => {
    const evs: CalendarEvent[] = [];
    assignments.forEach((a) => {
      if (!a.due_date) return;
      const isMet = submittedAssignmentIds.has(a.id);
      const isLate = !isMet && new Date(a.due_date).getTime() < Date.now();
      evs.push({ kind: 'due', iso: a.due_date, assignment: a, isLate, isMet });
    });
    submissions.forEach((s) => {
      evs.push({ kind: 'submission', iso: s.submitted_at, submission: s });
    });
    return evs;
  }, [assignments, submissions, submittedAssignmentIds]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach((e) => {
      const d = new Date(e.iso);
      if (Number.isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    });
    return map;
  }, [events]);

  const cells = buildMonthGrid(anchor);
  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const today = new Date();

  const selectedEvents = eventsByDay.get(dayKey(selected)) ?? [];
  const monthEvents = events.filter((e) => {
    const d = new Date(e.iso);
    return d.getFullYear() === anchor.getFullYear() && d.getMonth() === anchor.getMonth();
  });
  const monthDue = monthEvents.filter((e) => e.kind === 'due').length;
  const monthSent = monthEvents.filter((e) => e.kind === 'submission').length;

  function shiftMonth(delta: number) {
    setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1));
  }

  return (
    <StudentWorkspaceShell>
      <StudentPageHero
        eyebrow="Workspace · Calendar"
        title="Calendar"
        icon={Calendar}
        description="Due dates and submission events on a familiar month grid. Click any day to see what's happening."
        kpis={[
          { label: 'Month due', value: loading ? '—' : monthDue },
          { label: 'Month sent', value: loading ? '—' : monthSent, accent: 'yellow' },
          { label: 'Today', value: today.getDate() },
        ]}
      />

      <div className="grid lg:grid-cols-[1fr,320px] gap-5">
        <div className={`${studentCardClasses} overflow-hidden`}>
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50/60">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden />
            </button>
            <div className="flex items-center gap-3 min-w-0">
              <h2 className="font-bold text-slate-900 text-base truncate">{monthLabel(anchor)}</h2>
              <button
                type="button"
                onClick={() => {
                  setAnchor(startOfMonth(new Date()));
                  setSelected(new Date());
                }}
                className="text-[11px] font-semibold uppercase tracking-wide text-[#84001B] hover:underline"
              >
                Today
              </button>
            </div>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            >
              <ChevronRight className="w-4 h-4" aria-hidden />
            </button>
          </div>

          <div className="grid grid-cols-7 border-b border-slate-100">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-center"
              >
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {cells.map((d) => {
              const inMonth = d.getMonth() === anchor.getMonth();
              const isToday = sameDay(d, today);
              const isSelected = sameDay(d, selected);
              const dayEvents = eventsByDay.get(dayKey(d)) ?? [];
              const dueEvents = dayEvents.filter((e) => e.kind === 'due');
              const sentEvents = dayEvents.filter((e) => e.kind === 'submission');
              const hasOverdue = dueEvents.some((e) => e.kind === 'due' && e.isLate);
              return (
                <button
                  key={dayKey(d)}
                  type="button"
                  onClick={() => setSelected(new Date(d))}
                  aria-pressed={isSelected}
                  className={`relative text-left min-h-[88px] border-b border-r border-slate-100 px-2 py-1.5 transition-colors ${
                    inMonth ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/40 hover:bg-slate-50'
                  } ${isSelected ? 'ring-2 ring-[#84001B] ring-offset-[-2px] z-[1]' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold tabular-nums ${
                        isToday
                          ? 'bg-[#84001B] text-white'
                          : inMonth
                          ? 'text-slate-700'
                          : 'text-slate-400'
                      }`}
                    >
                      {d.getDate()}
                    </span>
                    {hasOverdue && <AlertTriangle className="w-3 h-3 text-red-500" aria-hidden />}
                  </div>
                  <div className="mt-1 space-y-1">
                    {dueEvents.slice(0, 2).map((e, i) =>
                      e.kind === 'due' ? (
                        <div
                          key={`due-${e.assignment.id}-${i}`}
                          className={`truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                            e.isMet
                              ? 'bg-emerald-50 text-emerald-700 line-through opacity-80'
                              : e.isLate
                              ? 'bg-red-50 text-red-700'
                              : 'bg-rose-100 text-[#84001B]'
                          }`}
                          title={`Due: ${e.assignment.title}`}
                        >
                          {e.assignment.title}
                        </div>
                      ) : null
                    )}
                    {sentEvents.slice(0, 1).map((e, i) =>
                      e.kind === 'submission' ? (
                        <div
                          key={`sub-${e.submission.id}-${i}`}
                          className="truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-blue-50 text-blue-700"
                          title={`Sent: ${e.submission.file_name}`}
                        >
                          ↑ {e.submission.assignment_title || e.submission.file_name}
                        </div>
                      ) : null
                    )}
                    {dayEvents.length > 3 && (
                      <p className="text-[10px] text-slate-400 px-1">+{dayEvents.length - 3} more</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <aside className={`${studentCardClasses} p-4 self-start sticky top-4`}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {selected.toLocaleDateString(undefined, { weekday: 'long' })}
              </p>
              <h3 className="text-base font-bold text-slate-900">{formatShortDate(selected.toISOString())}</h3>
            </div>
            <Link
              to="/assignments"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#84001B] px-3 py-1.5 text-[11px] font-bold text-[#ffd21a] hover:bg-[#6b0016] transition-colors"
            >
              <Upload className="w-3 h-3" aria-hidden /> Submit
            </Link>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-12 rounded-xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : selectedEvents.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2" aria-hidden />
              <p className="text-sm text-slate-500">Nothing on this day.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {selectedEvents.map((e, i) =>
                e.kind === 'due' ? (
                  <li
                    key={`due-side-${i}`}
                    className={`rounded-xl border px-3 py-2.5 ${
                      e.isMet
                        ? 'border-emerald-100 bg-emerald-50/60'
                        : e.isLate
                        ? 'border-red-200 bg-red-50/60'
                        : 'border-rose-200 bg-rose-50/40'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <ClipboardList
                        className={`w-3.5 h-3.5 ${
                          e.isMet ? 'text-emerald-600' : e.isLate ? 'text-red-500' : 'text-[#84001B]'
                        }`}
                        aria-hidden
                      />
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-600">
                        Due · {e.assignment.document_type}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-slate-900 leading-snug">{e.assignment.title}</p>
                    {e.isMet ? (
                      <p className="text-[11px] text-emerald-700 mt-1 font-semibold">Submitted ✓</p>
                    ) : e.isLate ? (
                      <p className="text-[11px] text-red-700 mt-1 font-semibold">Past due — send what you have</p>
                    ) : null}
                  </li>
                ) : (
                  <li
                    key={`sent-side-${i}`}
                    className="rounded-xl border border-blue-100 bg-blue-50/50 px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" aria-hidden />
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-600">
                        Submitted · {e.submission.submission_doc_type || e.submission.assignment_doc_type || 'SPP'}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-slate-900 leading-snug truncate">
                      {e.submission.assignment_title || e.submission.file_name}
                    </p>
                    {e.submission.score != null && (
                      <p className="text-[11px] text-amber-700 mt-1 font-semibold flex items-center gap-1">
                        <Star className="w-3 h-3" aria-hidden /> Scored {e.submission.score}%
                      </p>
                    )}
                  </li>
                )
              )}
            </ul>
          )}

          <hr className="my-4 border-slate-100" />
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">Legend</p>
          <ul className="text-[11px] text-slate-600 space-y-1.5">
            <li className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-rose-200" /> Due upcoming
            </li>
            <li className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-red-200" /> Overdue
            </li>
            <li className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-emerald-200" /> Met deadline
            </li>
            <li className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-blue-200" /> Submission event
            </li>
          </ul>
        </aside>
      </div>
    </StudentWorkspaceShell>
  );
}

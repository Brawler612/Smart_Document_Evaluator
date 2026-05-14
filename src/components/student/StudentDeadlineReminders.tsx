import { useMemo, useEffect, useState, useCallback } from 'react';
import { AlarmClock, Bell, X } from 'lucide-react';
import {
  buildEffectiveSubmittedAssignmentIds,
  describeDueRelative,
  useStudentWorkspace,
} from '../../lib/studentWorkspaceData';

const DISMISS_PREFIX = 'sde:deadline-dismiss:';
const BROWSER_NOTIF_PREFIX = 'sde:deadline-notif-day:';

function hoursUntilDue(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (t - Date.now()) / 3600000;
}

function readDismissed(id: string): boolean {
  try {
    return Boolean(sessionStorage.getItem(DISMISS_PREFIX + id));
  } catch {
    return false;
  }
}

function dismissId(id: string) {
  try {
    sessionStorage.setItem(DISMISS_PREFIX + id, '1');
  } catch {
    /* ignore */
  }
}

/**
 * In-app (and optional browser) reminders for upcoming assignment deadlines.
 * Mount on student pages that already use `useStudentWorkspace` to avoid duplicate fetches.
 */
export default function StudentDeadlineReminders() {
  const { loading, assignments, submissions } = useStudentWorkspace();
  const [, bump] = useState(0);
  const force = useCallback(() => bump((n) => n + 1), []);

  const doneIds = useMemo(() => buildEffectiveSubmittedAssignmentIds(submissions), [submissions]);

  const urgent = useMemo(() => {
    return assignments
      .filter((a) => a.status === 'active' && !doneIds.has(a.id) && a.due_date)
      .map((a) => ({ a, hours: hoursUntilDue(a.due_date)!, rel: describeDueRelative(a.due_date) }))
      .filter((x) => x.hours <= 72 || x.rel.tone === 'overdue')
      .filter((x) => !readDismissed(x.a.id))
      .sort((x, y) => x.hours - y.hours);
  }, [assignments, doneIds]);

  useEffect(() => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (urgent.length === 0) return;
    const day = new Date().toDateString();
    for (const { a, hours } of urgent) {
      if (hours > 36 || hours < -168) continue;
      const key = `${BROWSER_NOTIF_PREFIX}${a.id}:${day}`;
      try {
        if (localStorage.getItem(key)) continue;
        localStorage.setItem(key, '1');
      } catch {
        continue;
      }
      const body =
        hours < 0
          ? 'This task is past due — submit when you can.'
          : hours < 24
            ? `Due in about ${Math.max(1, Math.round(hours))} hours.`
            : `Due ${describeDueRelative(a.due_date).label}.`;
      try {
        new Notification(`Deadline: ${a.title}`, { body });
      } catch {
        /* ignore */
      }
    }
  }, [urgent]);

  if (loading || urgent.length === 0) return null;

  return (
    <div className="mb-5 space-y-2" role="region" aria-label="Deadline reminders">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
          <AlarmClock className="w-3.5 h-3.5 text-amber-600" aria-hidden />
          Deadline reminders
        </p>
        {typeof Notification !== 'undefined' && Notification.permission === 'default' && (
          <button
            type="button"
            onClick={async () => {
              try {
                await Notification.requestPermission();
              } catch {
                /* ignore */
              }
              force();
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-950 hover:bg-amber-100"
          >
            <Bell className="w-3 h-3" aria-hidden />
            Browser alerts
          </button>
        )}
      </div>
      {urgent.map(({ a, hours, rel }) => (
        <div
          key={a.id}
          className={`flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-sm ${
            hours < 0 || rel.tone === 'overdue'
              ? 'border-red-200 bg-red-50/90 text-red-950'
              : 'border-amber-200 bg-amber-50/90 text-amber-950'
          }`}
        >
          <AlarmClock className="w-5 h-5 shrink-0 mt-0.5 opacity-80" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-snug">{a.title}</p>
            <p className="text-[12px] mt-0.5 opacity-90 leading-relaxed">
              {rel.label}
              {hours >= 0 && hours <= 72 ? ` · ${Math.max(0, Math.round(hours))}h on the clock` : null}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              dismissId(a.id);
              force();
            }}
            className="shrink-0 rounded-lg p-1 text-current opacity-60 hover:opacity-100 hover:bg-white/50"
            aria-label="Dismiss reminder"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

import type { SubStatus } from '../types';
import type { TeacherSubmission } from './teacherSubmissionLoad';

const STATUS_COLORS: Record<SubStatus, string> = {
  submitted: 'bg-blue-100 text-blue-700',
  under_review: 'bg-amber-100 text-amber-700',
  reviewed: 'bg-green-100 text-green-700',
  resubmit: 'bg-red-100 text-red-700',
};

function dueWindowEndMs(dueIso: string): number {
  const t = dueIso.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const [y, m, day] = t.split('-').map(Number);
    return new Date(y, m - 1, day, 23, 59, 59, 999).getTime();
  }
  return new Date(t).getTime();
}

export function formatStackedDateTime(iso: string | null | undefined): { line1: string; line2: string } {
  if (!iso) return { line1: '—', line2: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { line1: '—', line2: '' };
  return {
    line1: d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: 'numeric' }),
    line2: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
  };
}

export function rosterStatusChip(s: TeacherSubmission): { label: string; className: string; showCheck?: boolean } {
  const due = s.assignments?.due_date?.trim();
  const subMs = new Date(s.submitted_at).getTime();
  if (due) {
    const end = dueWindowEndMs(due);
    if (!Number.isNaN(subMs) && !Number.isNaN(end)) {
      return subMs <= end
        ? { label: 'ON TIME', className: 'bg-emerald-100 text-emerald-800', showCheck: true }
        : { label: 'LATE', className: 'bg-rose-100 text-rose-800' };
    }
  }
  return {
    label: s.status.replace('_', ' ').toUpperCase(),
    className: STATUS_COLORS[s.status],
  };
}

export function studentIdBadge(s: TeacherSubmission): string {
  const num = s.users?.student_number?.trim();
  if (num) return `# ${num}`;
  const id = s.student_id?.trim();
  if (!id) return '—';
  if (id.length > 10) return `# ${id.slice(0, 8)}…`;
  return `# ${id}`;
}

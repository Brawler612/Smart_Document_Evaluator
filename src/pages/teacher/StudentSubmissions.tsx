import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  RefreshCw,
  Download,
  ExternalLink,
  GraduationCap,
  Sparkles,
  FileText,
  ChevronRight,
  ClipboardList,
  Trash2,
} from 'lucide-react';
import { syncAllLocalSubmissionsToSupabase } from '../../lib/localSubmissionSync';
import {
  fetchTeacherSubmissionRows,
  type TeacherSubmission,
} from '../../lib/teacherSubmissionLoad';
import { performTeacherResubmitRequest } from '../../lib/teacherResubmitRequest';
import { deleteTeacherSubmissionsByIds } from '../../lib/teacherDeleteSubmissions';
import { SubmissionOpenLink, submissionHasOpenableFileUrl } from '../../components/SubmissionOpenLink';
import TeacherSubmissionRosterTable from '../../components/teacher/TeacherSubmissionRosterTable';
import UserAvatar from '../../components/UserAvatar';
import {
  TeacherAmberCue,
  TeacherPageHeader,
  TeacherSearchSurface,
  TeacherWorkspaceShell,
  teacherRoundedTableShell,
} from '../../components/teacher/TeacherWorkspaceChrome';
import { gradingLinkForSubmission, isPlausibleSubmissionId } from '../../lib/gradingRoutes';
import { submissionDisplayStatusForRoster, submissionHasViewableAiScore, submissionHasViewableTeacherScore } from '../../lib/submissionRosterPresentation';
import type { SubStatus } from '../../types';
import TeacherViewScoreModal from '../../components/teacher/TeacherViewScoreModal';

const STATUS_CHIP: Record<SubStatus, string> = {
  submitted: 'border-l-[#84001B] bg-rose-50/80',
  under_review: 'border-l-amber-500 bg-amber-50/40',
  reviewed: 'border-l-[#6b0014] bg-rose-50/50',
  resubmit: 'border-l-red-600 bg-red-50/40',
};

const STATUS_LABEL: Record<SubStatus, string> = {
  submitted: 'Needs first look',
  under_review: 'In review',
  reviewed: 'Graded',
  resubmit: 'Resubmit requested',
};

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

export default function StudentSubmissions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<TeacherSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<SubStatus | 'all'>('all');
  const [resubmitSavingId, setResubmitSavingId] = useState<string | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  /** Manual Sync spinner. Independent from `loading` so we never flash the table skeleton on a refresh. */
  const [syncing, setSyncing] = useState(false);
  /** Brief highlight after deep-link from Inbox (Review). */
  const [jumpHighlightId, setJumpHighlightId] = useState<string | null>(null);
  const [viewScoreOpen, setViewScoreOpen] = useState<{ row: TeacherSubmission; focus: 'ai' | 'teacher' } | null>(null);

  /**
   * `silent` keeps the existing rows visible while we re-fetch, so deletes and visibility refreshes
   * don't trigger the full-table skeleton (which scrolls the user back to the top).
   */
  async function load(options: { silent?: boolean } = {}) {
    if (!options.silent) setLoading(true);
    try {
      await syncAllLocalSubmissionsToSupabase();
      setRows(await fetchTeacherSubmissionRows());
    } catch (e) {
      console.error('[student-submissions]', e);
      if (!options.silent) setRows([]);
    } finally {
      if (!options.silent) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    /** Re-pull silently when the tab regains focus so other-tab edits surface without a flash. */
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void load({ silent: true });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
     
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return rows.filter((s) => {
      if (!(filter === 'all' || s.status === filter)) return false;
      if (!q) return true;
      const hay = [
        s.file_name,
        s.users?.full_name,
        s.users?.email,
        s.student_id,
        s.assignments?.title,
        s.assignments?.document_type,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, filter, search]);

  const tableRows = useMemo(
    () =>
      [...filtered].sort(
        (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
      ),
    [filtered]
  );

  const targetSubmissionId = useMemo(() => {
    const raw = searchParams.get('submission');
    if (!raw || !isPlausibleSubmissionId(raw)) return null;
    try {
      return decodeURIComponent(raw.trim());
    } catch {
      return null;
    }
  }, [searchParams]);

  useEffect(() => {
    if (loading || !targetSubmissionId) return;
    if (!rows.some((r) => r.id === targetSubmissionId)) return;

    const visible = tableRows.some((r) => r.id === targetSubmissionId);
    if (!visible) {
      setSearch('');
      setFilter('all');
      return;
    }

    const timer = window.setTimeout(() => {
      const desktop = document.getElementById(`submission-roster-desktop-${targetSubmissionId}`);
      const mobile = document.getElementById(`submission-roster-mobile-${targetSubmissionId}`);
      const candidates = [desktop, mobile].filter((n): n is HTMLElement => n != null);
      const el = candidates.find((node) => node.offsetParent != null) ?? candidates[0];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setJumpHighlightId(targetSubmissionId);
        window.setTimeout(() => setJumpHighlightId(null), 4500);
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.delete('submission');
            return next;
          },
          { replace: true }
        );
      }
    }, 100);
    return () => window.clearTimeout(timer);
  }, [loading, targetSubmissionId, rows, tableRows, setSearchParams]);

  async function requestResubmitFromRoster(s: TeacherSubmission) {
    const msg = `Request resubmission for “${s.file_name}”?\n\nThe student will see an alert on their dashboard and submissions list asking them to upload a revised file (e.g. empty or incomplete work).`;
    if (!window.confirm(msg)) return;
    setResubmitSavingId(s.id);
    try {
      const result = await performTeacherResubmitRequest({ id: s.id, feedback: s.feedback });
      if (!result.ok) {
        alert(result.message);
        return;
      }
      /** Optimistic chip flip so the user keeps their place without waiting on a refetch. */
      setRows((prev) => prev.map((row) => (row.id === s.id ? { ...row, status: 'resubmit' } : row)));
      void load({ silent: true });
    } finally {
      setResubmitSavingId(null);
    }
  }

  async function deleteSubmissionRow(s: TeacherSubmission) {
    if (!window.confirm(`Delete "${s.file_name}" permanently? This cannot be undone.`)) return;
    setDeleteBusyId(s.id);
    /** Optimistic remove so the page stays steady at the user's scroll position. */
    setRows((prev) => prev.filter((row) => row.id !== s.id));
    try {
      const result = await deleteTeacherSubmissionsByIds([s.id], {
        purgeLocalDuplicatesOf: [{ student_id: s.student_id, file_name: s.file_name, file_url: s.file_url }],
      });
      if (!result.ok) {
        alert(
          `Could not delete from database: ${result.message}\n\nIf permission was denied, add the teacher DELETE policy (see docs/supabase-rls-submissions-teacher-delete.sql).`
        );
      }
      void load({ silent: true });
    } finally {
      setDeleteBusyId(null);
    }
  }

  const summary = useMemo(() => {
    const all = rows;
    return {
      total: all.length,
      newToYou: all.filter((s) => s.status === 'submitted').length,
      inFlight: all.filter((s) => s.status === 'under_review').length,
      done: all.filter((s) => s.status === 'reviewed').length,
      resubmit: all.filter((s) => s.status === 'resubmit').length,
    };
  }, [rows]);

  const byAssignment = useMemo(() => {
    const map = new Map<string, TeacherSubmission[]>();
    for (const s of filtered) {
      const key =
        (s.assignments?.title ?? '').trim() || 'Submissions & uploads';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    const entries = [...map.entries()].map(([title, items]) => ({
      title,
      items: items.sort(
        (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
      ),
    }));
    entries.sort(
      (a, b) =>
        new Date(b.items[0]?.submitted_at ?? 0).getTime() -
        new Date(a.items[0]?.submitted_at ?? 0).getTime()
    );
    return entries;
  }, [filtered]);

  function exportCsv() {
    if (filtered.length === 0) return;
    const headers = ['Student', 'Email', 'Submission', 'Doc type', 'File', 'Status', 'Score', 'Submitted'];
    const body = filtered.map((s) => [
      s.users?.full_name ?? '',
      s.users?.email ?? '',
      s.assignments?.title ?? '',
      s.assignments?.document_type ?? '',
      s.file_name,
      s.status,
      s.score != null ? String(s.score) : '',
      new Date(s.submitted_at).toLocaleString(),
    ]);
    const csv = [headers, ...body]
      .map((line) => line.map((v) => `"${(v || '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `submissions-roster-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <TeacherWorkspaceShell>
      <TeacherPageHeader
        eyebrow="Inbox · Student work"
        title="Submission roster"
        icon={FileText}
        description={
          <>
            Same maroon-brand spreadsheet tooling as{' '}
            <Link className="font-semibold text-[#84001B] hover:underline" to="/class-list">
              Class list
            </Link>{' '}
            and{' '}
            <Link className="font-semibold text-[#84001B] hover:underline" to="/grading">
              Grading workspace
            </Link>
            . Desktop shows the full roster table; phones use grouped cards with Open file, Delete, and the learner name
            link to the grading workspace.
          </>
        }
        actions={
          <>
            <button
              type="button"
              onClick={async () => {
                if (syncing) return;
                setSyncing(true);
                try {
                  await load({ silent: true });
                } finally {
                  setSyncing(false);
                }
              }}
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} aria-hidden />
              Sync roster
            </button>
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Download className="w-3.5 h-3.5" aria-hidden />
              CSV export
            </button>
            <Link
              to="/class-list"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Class list
              <ChevronRight className="w-3.5 h-3.5 opacity-70" aria-hidden />
            </Link>
            <Link
              to="/grading"
              className="inline-flex items-center gap-2 rounded-xl bg-[#84001B] px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-[#84001B]/20 hover:bg-[#6b0016]"
            >
              Grading workspace
              <ChevronRight className="w-3.5 h-3.5" aria-hidden />
            </Link>
          </>
        }
      />

      {!loading && (
        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Overview</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { k: 'New', v: summary.newToYou, hint: 'awaiting review' },
              { k: 'Reviewing', v: summary.inFlight, hint: 'in progress' },
              { k: 'Graded', v: summary.done, hint: 'returned' },
              { k: 'Resubmit', v: summary.resubmit, hint: 'student action' },
            ].map(({ k, v, hint }) => (
              <div
                key={k}
                className="rounded-2xl border border-slate-200/90 bg-white px-4 py-3 shadow-sm border-l-[4px] border-l-[#ffd21a]"
              >
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{k}</p>
                <p className="text-2xl font-bold tabular-nums text-slate-900 mt-0.5">{v}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200/90 px-2.5 py-1 shadow-sm">
              <GraduationCap className="w-3.5 h-3.5 text-[#84001B]" aria-hidden />
              {`${summary.total} files on record`}
            </span>
            {summary.newToYou > 0 && (
              <span className="rounded-full bg-[#84001B] text-white px-2.5 py-0.5 font-semibold text-[11px] shadow-sm">
                {summary.newToYou} unseen
              </span>
            )}
          </p>
        </section>
      )}

      <TeacherSearchSurface
        value={search}
        onChange={setSearch}
        placeholder="Search by learner, email, submission title, file name…"
        disabled={loading}
        footer={
          <div className="mt-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex gap-2 flex-wrap">
              {(['all', 'submitted', 'under_review', 'reviewed', 'resubmit'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setFilter(st)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold capitalize transition-colors ${
                    filter === st
                      ? 'bg-[#84001B] text-white shadow-sm'
                      : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {st.replace('_', ' ')}
                </button>
              ))}
            </div>
            {!loading && (
              <p className="text-[11px] text-slate-500">
                Showing <span className="font-semibold text-slate-700 tabular-nums">{tableRows.length}</span> turn-in(s) in this
                view
              </p>
            )}
          </div>
        }
      />

        {loading ? (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 rounded-2xl bg-slate-200/50 animate-pulse" />
            ))}
          </div>
        ) : byAssignment.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-14 text-center">
            <ClipboardList className="w-14 h-14 mx-auto text-slate-300 mb-4" />
            <p className="text-lg font-semibold text-slate-800">No submissions match</p>
            <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
              Relax filters or search terms—or check back after learners upload coursework.
            </p>
          </div>
        ) : (
          <div className="space-y-10 pb-16">
            {tableRows.length > 0 && (
              <section className={`hidden md:block ${teacherRoundedTableShell}`} aria-label="Submission spreadsheet">
                <TeacherAmberCue title="Roster spreadsheet">
                  Maroon column headers align with Class list and Grading. In each assignment section below, use{' '}
                  <span className="font-semibold">View AI score</span> or <span className="font-semibold">View Teacher score</span>{' '}
                  on a card for a quick read-only summary; open{' '}
                  <Link className="font-semibold text-amber-950 underline-offset-2 hover:underline" to="/grading">
                    Grading workspace
                  </Link>{' '}
                  to evaluate or request redo. Scroll sideways on narrow screens.
                </TeacherAmberCue>
                <TeacherSubmissionRosterTable
                  rows={tableRows}
                  resubmitSavingId={resubmitSavingId}
                  gradeHref={gradingLinkForSubmission}
                  onRequestResubmit={(s) => void requestResubmitFromRoster(s)}
                  onDeleteRow={(s) => void deleteSubmissionRow(s)}
                  deleteBusyId={deleteBusyId}
                  labeledActions
                  omitGradeAndRedo
                  hideViewScore
                  highlightSubmissionId={jumpHighlightId}
                  embedded
                />
              </section>
            )}

            {byAssignment.map(({ title, items }) => (
              <section key={title}>
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="w-4 h-4 text-[#84001B]" />
                  <h2 className="text-sm font-bold text-slate-800 tracking-tight">{title}</h2>
                  <span className="text-xs font-medium text-slate-400">· {items.length} turn-in(s)</span>
                </div>
                <ul className="space-y-3">
                  {items.map((s) => {
                    const name = s.users?.full_name ?? 'Learner';
                    const mail = s.users?.email ?? '';
                    return (
                      <li key={s.id} id={`submission-roster-mobile-${s.id}`} className="scroll-mt-24">
                        <div
                          className={`rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden border-l-[5px] ${STATUS_CHIP[submissionDisplayStatusForRoster(s)]} ${
                            jumpHighlightId === s.id
                              ? 'ring-2 ring-[#84001B]/45 ring-offset-2 ring-offset-slate-50'
                              : ''
                          }`}
                        >
                          <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              <UserAvatar
                                src={s.users?.avatar_url}
                                name={name}
                                email={mail}
                                size={44}
                                rounded="2xl"
                                className="shadow-inner"
                                fallbackBg="bg-gradient-to-br from-[#84001B] to-[#5c0014]"
                                fallbackFg="text-white"
                              />
                              <div className="min-w-0">
                                <Link
                                  to={gradingLinkForSubmission(s.id)}
                                  className="font-semibold text-slate-900 truncate hover:text-[#84001B] hover:underline block"
                                  title="Open in grading workspace"
                                >
                                  {name}
                                </Link>
                                <p className="text-xs text-slate-500 truncate">{mail || 'No email on file'}</p>
                                <p className="mt-2 text-sm text-slate-800 font-medium truncate">
                                  {s.file_name}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2 items-center">
                                  <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                                    {s.assignments?.document_type ?? 'Other'} ·{' '}
                                    <time dateTime={s.submitted_at}>{relativeTime(s.submitted_at)}</time>
                                  </span>
                                  {s.score != null && (
                                    <span className="text-[11px] font-bold rounded-full bg-amber-100 text-amber-900 px-2 py-0.5">
                                      {s.score}% recorded
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-col sm:items-end gap-2 shrink-0">
                              <span className="inline-flex text-[11px] font-semibold text-slate-700 bg-white/95 border border-slate-200 rounded-full px-3 py-1">
                                {STATUS_LABEL[submissionDisplayStatusForRoster(s)]}
                              </span>
                              <div className="flex flex-wrap gap-2 justify-end">
                                {submissionHasOpenableFileUrl(s.file_url) && (
                                  <SubmissionOpenLink
                                    raw={s.file_url!.trim()}
                                    fileName={s.file_name}
                                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#84001B] hover:underline px-2 py-1 rounded-lg hover:bg-red-50"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    Open file
                                  </SubmissionOpenLink>
                                )}
                                {submissionHasViewableAiScore(s) && (
                                  <button
                                    type="button"
                                    onClick={() => setViewScoreOpen({ row: s, focus: 'ai' })}
                                    className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 text-amber-950 px-3 py-2 text-xs font-bold shadow-sm shadow-amber-500/25 hover:bg-amber-500"
                                    title="View automated AI score and AI-generated feedback"
                                  >
                                    <Sparkles className="w-3.5 h-3.5 shrink-0" aria-hidden />
                                    View AI score
                                  </button>
                                )}
                                {submissionHasViewableTeacherScore(s) && (
                                  <button
                                    type="button"
                                    onClick={() => setViewScoreOpen({ row: s, focus: 'teacher' })}
                                    className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 text-amber-950 px-3 py-2 text-xs font-bold shadow-sm shadow-amber-500/25 hover:bg-amber-500"
                                    title="View instructor-published score"
                                  >
                                    <GraduationCap className="w-3.5 h-3.5 shrink-0" aria-hidden />
                                    View Teacher score
                                  </button>
                                )}
                                <button
                                  type="button"
                                  disabled={deleteBusyId === s.id || resubmitSavingId === s.id}
                                  onClick={() => void deleteSubmissionRow(s)}
                                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white text-red-700 text-xs font-semibold px-3 py-2 hover:bg-red-50 disabled:opacity-50"
                                  title="Delete this submission"
                                >
                                  <Trash2 className="w-3.5 h-3.5" aria-hidden />
                                  Delete
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      {viewScoreOpen ? (
        <TeacherViewScoreModal
          row={viewScoreOpen.row}
          focus={viewScoreOpen.focus}
          onClose={() => setViewScoreOpen(null)}
        />
      ) : null}
    </TeacherWorkspaceShell>
  );
}

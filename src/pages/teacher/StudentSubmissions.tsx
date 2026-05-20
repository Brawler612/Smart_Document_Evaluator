import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  RefreshCw,
  ExternalLink,
  GraduationCap,
  Sparkles,
  FileText,
  ChevronRight,
  ClipboardList,
  Trash2,
  Loader2,
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
import { useSubmissionsRealtimeRefresh } from '../../hooks/useSubmissionsRealtimeRefresh';
import {
  onAutoSubmissionRosterSheetSync,
  scheduleAutoSyncSubmissionRosterToSheet,
  setSubmissionRosterSheetLoader,
} from '../../lib/autoSyncSubmissionRosterToSheet';
import { isAutoSheetSyncEnabled } from '../../lib/autoSyncGradesToSheet';
import { getGoogleSheetsConfig, getGoogleSheetsSetupStatus, isGoogleSheetTargetConfigured } from '../../lib/googleSheetsConfig';
import { syncSubmissionRosterToGoogleSheet } from '../../lib/syncSubmissionRosterToSheet';

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

/** Min ms between background refreshes — prevents Alt-Tab from refetching and flickering the table. */
const BACKGROUND_REFRESH_MIN_GAP_MS = 30_000;

function submissionsSignature(rows: TeacherSubmission[]): string {
  /** Cheap composite key: count + per-row id|status|updated_at|score so identical refetches are no-ops. */
  if (rows.length === 0) return '0';
  let out = String(rows.length);
  for (const r of rows) {
    out += `|${r.id}:${r.status}:${r.updated_at ?? r.submitted_at}:${r.score ?? ''}`;
  }
  return out;
}

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
  const [syncingSheet, setSyncingSheet] = useState(false);
  const [sheetSyncNotice, setSheetSyncNotice] = useState<{
    kind: 'ok' | 'err';
    text: string;
    url?: string;
  } | null>(null);
  const googleSheetViewUrl = useMemo(
    () => getGoogleSheetsConfig()?.viewUrl ?? (import.meta.env.VITE_GOOGLE_SHEETS_URL || '').trim(),
    [sheetSyncNotice, syncingSheet]
  );
  const sheetSetupStatus = useMemo(() => getGoogleSheetsSetupStatus(), [sheetSyncNotice, syncingSheet]);
  /** Brief highlight after deep-link from Inbox (Review). */
  const [jumpHighlightId, setJumpHighlightId] = useState<string | null>(null);
  const [viewScoreOpen, setViewScoreOpen] = useState<{ row: TeacherSubmission; focus: 'ai' | 'teacher' } | null>(null);
  /** Ids of rows the teacher has ticked for bulk delete. Empty by default. */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  /** Disables the bulk-delete button while the network request is in flight. */
  const [bulkDeleting, setBulkDeleting] = useState(false);
  /** Last successful fetch; gates the visibilitychange refetch to stop Alt-Tab flicker. */
  const lastFetchedAtRef = useRef(0);
  const rowsSignatureRef = useRef('');
  const rosterRowsRef = useRef<TeacherSubmission[]>([]);
  rosterRowsRef.current = rows;

  /**
   * `silent` keeps the existing rows visible while we re-fetch, so deletes and visibility refreshes
   * don't trigger the full-table skeleton (which scrolls the user back to the top).
   */
  const load = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!options.silent) setLoading(true);
    try {
      await syncAllLocalSubmissionsToSupabase();
      const next = await fetchTeacherSubmissionRows();
      const sig = submissionsSignature(next);
      /** Skip the state write entirely when the data is structurally identical to what's on screen. */
      if (sig !== rowsSignatureRef.current) {
        rowsSignatureRef.current = sig;
        setRows(next);
      }
    } catch (e) {
      console.error('[student-submissions]', e);
      if (!options.silent) {
        rowsSignatureRef.current = '';
        setRows([]);
      }
    } finally {
      if (!options.silent) setLoading(false);
      lastFetchedAtRef.current = Date.now();
    }
  }, []);

  const silentRefresh = useCallback(() => {
    void load({ silent: true });
  }, [load]);

  useSubmissionsRealtimeRefresh(silentRefresh);

  useEffect(() => {
    setSubmissionRosterSheetLoader(async () => rosterRowsRef.current);
    return () => setSubmissionRosterSheetLoader(null);
  }, []);

  useEffect(() => {
    return onAutoSubmissionRosterSheetSync((result) => {
      if (
        !result.ok &&
        getGoogleSheetsConfig() &&
        !result.message.includes('Auto-sync skipped')
      ) {
        setSheetSyncNotice({ kind: 'err', text: result.message });
      }
    });
  }, []);

  const rosterSheetSyncSig = useMemo(() => submissionsSignature(rows), [rows]);

  useEffect(() => {
    if (loading) return;
    if (!isGoogleSheetTargetConfigured() || !isAutoSheetSyncEnabled()) return;
    scheduleAutoSyncSubmissionRosterToSheet('roster-ready');
  }, [loading, rosterSheetSyncSig]);

  useEffect(() => {
    void load();
    /** Re-pull silently when the tab regains focus, but only if it's been a while. */
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastFetchedAtRef.current < BACKGROUND_REFRESH_MIN_GAP_MS) return;
      void load({ silent: true });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [load]);

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
    setSelectedIds((prev) => {
      if (!prev.has(s.id)) return prev;
      const next = new Set(prev);
      next.delete(s.id);
      return next;
    });
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

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible(rowsToToggle: TeacherSubmission[], selectAll: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selectAll) {
        for (const r of rowsToToggle) next.add(r.id);
      } else {
        for (const r of rowsToToggle) next.delete(r.id);
      }
      return next;
    });
  }

  async function deleteSelectedSubmissions(scopeRows: TeacherSubmission[]) {
    const targets = scopeRows.filter((row) => selectedIds.has(row.id));
    if (targets.length === 0) return;
    if (
      !window.confirm(
        `Delete ${targets.length} selected submission${targets.length === 1 ? '' : 's'} permanently? This cannot be undone.`
      )
    )
      return;
    setBulkDeleting(true);
    const targetIds = new Set(targets.map((t) => t.id));
    /** Optimistic remove + clear selection so the page reflects the action without waiting. */
    setRows((prev) => prev.filter((row) => !targetIds.has(row.id)));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of targetIds) next.delete(id);
      return next;
    });
    try {
      const result = await deleteTeacherSubmissionsByIds([...targetIds], {
        purgeLocalDuplicatesOf: targets.map((s) => ({
          student_id: s.student_id,
          file_name: s.file_name,
          file_url: s.file_url,
        })),
      });
      if (!result.ok) {
        alert(
          `Could not delete some rows from database: ${result.message}\n\nIf permission was denied, add the teacher DELETE policy (see docs/supabase-rls-submissions-teacher-delete.sql).`
        );
      }
      void load({ silent: true });
    } finally {
      setBulkDeleting(false);
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

  async function syncToGoogleSheet() {
    if (syncingSheet) return;
    setSheetSyncNotice(null);
    setSyncingSheet(true);
    try {
      const result = await syncSubmissionRosterToGoogleSheet(
        async () => rosterRowsRef.current,
        { interactiveSetup: true }
      );
      if (!result.ok) {
        setSheetSyncNotice({ kind: 'err', text: result.message });
        return;
      }
      window.open(result.spreadsheetUrl, '_blank', 'noopener,noreferrer');
    } finally {
      setSyncingSheet(false);
    }
  }

  return (
    <TeacherWorkspaceShell>
      <TeacherPageHeader
        eyebrow="Inbox · Student work"
        title="Submission roster"
        icon={FileText}
        description={
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
            <span className="font-semibold text-slate-800">Student submissions</span>
            <span className="text-slate-300" aria-hidden>
              ·
            </span>
            <Link className="font-semibold text-[#84001B] hover:underline" to="/class-list">
              Class list
            </Link>
            <span className="text-slate-300" aria-hidden>
              ·
            </span>
            <Link className="font-semibold text-[#84001B] hover:underline" to="/grading">
              Grades
            </Link>
            <span className="text-slate-300" aria-hidden>
              ·
            </span>
            <span className="text-slate-500">Google Sheets auto-sync</span>
          </p>
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
                  scheduleAutoSyncSubmissionRosterToSheet('refresh');
                } finally {
                  setSyncing(false);
                }
              }}
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} aria-hidden />
              Refresh
            </button>
            {googleSheetViewUrl ? (
              <a
                href={googleSheetViewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <ExternalLink className="w-3.5 h-3.5" aria-hidden />
                Open Google Sheet
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => void syncToGoogleSheet()}
              disabled={syncingSheet}
              className="inline-flex items-center gap-2 rounded-xl border border-[#84001B]/25 bg-[#84001B] px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#6b0014] disabled:opacity-60"
              title="Push all submissions (document type, status, scores) to the Submission Roster tab"
            >
              {syncingSheet ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
              ) : (
                <ExternalLink className="w-3.5 h-3.5" aria-hidden />
              )}
              {syncingSheet ? 'Syncing…' : 'Sync to Google Sheets'}
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

      {sheetSetupStatus.hint && !sheetSyncNotice && (
        <div
          role="status"
          className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          <p className="leading-snug">{sheetSetupStatus.hint}</p>
        </div>
      )}

      {sheetSyncNotice?.kind === 'err' && (
        <div
          role="alert"
          className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950 flex flex-wrap items-center justify-between gap-3"
        >
          <p className="min-w-0 flex-1 leading-snug">{sheetSyncNotice.text}</p>
          <button
            type="button"
            onClick={() => setSheetSyncNotice(null)}
            className="text-xs font-semibold opacity-70 hover:opacity-100 shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

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
                  selection={{
                    selectedIds,
                    onToggle: toggleSelected,
                    onToggleAll: (selectAll) => toggleSelectAllVisible(tableRows, selectAll),
                    onDeleteSelected: () => void deleteSelectedSubmissions(tableRows),
                    busy: bulkDeleting,
                  }}
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
                                    {s.assignments?.document_type ?? 'SPP'} ·{' '}
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

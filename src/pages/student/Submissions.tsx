import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  FileText,
  MessageSquare,
  X,
  ChevronRight,
  ExternalLink,
  ClipboardList,
  RefreshCw,
  Inbox,
  AlertTriangle,
  Trash2,
  Trash,
  Loader2,
  CheckCircle2,
  Sparkles,
  GraduationCap,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { normalizeSubStatus, submissionQueueTitle } from '../../lib/teacherSubmissionLoad';
import { syncLocalSubmissionsToSupabase } from '../../lib/localSubmissionSync';
import { SubmissionOpenLink, submissionHasOpenableFileUrl } from '../../components/SubmissionOpenLink';
import AIDocumentEvaluationReport from '../../components/AIDocumentEvaluationReport';
import { parsePersistedAiDraftSummary } from '../../../shared/geminiDocumentEvaluation';
import { useSubmissionFileMeta } from '../../lib/submissionFileMeta';
import { submissionHasPublishedScoreAndAiDraft, submissionHasViewableAiScore, submissionHasViewableTeacherScore } from '../../lib/submissionRosterPresentation';
import {
  deleteStudentSubmission,
  getStudentHiddenSubmissionIds,
} from '../../lib/studentDeleteSubmission';
import { emitStudentSubmissionRemoved } from '../../lib/studentWorkspaceData';
import type { SubStatus } from '../../types';

interface Submission {
  id: string;
  file_name: string;
  file_url: string | null;
  status: SubStatus;
  score: number | null;
  feedback: string | null;
  submitted_at: string;
  assignment_id: string | null;
  ai_draft_score: number | null;
  ai_draft_summary: string | null;
  submission_doc_type: string | null;
  assignments: { title: string; document_type: string } | null;
}

type LocalSubmissionRow = {
  id: string;
  student_id: string;
  assignment_id: string | null;
  file_name: string;
  file_url: string | null;
  status: SubStatus;
  feedback: string | null;
  score: number | null;
  ai_draft_score?: number | null;
  ai_draft_summary?: string | null;
  submitted_at: string;
  submission_doc_type?: string | null;
};

const LOCAL_SUBMISSION_KEY = 'local_submission_fallback_v1';

const STATUS_STYLES: Record<SubStatus, { chip: string; dot: string }> = {
  submitted: {
    chip: 'bg-rose-100 text-[#84001B] border border-rose-200/80',
    dot: 'bg-[#84001B]',
  },
  under_review: {
    chip: 'bg-[#ffd21a]/25 text-[#5c0014] border border-[#ffd21a]/45',
    dot: 'bg-[#ffd21a]',
  },
  reviewed: {
    chip: 'bg-[#84001B]/10 text-[#84001B] border border-[#84001B]/20',
    dot: 'bg-[#84001B]/70',
  },
  resubmit: {
    chip: 'bg-red-50 text-red-800 border border-red-100',
    dot: 'bg-red-500',
  },
};

const STATUS_LABELS: Record<SubStatus, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  reviewed: 'Graded',
  resubmit: 'Redo requested',
};

/** DB / localStorage may send unknown strings — never index STATUS_STYLES with raw values. */
function statusPresentation(raw: unknown): { normalized: SubStatus; chip: string; dot: string; label: string } {
  const normalized = normalizeSubStatus(raw);
  const style = STATUS_STYLES[normalized];
  return {
    normalized,
    chip: style.chip,
    dot: style.dot,
    label: STATUS_LABELS[normalized],
  };
}

/** When both final and AI rubric scores are present, show “Graded” even if `status` is still under review. */
function studentStatusPresentation(s: Submission): {
  normalized: SubStatus;
  chip: string;
  dot: string;
  label: string;
} {
  const base = statusPresentation(s.status);
  if (base.normalized === 'resubmit') return base;
  if (submissionHasPublishedScoreAndAiDraft(s) && base.normalized !== 'reviewed') {
    const st = STATUS_STYLES.reviewed;
    return {
      normalized: 'reviewed',
      chip: st.chip,
      dot: st.dot,
      label: STATUS_LABELS.reviewed,
    };
  }
  return base;
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

function shortId(id: string): string {
  if (!id) return '';
  const clean = id.replace(/^local_/, '');
  return clean.length <= 10 ? clean : `${clean.slice(0, 6)}…`;
}

function pickAssignmentJoin(rel: unknown): { title: string; document_type: string } | null {
  if (rel == null) return null;
  const obj = Array.isArray(rel) ? rel[0] : rel;
  if (!obj || typeof obj !== 'object') return null;
  const r = obj as Record<string, unknown>;
  return {
    title: String(r.title ?? ''),
    document_type: String(r.document_type ?? 'Other'),
  };
}

function submissionHeading(s: Submission): string {
  return submissionQueueTitle(
    {
      submission_doc_type: s.submission_doc_type,
      assignments: s.assignments,
      file_name: s.file_name,
    },
    'General Submission'
  );
}

function mapDbSubmissionRow(raw: Record<string, unknown>): Submission {
  const assignments = pickAssignmentJoin(raw.assignments);
  const aiN =
    typeof raw.ai_draft_score === 'number'
      ? raw.ai_draft_score
      : raw.ai_draft_score != null
        ? Number(raw.ai_draft_score)
        : NaN;
  return {
    id: String(raw.id ?? ''),
    file_name: String(raw.file_name ?? ''),
    file_url: raw.file_url != null ? String(raw.file_url) : null,
    status: normalizeSubStatus(raw.status),
    score: typeof raw.score === 'number' ? raw.score : raw.score != null ? Number(raw.score) : null,
    feedback: raw.feedback != null ? String(raw.feedback) : null,
    submitted_at: String(raw.submitted_at ?? ''),
    assignment_id: raw.assignment_id != null ? String(raw.assignment_id) : null,
    ai_draft_score: Number.isFinite(aiN) ? aiN : null,
    ai_draft_summary: raw.ai_draft_summary != null ? String(raw.ai_draft_summary) : null,
    submission_doc_type: raw.submission_doc_type != null ? String(raw.submission_doc_type) : null,
    assignments,
  };
}

function resubmitAssignmentsHref(s: Submission): string {
  const q = new URLSearchParams();
  q.set('resubmit', s.id);
  if (s.assignment_id) q.set('assignment', s.assignment_id);
  return `/assignments?${q.toString()}`;
}

export default function MySubmissions() {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<SubStatus | 'all'>('all');
  const [selected, setSelected] = useState<Submission | null>(null);
  /** Which view of the modal to show: details, or score summary focused on AI or teacher tile. */
  const [selectedView, setSelectedView] = useState<'details' | 'score_ai' | 'score_teacher'>('details');
  const [submissionTable, setSubmissionTable] = useState<'submissions' | 'submission' | null>(null);
  /** Two-step inline confirm — id of the row currently asking "are you sure?" */
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removedToast, setRemovedToast] = useState<string | null>(null);
  /** Row-selection set for the bulk "Delete selected" toolbar above the list. */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  /** Disables the bulk action button while the network requests are in flight. */
  const [bulkRemoving, setBulkRemoving] = useState(false);

  /** Auto-dismiss the success toast after a few seconds. */
  useEffect(() => {
    if (!removedToast) return;
    const t = window.setTimeout(() => setRemovedToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [removedToast]);

  async function handleRemoveSubmission(target: Submission) {
    if (!user?.id) return;
    setRemovingId(target.id);
    setRemoveError(null);

    /** Optimistic removal — snap it out of the list immediately. */
    const prev = submissions;
    setSubmissions((rows) => rows.filter((r) => r.id !== target.id));
    if (selected?.id === target.id) setSelected(null);

    const res = await deleteStudentSubmission({
      id: target.id,
      studentId: user.id,
      fileUrl: target.file_url,
    });

    setRemovingId(null);
    setConfirmRemoveId(null);

    if (!res.ok) {
      /** Roll back the optimistic remove so the row reappears with its original status. */
      setSubmissions(prev);
      setRemoveError(res.message);
      return;
    }

    setRemovedToast(
      res.hiddenLocally
        ? `Removed ${target.file_name} from your view (kept on the instructor's queue).`
        : `Removed ${target.file_name}${res.localOnly ? ' (browser copy)' : ''}.`
    );
    /** Tell every other workspace page (Dashboard / Tasks / Drive / etc.) to drop this row. */
    emitStudentSubmissionRemoved(target.id);
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(scope: Submission[], selectAll: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selectAll) for (const s of scope) next.add(s.id);
      else for (const s of scope) next.delete(s.id);
      return next;
    });
  }

  /**
   * Remove the currently selected submissions in one pass. We reuse the same per-row API as the
   * inline Remove button, but skip the two-step confirm UI; the toolbar shows a single confirm
   * before we start so the action keeps the friendly "are you sure?" guardrail.
   */
  async function removeSelectedSubmissions(scope: Submission[]) {
    if (!user?.id) return;
    const targets = scope.filter((s) => selectedIds.has(s.id));
    if (targets.length === 0) return;
    if (
      !window.confirm(
        `Remove ${targets.length} selected submission${targets.length === 1 ? '' : 's'}? Teacher copies stay on their queue; your view drops them.`
      )
    )
      return;
    setBulkRemoving(true);
    setRemoveError(null);
    /** Optimistic: drop the rows now; we re-add them only if the API later complains. */
    const targetIds = new Set(targets.map((t) => t.id));
    const prev = submissions;
    setSubmissions((rows) => rows.filter((r) => !targetIds.has(r.id)));
    if (selected && targetIds.has(selected.id)) setSelected(null);
    setSelectedIds(new Set());

    let removedCount = 0;
    const failed: string[] = [];
    for (const target of targets) {
      const res = await deleteStudentSubmission({
        id: target.id,
        studentId: user.id,
        fileUrl: target.file_url,
      });
      if (res.ok) {
        emitStudentSubmissionRemoved(target.id);
        removedCount += 1;
      } else {
        failed.push(`${target.file_name}: ${res.message}`);
      }
    }

    setBulkRemoving(false);

    if (failed.length > 0) {
      /** Roll back rows that the API rejected so the user can retry them individually. */
      const failedNames = new Set(failed.map((line) => line.split(':')[0]));
      const rollback = prev.filter((row) => failedNames.has(row.file_name));
      if (rollback.length > 0) setSubmissions((rows) => [...rollback, ...rows]);
      setRemoveError(
        `Removed ${removedCount}/${targets.length}. Could not remove:\n${failed.join('\n')}`
      );
      return;
    }

    setRemovedToast(`Removed ${removedCount} submission${removedCount === 1 ? '' : 's'} from your view.`);
  }

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

  async function load() {
    if (!user?.id) {
      setSubmissions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    await syncLocalSubmissionsToSupabase(user.id);

    const table = await resolveSubmissionTable();
    let dbRows: Submission[] = [];
    if (table) {
      const withJoin = await supabase
        .from(table)
        .select('*, assignments(title, document_type)')
        .eq('student_id', user.id)
        .order('submitted_at', { ascending: false });
      if (!withJoin.error) {
        dbRows = ((withJoin.data || []) as Record<string, unknown>[]).map((row) => mapDbSubmissionRow(row));
      } else {
        const plain = await supabase
          .from(table)
          .select('*')
          .eq('student_id', user.id)
          .order('submitted_at', { ascending: false });
        dbRows = ((plain.data || []) as Record<string, unknown>[]).map((s) => mapDbSubmissionRow({ ...s, assignments: null }));
      }
    }

    let localMapped: Submission[] = [];
    if (!table) {
      try {
        const localRaw = localStorage.getItem(LOCAL_SUBMISSION_KEY);
        const localRows = localRaw ? (JSON.parse(localRaw) as LocalSubmissionRow[]) : [];
        localMapped = localRows
          .filter((row) => row.student_id === user.id)
          .map((row) => ({
            id: row.id,
            file_name: row.file_name,
            file_url: row.file_url,
            status: normalizeSubStatus(row.status),
            score: row.score,
            feedback: row.feedback,
            submitted_at: row.submitted_at,
            assignment_id: row.assignment_id ?? null,
            ai_draft_score: row.ai_draft_score ?? null,
            ai_draft_summary: row.ai_draft_summary ?? null,
            submission_doc_type: row.submission_doc_type ?? null,
            assignments: { title: 'General Submission', document_type: 'Other' },
          }));
      } catch {
        localMapped = [];
      }
    }

    /** Skip rows the student soft-removed when RLS blocked the actual DELETE. */
    const hiddenIds = getStudentHiddenSubmissionIds();
    const combined = [...dbRows, ...localMapped]
      .filter((row) => !hiddenIds.has(row.id))
      .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
    setSubmissions(combined);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [user]);

  const filtered = useMemo(
    () =>
      submissions.filter(
        (s) =>
          (filter === 'all' || s.status === filter) &&
          (s.file_name.toLowerCase().includes(search.toLowerCase()) ||
            submissionHeading(s).toLowerCase().includes(search.toLowerCase()) ||
            (s.assignments?.title ?? '').toLowerCase().includes(search.toLowerCase()) ||
            (s.assignments?.document_type ?? '').toLowerCase().includes(search.toLowerCase()) ||
            (s.submission_doc_type ?? '').toLowerCase().includes(search.toLowerCase()))
      ),
    [submissions, filter, search]
  );

  const counts = useMemo(() => {
    return {
      all: submissions.length,
      submitted: submissions.filter((s) => s.status === 'submitted').length,
      under_review: submissions.filter((s) => s.status === 'under_review').length,
      reviewed: submissions.filter((s) => s.status === 'reviewed').length,
      resubmit: submissions.filter((s) => s.status === 'resubmit').length,
    };
  }, [submissions]);

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-100/95 via-[#faf8f8] to-slate-100/85">
      <div className="p-6 md:p-8 max-w-3xl lg:max-w-4xl mx-auto pb-16">
        <header className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
            <div>
              <p className="text-xs font-semibold tracking-[0.14em] uppercase text-[#84001B]">Activity</p>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mt-1.5 tracking-tight flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#84001B] text-[#ffd21a] shrink-0 shadow-sm">
                  <Inbox className="w-[20px] h-[20px]" aria-hidden />
                </span>
                My submissions
              </h1>
              <p className="text-slate-600 text-sm mt-2 max-w-lg leading-relaxed">
                Every file you&apos;ve sent, with live status. Same file name more than once? The ref below tells them
                apart.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Sync
              </button>
              <Link
                to="/assignments"
                className="inline-flex items-center gap-2 rounded-xl bg-[#84001B] px-3.5 py-2 text-xs font-semibold text-white shadow-md hover:bg-[#6b0016]"
              >
                Submit work
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </header>

        {!loading && counts.resubmit > 0 && (
          <div
            role="alert"
            className="mb-6 rounded-2xl border border-red-200 bg-red-50/95 px-4 py-4 text-sm text-red-950 shadow-sm"
          >
            <div className="flex gap-3">
              <div className="shrink-0 pt-0.5">
                <AlertTriangle className="w-5 h-5 text-red-600" aria-hidden />
              </div>
              <div className="min-w-0 space-y-2">
                <p className="font-bold text-red-950">Action required: resubmit your work</p>
                <p className="leading-relaxed text-red-900/90">
                  Your instructor marked {counts.resubmit === 1 ? 'one upload' : `${counts.resubmit} uploads`} as empty,
                  incomplete, or not ready to grade. Open each item below (or filter &quot;Redo&quot;) to read their comments,
                  then upload a revised file from Submit work.
                </p>
                <button
                  type="button"
                  onClick={() => setFilter('resubmit')}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-red-800"
                >
                  Show redo items
                  <ChevronRight className="w-3.5 h-3.5" aria-hidden />
                </button>
              </div>
            </div>
          </div>
        )}

        {!loading && submissions.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 mb-6">
            {(
              [
                { key: 'all' as const, label: 'Total', n: counts.all },
                { key: 'submitted' as const, label: 'Submitted', n: counts.submitted },
                { key: 'under_review' as const, label: 'In review', n: counts.under_review },
                { key: 'reviewed' as const, label: 'Graded', n: counts.reviewed },
                { key: 'resubmit' as const, label: 'Redo', n: counts.resubmit },
              ] as const
            ).map(({ key, label, n }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  filter === key
                    ? 'border-[#84001B] bg-[#84001B]/8 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
                <p className="text-xl font-bold text-slate-900 tabular-nums">{n}</p>
              </button>
            ))}
          </div>
        )}

        <div className="rounded-2xl border border-slate-200/90 bg-white/85 backdrop-blur-sm shadow-sm p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by file name, task title, or document type…"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B]/40 bg-white"
            />
          </div>
          {!loading && submissions.length > 0 && (
            <p className="text-[11px] text-slate-500 mt-3">
              Showing <span className="font-semibold text-slate-700">{filtered.length}</span> of {submissions.length}{' '}
              upload{submissions.length !== 1 ? 's' : ''}
              {filter !== 'all' && (
                <span>
                  {' '}
                  · <span className="text-[#84001B] font-medium">{STATUS_LABELS[filter]}</span>
                </span>
              )}
            </p>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-[104px] bg-slate-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 px-6 py-14 text-center">
            <ClipboardList className="w-14 h-14 text-slate-200 mx-auto mb-4" aria-hidden />
            <p className="text-lg font-semibold text-slate-800">
              {submissions.length === 0 ? 'Nothing uploaded yet' : 'No results for this filter'}
            </p>
            <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">
              {submissions.length === 0
                ? 'When you submit from Submit work, each upload lands here with a status.'
                : 'Try another status chip or clear your search.'}
            </p>
            <Link
              to="/assignments"
              className="inline-flex items-center gap-2 mt-6 rounded-xl bg-[#84001B] text-white px-4 py-2.5 text-sm font-semibold hover:bg-[#6b0016] shadow-md"
            >
              Go to Submit work
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <>
          <div className="flex flex-wrap items-center justify-end gap-2 px-3 py-2 mb-3 rounded-2xl border border-slate-200/90 bg-slate-50/95 shadow-sm">
            <label className="inline-flex items-center gap-2 text-[11px] font-medium text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                aria-label={
                  filtered.length > 0 && filtered.every((s) => selectedIds.has(s.id))
                    ? 'Deselect all uploads in this view'
                    : 'Select all uploads in this view'
                }
                checked={filtered.length > 0 && filtered.every((s) => selectedIds.has(s.id))}
                ref={(el) => {
                  if (!el) return;
                  const sel = filtered.reduce((acc, s) => (selectedIds.has(s.id) ? acc + 1 : acc), 0);
                  el.indeterminate = sel > 0 && sel < filtered.length;
                }}
                onChange={(e) => toggleSelectAll(filtered, e.target.checked)}
                className="h-3.5 w-3.5 accent-[#84001B] cursor-pointer"
              />
              Select all in view
            </label>
            {(() => {
              const sel = filtered.reduce((acc, s) => (selectedIds.has(s.id) ? acc + 1 : acc), 0);
              return (
                <button
                  type="button"
                  disabled={sel === 0 || bulkRemoving || removingId !== null}
                  onClick={() => void removeSelectedSubmissions(filtered)}
                  className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-[10px] font-semibold text-red-700 shadow-sm hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title={
                    sel === 0
                      ? 'Tick cards below (or use Select all) to enable bulk delete'
                      : `Remove the ${sel} selected upload${sel === 1 ? '' : 's'} from your view`
                  }
                >
                  <Trash className="w-3 h-3 shrink-0" aria-hidden />
                  Delete selected{sel > 0 ? ` (${sel})` : ''}
                </button>
              );
            })()}
          </div>
          <ul className="space-y-3">
            {filtered.map((s) => {
              const pv = studentStatusPresentation(s);
              return (
              <li key={s.id} data-submission-row={s.id}>
                <div
                  className={`bg-white border rounded-2xl p-4 md:p-5 shadow-sm hover:shadow-md transition-all ${
                    confirmRemoveId === s.id && !(selected?.id === s.id && selectedView !== 'details')
                      ? 'border-red-300 ring-2 ring-red-100'
                      : 'border-slate-200/90 hover:border-[#84001B]/15'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-stretch gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        aria-label={`Select submission ${s.file_name}`}
                        checked={selectedIds.has(s.id)}
                        onChange={() => toggleSelected(s.id)}
                        className="mt-4 h-3.5 w-3.5 accent-[#84001B] cursor-pointer shrink-0"
                      />
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#ffd21a] to-[#f5c400] flex items-center justify-center shrink-0 text-[#84001B]">
                        <FileText className="w-6 h-6" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 gap-y-1">
                          <p className="font-bold text-slate-900 truncate">{s.file_name}</p>
                          <span
                            className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded-full ${pv.chip}`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${pv.dot}`}
                              aria-hidden
                            />
                            {pv.label}
                          </span>
                          {pv.normalized === 'reviewed' && s.score != null && (
                            <span
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-[#5c0014] bg-[#ffd21a]/35 px-2 py-1 rounded-full border border-[#ffd21a]/50"
                              title="Final score published by your instructor."
                            >
                              <GraduationCap className="w-3 h-3 shrink-0" aria-hidden />
                              Teacher {s.score}%
                            </span>
                          )}
                          {s.ai_draft_score != null && (
                            <span
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-900 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-200"
                              title="Automated AI rubric score (preliminary)."
                            >
                              <Sparkles className="w-3 h-3 shrink-0" aria-hidden />
                              AI {s.ai_draft_score}%
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-600 mt-0.5 truncate">
                          {submissionHeading(s)}
                          {!s.submission_doc_type && s.assignments?.document_type && (
                            <span className="text-slate-400"> · {s.assignments.document_type}</span>
                          )}
                        </p>
                        <FileChipStrip fileUrl={s.file_url} fileName={s.file_name} />
                        <p className="text-xs text-slate-500 mt-2">
                          <span className="font-medium text-slate-600">{relativeTime(s.submitted_at)}</span>
                          <span className="text-slate-300 mx-1.5">·</span>
                          <time dateTime={s.submitted_at} title={new Date(s.submitted_at).toISOString()}>
                            {new Date(s.submitted_at).toLocaleString()}
                          </time>
                          <span className="text-slate-300 mx-1.5">·</span>
                          <span className="tabular-nums text-slate-400" title={s.id}>
                            Ref {shortId(s.id)}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="flex sm:flex-col gap-2 justify-end sm:justify-center shrink-0 sm:border-l sm:border-slate-100 sm:pl-4 md:min-w-[140px]">
                      {submissionHasOpenableFileUrl(s.file_url) && (
                        <SubmissionOpenLink
                          raw={s.file_url!.trim()}
                          fileName={s.file_name}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Open
                        </SubmissionOpenLink>
                      )}
                      {pv.normalized === 'resubmit' && (
                        <Link
                          to={resubmitAssignmentsHref(s)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-100/90"
                        >
                          Resubmit
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
                      )}
                      {submissionHasViewableAiScore(s) && (
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmRemoveId(null);
                            setSelectedView('score_ai');
                            setSelected(s);
                          }}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-400 text-amber-950 px-3 py-2 text-xs font-bold hover:bg-amber-500 shadow-sm shadow-amber-500/25"
                          title="Open automated AI score and AI-generated feedback for this submission."
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          View AI score
                        </button>
                      )}
                      {submissionHasViewableTeacherScore(s) &&
                        (pv.normalized === 'reviewed' || submissionHasPublishedScoreAndAiDraft(s)) && (
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmRemoveId(null);
                              setSelectedView('score_teacher');
                              setSelected(s);
                            }}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-400 text-amber-950 px-3 py-2 text-xs font-bold hover:bg-amber-500 shadow-sm shadow-amber-500/25"
                            title="Open your instructor’s published score for this submission."
                          >
                            <GraduationCap className="w-3.5 h-3.5" />
                            View Teacher score
                          </button>
                        )}
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmRemoveId(null);
                          setSelectedView('details');
                          setSelected(s);
                        }}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#84001B] text-white px-3 py-2 text-xs font-semibold hover:bg-[#6b0016] shadow-sm"
                        title="Open the submission file info, status, and teacher feedback (no score)."
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        Details
                      </button>
                      {!(selected?.id === s.id && selectedView !== 'details') &&
                        (confirmRemoveId === s.id ? (
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => void handleRemoveSubmission(s)}
                              disabled={removingId === s.id}
                              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-red-600 text-white px-3 py-2 text-xs font-bold hover:bg-red-700 shadow-sm disabled:opacity-60"
                            >
                              {removingId === s.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                              {removingId === s.id ? 'Removing…' : 'Confirm'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmRemoveId(null)}
                              disabled={removingId === s.id}
                              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmRemoveId(s.id);
                              setRemoveError(null);
                            }}
                            disabled={removingId !== null}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 hover:border-red-300 disabled:opacity-60"
                            title="Remove this submission"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Remove
                          </button>
                        ))}
                    </div>
                  </div>
                </div>
              </li>
              );
            })}
          </ul>
          </>
        )}
      </div>

      {removeError && (
        <div
          role="alert"
          className="fixed bottom-6 right-6 z-[60] max-w-md rounded-2xl border border-red-200 bg-red-50/95 px-4 py-3 text-sm text-red-900 shadow-xl backdrop-blur-sm"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-bold mb-1">Couldn&apos;t remove that submission</p>
              <p className="text-[12px] leading-relaxed text-red-900/90 break-words">{removeError}</p>
            </div>
            <button
              type="button"
              onClick={() => setRemoveError(null)}
              className="p-1 text-red-500 hover:text-red-700 shrink-0"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {removedToast && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-[60] flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/95 px-4 py-3 text-sm text-emerald-900 shadow-xl backdrop-blur-sm"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden />
          <span className="font-medium">{removedToast}</span>
        </div>
      )}

      {selected && (
        <SubmissionDetailsDialog
          selected={selected}
          view={selectedView}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

/** Small chip strip used on every row in the submissions list. Calls the live-size hook safely. */
function FileChipStrip({ fileUrl, fileName }: { fileUrl: string | null; fileName: string }) {
  const { meta, measuring } = useSubmissionFileMeta(fileUrl, fileName);
  const sizeTitle =
    meta.bytes != null
      ? `${meta.bytes.toLocaleString()} bytes`
      : measuring
      ? 'Measuring file size…'
      : 'Size could not be determined for this URL';
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
      {meta.extension && (
        <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-700 border border-slate-200 px-1.5 py-0.5 rounded-md">
          {meta.extension}
        </span>
      )}
      <span
        className="inline-flex items-center text-[10px] font-bold uppercase tracking-wide bg-[#84001B]/8 text-[#84001B] border border-[#84001B]/15 px-1.5 py-0.5 rounded-md tabular-nums"
        title={sizeTitle}
      >
        {meta.bytes == null && measuring ? 'Measuring…' : meta.sizeLabel}
      </span>
      <span
        className="inline-flex items-center text-[10px] font-medium bg-slate-50 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded-md max-w-[14rem] truncate"
        title={meta.mime}
      >
        {meta.mime}
      </span>
      <span
        className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-md border ${
          meta.urlKind === 'http'
            ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
            : meta.urlKind === 'data'
            ? 'bg-blue-50 text-blue-700 border-blue-100'
            : meta.urlKind === 'none'
            ? 'bg-slate-50 text-slate-500 border-slate-200'
            : 'bg-slate-50 text-slate-600 border-slate-200'
        }`}
      >
        {meta.urlKindLabel}
      </span>
    </div>
  );
}

function SubmissionDetailsDialog({
  selected,
  view,
  onClose,
}: {
  selected: Submission;
  /** 'details' = file/status/feedback; score views open the same report with the matching tile emphasized. */
  view: 'details' | 'score_ai' | 'score_teacher';
  onClose: () => void;
}) {
  const selPv = studentStatusPresentation(selected);
  const { meta: selMeta, measuring } = useSubmissionFileMeta(selected.file_url, selected.file_name);
  const isScoreView = view !== 'details';
  const dialogTitle = view === 'details' ? 'Submission details' : view === 'score_ai' ? 'AI score' : 'Teacher score';
  const aiDraftParsed = useMemo(
    () => parsePersistedAiDraftSummary((selected.ai_draft_summary ?? '').trim()),
    [selected.ai_draft_summary]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl border border-slate-200/90 max-h-[min(92vh,48rem)] flex flex-col">
        <div className="flex shrink-0 items-start justify-between p-6 border-b border-slate-100 gap-4">
          <div className="min-w-0">
            <h2 className="font-bold text-slate-900 text-lg">{dialogTitle}</h2>
            <p className="text-sm text-slate-500 truncate mt-0.5">{selected.file_name}</p>
            <p className="text-[11px] text-slate-400 mt-1 tabular-nums" title={selected.id}>
              Ref {shortId(selected.id)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-6 space-y-4">
          {selPv.normalized === 'resubmit' && (
            <div className="rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-950">
              <p className="font-bold flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" aria-hidden />
                Revision needed
              </p>
              <p className="leading-relaxed text-red-900/95">
                This file was flagged as empty, incomplete, or not acceptable for grading. Please read the teacher
                message below and upload a complete replacement from Submit work.
              </p>
            </div>
          )}
          {isScoreView && view === 'score_ai' && submissionHasViewableAiScore(selected) && (
              <div className="rounded-2xl border border-slate-200/90 bg-slate-50/50 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                      Automated (AI) grading
                    </p>
                    <p className="text-[12px] text-slate-600 mt-0.5 leading-relaxed">
                      Preliminary AI rubric and model-written notes. Your instructor’s official grade (if any) is separate.
                    </p>
                  </div>
                </div>
                <AIDocumentEvaluationReport
                  criteria={[]}
                  aiScorePercent={selected.ai_draft_score}
                  teacherScorePercent={null}
                  summaryText={aiDraftParsed.visibleSummary || undefined}
                  documentQualityNotes={aiDraftParsed.documentQualityNotes || null}
                  languageCorrections={aiDraftParsed.languageCorrections}
                  correctHighlights={aiDraftParsed.correctHighlights}
                  pageRewrites={aiDraftParsed.pageRewrites}
                  documentOverviewScores={aiDraftParsed.documentOverviewScores}
                  diagramEvaluations={aiDraftParsed.diagramEvaluations}
                  heading="AI score"
                  showTeacherGrade={false}
                  scoreSectionFocus="ai"
                />
              </div>
            )}
          {isScoreView &&
            view === 'score_teacher' &&
            selected.score != null &&
            (selected.status === 'reviewed' || submissionHasPublishedScoreAndAiDraft(selected)) && (
              <div className="rounded-2xl border border-slate-200/90 bg-slate-50/50 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                      Instructor-published grade
                    </p>
                    <p className="text-[12px] text-slate-600 mt-0.5 leading-relaxed">
                      This is what your teacher set as the official score. It does not replace or erase the AI draft on file.
                    </p>
                  </div>
                </div>
                <AIDocumentEvaluationReport
                  criteria={[]}
                  aiScorePercent={null}
                  teacherScorePercent={selected.score}
                  summaryText={(selected.feedback ?? '').trim() || 'No instructor written feedback yet.'}
                  documentQualityNotes={null}
                  languageCorrections={[]}
                  correctHighlights={[]}
                  heading="Teacher score"
                  executiveSummaryHeading="Instructor feedback"
                  showAiGrade={false}
                  showTeacherGrade
                  scoreSectionFocus="teacher"
                />
              </div>
            )}
          {isScoreView && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Status</p>
              <span
                className={`inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-xl font-semibold ${selPv.chip}`}
              >
                {selPv.label}
              </span>
            </div>
          )}
          {isScoreView && view !== 'score_teacher' && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                Teacher feedback
              </p>
              {selected.feedback ? (
                <div className="bg-slate-50 rounded-xl p-4 text-sm font-bold text-slate-800 leading-relaxed border border-slate-100">
                  {selected.feedback}
                </div>
              ) : (
                <p className="text-sm text-slate-400 text-center py-4 border border-dashed border-slate-200 rounded-xl">
                  No written comments yet.
                </p>
              )}
            </div>
          )}
          {selPv.normalized === 'resubmit' && (
            <Link
              to={resubmitAssignmentsHref(selected)}
              className="inline-flex items-center gap-2 rounded-xl bg-[#84001B] px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-[#6b0016] w-fit"
            >
              Upload new version
              <ChevronRight className="w-4 h-4" />
            </Link>
          )}
          {!isScoreView && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">File details</p>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-xs">
                <div>
                  <dt className="font-bold uppercase tracking-wide text-[10px] text-slate-500">Name</dt>
                  <dd className="text-slate-800 font-medium break-all" title={selected.file_name}>
                    {selected.file_name}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold uppercase tracking-wide text-[10px] text-slate-500">Size</dt>
                  <dd
                    className="text-slate-800 font-bold tabular-nums"
                    title={
                      selMeta.bytes != null
                        ? `${selMeta.bytes.toLocaleString()} bytes`
                        : measuring
                        ? 'Measuring file size…'
                        : 'Size could not be determined for this URL'
                    }
                  >
                    {selMeta.bytes != null ? (
                      selMeta.sizeLabel
                    ) : measuring ? (
                      <span className="inline-flex items-center gap-1.5 text-slate-500 font-medium normal-case">
                        <span
                          className="w-3 h-3 rounded-full border-2 border-slate-300 border-t-[#84001B] animate-spin"
                          aria-hidden
                        />
                        Measuring…
                      </span>
                    ) : (
                      <>
                        —
                        <span className="ml-1 text-[10px] font-medium text-slate-400 normal-case">
                          (size unavailable)
                        </span>
                      </>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold uppercase tracking-wide text-[10px] text-slate-500">Type</dt>
                  <dd className="text-slate-800 font-medium break-all">
                    {selMeta.extension || '—'}
                    <span className="text-slate-400"> · {selMeta.mime}</span>
                  </dd>
                </div>
                <div>
                  <dt className="font-bold uppercase tracking-wide text-[10px] text-slate-500">Storage</dt>
                  <dd className="text-slate-800 font-medium">{selMeta.urlKindLabel}</dd>
                </div>
                <div>
                  <dt className="font-bold uppercase tracking-wide text-[10px] text-slate-500">Task</dt>
                  <dd className="text-slate-800 font-medium">{submissionHeading(selected)}</dd>
                </div>
                <div>
                  <dt className="font-bold uppercase tracking-wide text-[10px] text-slate-500">Sent</dt>
                  <dd className="text-slate-800 font-medium">
                    {new Date(selected.submitted_at).toLocaleString()}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  FileText,
  Star,
  MessageSquare,
  X,
  ChevronRight,
  ExternalLink,
  ClipboardList,
  RefreshCw,
  Inbox,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { normalizeSubStatus } from '../../lib/teacherSubmissionLoad';
import { SubmissionOpenLink, submissionHasOpenableFileUrl } from '../../components/SubmissionOpenLink';
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

  async function load() {
    if (!user?.id) {
      setSubmissions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
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

    const localRaw = localStorage.getItem(LOCAL_SUBMISSION_KEY);
    const localRows = localRaw ? (JSON.parse(localRaw) as LocalSubmissionRow[]) : [];
    const localMapped: Submission[] = localRows
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
        assignments: { title: 'General Submission', document_type: 'Other' },
      }));

    const combined = [...dbRows, ...localMapped].sort(
      (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
    );
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
            (s.assignments?.title ?? '').toLowerCase().includes(search.toLowerCase()) ||
            (s.assignments?.document_type ?? '').toLowerCase().includes(search.toLowerCase()))
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
          <ul className="space-y-3">
            {filtered.map((s) => {
              const pv = statusPresentation(s.status);
              return (
              <li key={s.id}>
                <div className="bg-white border border-slate-200/90 rounded-2xl p-4 md:p-5 shadow-sm hover:shadow-md hover:border-[#84001B]/15 transition-all">
                  <div className="flex flex-col sm:flex-row sm:items-stretch gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
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
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#84001B] bg-[#ffd21a]/35 px-2 py-1 rounded-full border border-[#ffd21a]/50">
                              <Star className="w-3 h-3 shrink-0" aria-hidden />
                              {s.score}%
                              {s.ai_draft_score != null &&
                                s.ai_draft_score !== s.score &&
                                ` · AI pref. ${s.ai_draft_score}%`}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-600 mt-0.5 truncate">
                          {s.assignments?.title ?? 'General Submission'}
                          {s.assignments?.document_type && (
                            <span className="text-slate-400"> · {s.assignments.document_type}</span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500 mt-1.5">
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
                      <button
                        type="button"
                        onClick={() => setSelected(s)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#84001B] text-white px-3 py-2 text-xs font-semibold hover:bg-[#6b0016] shadow-sm"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        Details
                      </button>
                    </div>
                  </div>
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </div>

      {selected &&
        (() => {
          const selPv = statusPresentation(selected.status);
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200/90 max-h-[min(90vh,32rem)] flex flex-col">
                <div className="flex shrink-0 items-start justify-between p-6 border-b border-slate-100 gap-4">
                  <div className="min-w-0">
                    <h2 className="font-bold text-slate-900 text-lg">Submission details</h2>
                    <p className="text-sm text-slate-500 truncate mt-0.5">{selected.file_name}</p>
                    <p className="text-[11px] text-slate-400 mt-1 tabular-nums" title={selected.id}>
                      Ref {shortId(selected.id)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors shrink-0"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-6 space-y-4">
                  {selPv.normalized === 'reviewed' && selected.score != null && (
                    <div className="flex items-center justify-between rounded-xl bg-[#ffd21a]/25 border border-[#ffd21a]/40 px-4 py-3">
                      <span className="text-sm font-semibold text-slate-800">Final score (staff)</span>
                      <span className="text-2xl font-bold text-[#84001B] tabular-nums">{selected.score}%</span>
                    </div>
                  )}
                  {(selected.ai_draft_score != null || (selected.ai_draft_summary ?? '').trim()) && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                        AI preliminary (automated draft)
                      </p>
                      {selected.ai_draft_score != null && (
                        <p className="text-sm font-semibold text-slate-800 tabular-nums mb-2">
                          Indicative total:{' '}
                          <span className="text-[#84001B]">{selected.ai_draft_score}%</span>
                          {selPv.normalized === 'reviewed' &&
                            selected.score != null &&
                            selected.ai_draft_score !== selected.score && (
                              <span className="font-normal text-slate-600">
                                {' '}
                                · staff adjusted to {selected.score}%
                              </span>
                            )}
                        </p>
                      )}
                      {selected.ai_draft_summary ? (
                        <p className="text-sm text-slate-700 leading-relaxed">{selected.ai_draft_summary}</p>
                      ) : (
                        <p className="text-xs text-slate-500 italic">No summary text stored for this run.</p>
                      )}
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Status</p>
                    <span
                      className={`inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-xl font-semibold ${selPv.chip}`}
                    >
                      {selPv.label}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 space-y-1">
                    <p>
                      <span className="font-semibold text-slate-600">Task:</span>{' '}
                      {selected.assignments?.title ?? 'General Submission'}
                    </p>
                    <p>
                      <span className="font-semibold text-slate-600">Sent:</span>{' '}
                      {new Date(selected.submitted_at).toLocaleString()}
                    </p>
                  </div>
                  {submissionHasOpenableFileUrl(selected.file_url) && (
                    <SubmissionOpenLink
                      raw={selected.file_url!.trim()}
                      fileName={selected.file_name}
                      className="inline-flex items-center gap-2 rounded-xl border border-[#84001B]/30 bg-[#84001B]/8 px-3 py-2 text-sm font-semibold text-[#84001B] hover:bg-[#84001B]/12"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Open your file
                    </SubmissionOpenLink>
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
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                      Staff feedback
                    </p>
                    {selected.feedback ? (
                      <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-700 leading-relaxed border border-slate-100">
                        {selected.feedback}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400 text-center py-4 border border-dashed border-slate-200 rounded-xl">
                        No written comments yet.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}

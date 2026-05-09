import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  RefreshCw,
  Download,
  ExternalLink,
  GraduationCap,
  FileText,
  ChevronRight,
  ClipboardList,
} from 'lucide-react';
import {
  fetchTeacherSubmissionRows,
  type TeacherSubmission,
} from '../../lib/teacherSubmissionLoad';
import { SubmissionOpenLink, submissionHasOpenableFileUrl } from '../../components/SubmissionOpenLink';
import { gradingLinkForSubmission } from '../../lib/gradingRoutes';
import type { SubStatus } from '../../types';

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

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length >= 2) return (p[0][0] + p[p.length - 1][0]).toUpperCase().slice(0, 2);
  if (p.length === 1 && p[0].length >= 2) return p[0].slice(0, 2).toUpperCase();
  return p[0]?.[0]?.toUpperCase() ?? '?';
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
  const [rows, setRows] = useState<TeacherSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<SubStatus | 'all'>('all');

  async function load() {
    setLoading(true);
    try {
      setRows(await fetchTeacherSubmissionRows());
    } catch (e) {
      console.error('[student-submissions]', e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
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
    <div className="min-h-full bg-gradient-to-b from-slate-100/90 via-[#f7f8fa] to-slate-100/70">
      <div className="max-w-3xl lg:max-w-5xl mx-auto px-4 sm:px-6 py-8 md:py-10">
        <header className="mb-10">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
            <div>
              <p className="text-xs font-semibold tracking-[0.12em] uppercase text-[#84001B]">
                Inbox · Student work
              </p>
              <h1 className="text-3xl font-bold text-slate-900 mt-2 tracking-tight">
                Submission roster
              </h1>
              <p className="mt-3 text-sm text-slate-600 max-w-xl leading-relaxed">
                A calm, student-first timeline of everything that landed in your course workspace—organized by
                submission title so you see <span className="font-medium text-slate-800">who sent what</span> before you
                switch into scoring mode.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 border border-slate-200/80 px-3 py-1 shadow-sm">
                  <GraduationCap className="w-3.5 h-3.5 text-[#84001B]" />
                  {loading ? '—' : `${summary.total} files on record`}
                </span>
                {!loading && summary.newToYou > 0 && (
                  <span className="rounded-full bg-[#84001B] text-white px-2.5 py-0.5 font-semibold shadow-sm">
                    {summary.newToYou} unseen
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Sync roster
              </button>
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <Download className="w-3.5 h-3.5" />
                CSV export
              </button>
              <Link
                to="/grading"
                className="inline-flex items-center gap-2 rounded-xl bg-[#84001B] px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-[#84001B]/25 hover:bg-[#6b0016]"
              >
                Grading workspace
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {!loading && (
            <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { k: 'New', v: summary.newToYou, hint: 'awaiting review' },
                { k: 'Reviewing', v: summary.inFlight, hint: 'in progress' },
                { k: 'Graded', v: summary.done, hint: 'returned' },
                { k: 'Resubmit', v: summary.resubmit, hint: 'student action' },
              ].map(({ k, v, hint }) => (
                <div
                  key={k}
                  className="rounded-2xl border border-slate-200/90 bg-white/80 backdrop-blur-sm px-4 py-3 shadow-sm"
                >
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{k}</p>
                  <p className="text-2xl font-bold tabular-nums text-slate-900 mt-0.5">{v}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>
                </div>
              ))}
            </div>
          )}
        </header>

        <div className="rounded-2xl border border-slate-200/90 bg-white/70 backdrop-blur-md p-4 sm:p-5 shadow-sm mb-8">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by learner, email, submission title, filename…"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B]/40 bg-white"
              />
            </div>
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
          </div>
        </div>

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
                      <li key={s.id}>
                        <div
                          className={`rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden border-l-[5px] ${STATUS_CHIP[s.status]}`}
                        >
                          <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              <div
                                className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#84001B] to-[#5c0014] text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-inner"
                                aria-hidden
                              >
                                {initials(name)}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-900 truncate">{name}</p>
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
                                {STATUS_LABEL[s.status]}
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
                                <Link
                                  to={gradingLinkForSubmission(s.id)}
                                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 text-white text-xs font-semibold px-3 py-2 hover:bg-slate-800 shadow-sm"
                                >
                                  Evaluate & score
                                  <ChevronRight className="w-3.5 h-3.5 opacity-90" />
                                </Link>
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
      </div>
    </div>
  );
}

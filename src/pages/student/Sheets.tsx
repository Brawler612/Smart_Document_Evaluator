import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Table2,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  Upload,
  Star,
} from 'lucide-react';
import {
  StudentPageHero,
  StudentStatusPill,
  StudentWorkspaceShell,
  studentCardClasses,
} from '../../components/student/StudentWorkspaceChrome';
import {
  formatShortDate,
  useStudentWorkspace,
  type StudentSubmissionRow,
} from '../../lib/studentWorkspaceData';
import {
  SubmissionOpenLink,
  submissionHasOpenableFileUrl,
} from '../../components/SubmissionOpenLink';

type SortKey = 'submitted_at' | 'title' | 'document_type' | 'status' | 'score' | 'file_name';
type SortDir = 'asc' | 'desc';

interface Row {
  s: StudentSubmissionRow;
  title: string;
  documentType: string;
}

function compareRows(a: Row, b: Row, key: SortKey, dir: SortDir): number {
  const sign = dir === 'asc' ? 1 : -1;
  const va: string | number =
    key === 'submitted_at'
      ? new Date(a.s.submitted_at).getTime() || 0
      : key === 'score'
      ? a.s.score ?? -1
      : key === 'title'
      ? a.title.toLowerCase()
      : key === 'document_type'
      ? a.documentType.toLowerCase()
      : key === 'status'
      ? a.s.status
      : a.s.file_name.toLowerCase();
  const vb: string | number =
    key === 'submitted_at'
      ? new Date(b.s.submitted_at).getTime() || 0
      : key === 'score'
      ? b.s.score ?? -1
      : key === 'title'
      ? b.title.toLowerCase()
      : key === 'document_type'
      ? b.documentType.toLowerCase()
      : key === 'status'
      ? b.s.status
      : b.s.file_name.toLowerCase();
  if (va < vb) return -1 * sign;
  if (va > vb) return 1 * sign;
  return 0;
}

function downloadCsv(rows: Row[], filename: string): void {
  const header = ['Submitted', 'Assignment', 'Document type', 'File name', 'Status', 'Score', 'Feedback'];
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [header.join(',')];
  rows.forEach((r) => {
    lines.push(
      [
        formatShortDate(r.s.submitted_at),
        r.title,
        r.documentType,
        r.s.file_name,
        r.s.status,
        r.s.score ?? '',
        r.s.feedback ?? '',
      ]
        .map(escape)
        .join(',')
    );
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function StudentSheets() {
  const { loading, submissions } = useStudentWorkspace();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'submitted' | 'under_review' | 'reviewed' | 'resubmit'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('submitted_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const rows: Row[] = useMemo(
    () =>
      submissions.map((s) => ({
        s,
        title: s.assignment_title || s.file_name,
        documentType: s.submission_doc_type || s.assignment_doc_type || 'Other',
      })),
    [submissions]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (statusFilter !== 'all' && r.s.status !== statusFilter) return false;
        if (q) {
          const hay = `${r.title} ${r.documentType} ${r.s.file_name} ${r.s.feedback ?? ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => compareRows(a, b, sortKey, sortDir));
  }, [rows, search, statusFilter, sortKey, sortDir]);

  const reviewed = rows.filter((r) => r.s.status === 'reviewed' && r.s.score != null);
  const avgScore = reviewed.length
    ? Math.round(reviewed.reduce((acc, r) => acc + (r.s.score ?? 0), 0) / reviewed.length)
    : null;
  const bestScore = reviewed.length ? Math.max(...reviewed.map((r) => r.s.score ?? 0)) : null;

  function onSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'submitted_at' || key === 'score' ? 'desc' : 'asc');
    }
  }

  function HeaderCell({ k, label, align = 'left' }: { k: SortKey; label: string; align?: 'left' | 'center' | 'right' }) {
    const active = sortKey === k;
    const Arrow = !active ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th
        className={`px-3 py-2.5 text-${align} font-semibold uppercase tracking-wide whitespace-nowrap`}
        scope="col"
      >
        <button
          type="button"
          onClick={() => onSort(k)}
          className={`inline-flex items-center gap-1 transition-colors ${
            active ? 'text-white' : 'text-white/85 hover:text-white'
          }`}
        >
          {label}
          <Arrow className="w-3 h-3 opacity-80" aria-hidden />
        </button>
      </th>
    );
  }

  return (
    <StudentWorkspaceShell>
      <StudentPageHero
        eyebrow="Workspace · Sheets"
        title="Sheets"
        icon={Table2}
        description="A spreadsheet of every submission with sorting, filtering, and one-click CSV export — like a personal gradebook."
        kpis={[
          { label: 'Rows', value: loading ? '—' : rows.length },
          { label: 'Best', value: loading ? '—' : bestScore != null ? `${bestScore}%` : '—', accent: 'yellow' },
          { label: 'Avg', value: loading ? '—' : avgScore != null ? `${avgScore}%` : '—' },
        ]}
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          <div className="relative flex-1 sm:max-w-md">
            <Search
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
              aria-hidden
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, file, type, or feedback…"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B]/40 bg-white shadow-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="appearance-none px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white shadow-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#84001B]/20"
          >
            <option value="all">All statuses</option>
            <option value="submitted">Submitted</option>
            <option value="under_review">Under review</option>
            <option value="reviewed">Graded</option>
            <option value="resubmit">Redo requested</option>
          </select>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => downloadCsv(filtered, `student-sheets-${new Date().toISOString().slice(0, 10)}.csv`)}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" aria-hidden /> Export CSV
          </button>
          <Link
            to="/assignments"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#84001B] px-3.5 py-2 text-xs font-bold text-[#ffd21a] shadow-md shadow-[#84001B]/20 hover:bg-[#6b0016]"
          >
            <Upload className="w-3.5 h-3.5" aria-hidden /> Submit
          </Link>
        </div>
      </div>

      <div className={`${studentCardClasses} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-[13px]">
            <thead>
              <tr className="bg-[#84001B] text-white text-[11px]">
                <HeaderCell k="submitted_at" label="Submitted" />
                <HeaderCell k="title" label="Assignment" />
                <HeaderCell k="document_type" label="Type" align="center" />
                <HeaderCell k="file_name" label="File" />
                <HeaderCell k="status" label="Status" align="center" />
                <HeaderCell k="score" label="Score" align="right" />
                <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap">
                  File link
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {[...Array(7)].map((__, j) => (
                      <td key={j} className="px-3 py-3">
                        <div className="h-4 bg-slate-100 rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                    {rows.length === 0
                      ? 'No submissions yet — uploads will populate this gradebook.'
                      : 'No rows match the current filter.'}
                  </td>
                </tr>
              ) : (
                filtered.map(({ s, title, documentType }) => (
                  <tr key={s.id} className="bg-white hover:bg-[#fff8f9] transition-colors align-top">
                    <td className="px-3 py-3 text-[12px] tabular-nums text-slate-600 whitespace-nowrap">
                      {formatShortDate(s.submitted_at)}
                    </td>
                    <td className="px-3 py-3 min-w-[14rem]">
                      <p className="font-semibold text-slate-900 truncate" title={title}>
                        {title}
                      </p>
                      {s.feedback && (
                        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1" title={s.feedback}>
                          {s.feedback}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wide bg-rose-100 text-[#84001B]">
                        {documentType}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-700 truncate min-w-[10rem]" title={s.file_name}>
                      {s.file_name}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <StudentStatusPill status={s.status} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      {s.score != null ? (
                        <span className="inline-flex items-center gap-1 text-[12px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                          <Star className="w-3 h-3" aria-hidden /> {s.score}%
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      {submissionHasOpenableFileUrl(s.file_url) && s.file_url ? (
                        <SubmissionOpenLink
                          raw={s.file_url}
                          fileName={s.file_name}
                          className="text-xs font-bold text-[#84001B] hover:underline"
                        />
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {!loading && rows.length > 0 && (
        <p className="mt-4 text-[11px] text-slate-500">
          Showing <span className="font-bold text-slate-700">{filtered.length}</span> of {rows.length} submissions
          {statusFilter !== 'all' ? ` filtered by ${statusFilter.replace(/_/g, ' ')}` : ''}
          {search ? ` matching “${search}”` : ''}.
        </p>
      )}
    </StudentWorkspaceShell>
  );
}

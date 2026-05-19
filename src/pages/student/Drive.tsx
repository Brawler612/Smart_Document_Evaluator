import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Folder,
  Search,
  FileText,
  FileImage,
  FileCode,
  FileSpreadsheet,
  FileType,
  Upload,
  LayoutGrid,
  List as ListIcon,
  Filter,
  HardDrive,
} from 'lucide-react';
import {
  describeSubmissionFile,
  formatBytes,
  useSubmissionFileMeta,
  type SubmissionFileMeta,
} from '../../lib/submissionFileMeta';
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

type ViewMode = 'grid' | 'list';

interface FileRow {
  id: string;
  name: string;
  type: string;
  ext: string;
  documentType: string;
  status: string;
  score: number | null;
  submittedAt: string;
  submission: StudentSubmissionRow;
  hasFile: boolean;
  meta: SubmissionFileMeta;
}

function fileExtension(name: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(name);
  return m ? m[1].toLowerCase() : '';
}

function classifyExt(ext: string): 'pdf' | 'doc' | 'image' | 'sheet' | 'code' | 'text' | 'other' {
  if (ext === 'pdf') return 'pdf';
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'doc';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return 'sheet';
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'cpp', 'c', 'json', 'xml', 'html', 'css'].includes(ext)) return 'code';
  if (['txt', 'md', 'markdown'].includes(ext)) return 'text';
  return 'other';
}

const KIND_META: Record<ReturnType<typeof classifyExt>, { Icon: typeof FileText; tint: string; label: string }> = {
  pdf: { Icon: FileType, tint: 'bg-red-100 text-red-700', label: 'PDF' },
  doc: { Icon: FileText, tint: 'bg-blue-100 text-blue-700', label: 'Document' },
  image: { Icon: FileImage, tint: 'bg-emerald-100 text-emerald-700', label: 'Image' },
  sheet: { Icon: FileSpreadsheet, tint: 'bg-amber-100 text-amber-800', label: 'Sheet' },
  code: { Icon: FileCode, tint: 'bg-violet-100 text-violet-700', label: 'Code' },
  text: { Icon: FileText, tint: 'bg-slate-100 text-slate-700', label: 'Text' },
  other: { Icon: FileText, tint: 'bg-rose-100 text-[#84001B]', label: 'File' },
};

export default function StudentDrive() {
  const { loading, submissions } = useStudentWorkspace();
  const [search, setSearch] = useState('');
  const [type, setType] = useState<string>('all');
  const [view, setView] = useState<ViewMode>('grid');

  const files: FileRow[] = useMemo(
    () =>
      submissions.map((s) => {
        const ext = fileExtension(s.file_name);
        return {
          id: s.id,
          name: s.file_name,
          type: classifyExt(ext),
          ext,
          documentType: s.submission_doc_type || s.assignment_doc_type || 'SPP',
          status: s.status,
          score: s.score ?? null,
          submittedAt: s.submitted_at,
          submission: s,
          hasFile: submissionHasOpenableFileUrl(s.file_url),
          meta: describeSubmissionFile(s.file_url, s.file_name),
        };
      }),
    [submissions]
  );

  const totalBytes = useMemo(
    () => files.reduce((acc, f) => acc + (f.meta.bytes ?? 0), 0),
    [files]
  );

  const docTypes = useMemo(() => {
    const set = new Set(files.map((f) => f.documentType));
    return ['all', ...Array.from(set).sort()];
  }, [files]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return files.filter((f) => {
      if (type !== 'all' && f.documentType !== type) return false;
      if (q && !`${f.name} ${f.documentType} ${f.ext}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [files, search, type]);

  const totalSize = filtered.length;
  const usableLinks = filtered.filter((f) => f.hasFile).length;

  return (
    <StudentWorkspaceShell>
      <StudentPageHero
        eyebrow="Workspace · Drive"
        title="Drive"
        icon={Folder}
        description="Every file you've uploaded, in one searchable browser. Open the originals or jump back to Submission status for context."
        kpis={[
          { label: 'Files', value: loading ? '—' : files.length },
          { label: 'Total size', value: loading ? '—' : formatBytes(totalBytes || null), accent: 'yellow' },
          { label: 'Openable', value: loading ? '—' : usableLinks },
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
              placeholder="Search files by name, type, or extension…"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B]/40 bg-white shadow-sm"
            />
          </div>
          <div className="relative">
            <Filter
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
              aria-hidden
            />
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="appearance-none pl-9 pr-8 py-2.5 rounded-xl border border-slate-200 text-sm bg-white shadow-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B]/40"
            >
              {docTypes.map((t) => (
                <option key={t} value={t}>
                  {t === 'all' ? 'All document types' : t}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setView('grid')}
              aria-pressed={view === 'grid'}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                view === 'grid' ? 'bg-[#84001B] text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" aria-hidden /> Grid
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              aria-pressed={view === 'list'}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                view === 'list' ? 'bg-[#84001B] text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <ListIcon className="w-3.5 h-3.5" aria-hidden /> List
            </button>
          </div>
          <Link
            to="/assignments"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#84001B] px-3.5 py-2 text-xs font-bold text-[#ffd21a] shadow-md shadow-[#84001B]/20 hover:bg-[#6b0016]"
          >
            <Upload className="w-3.5 h-3.5" aria-hidden /> Upload
          </Link>
        </div>
      </div>

      {loading ? (
        view === 'grid' ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-40 rounded-2xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        )
      ) : filtered.length === 0 ? (
        <div className={`${studentCardClasses} p-10 text-center`}>
          <div className="mx-auto w-14 h-14 rounded-2xl bg-[#84001B]/10 flex items-center justify-center text-[#84001B] mb-3">
            <Folder className="w-7 h-7" aria-hidden />
          </div>
          <h3 className="font-bold text-slate-900">{files.length === 0 ? 'No files yet' : 'Nothing matches'}</h3>
          <p className="text-sm text-slate-500 mt-1.5 max-w-sm mx-auto">
            {files.length === 0
              ? 'Files appear here as you upload them on the Submit page.'
              : 'Try clearing the search or switching the type filter.'}
          </p>
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((f) => (
            <DriveGridCard key={f.id} f={f} />
          ))}
        </div>
      ) : (
        <div className={`${studentCardClasses} overflow-hidden`}>
          <ul className="divide-y divide-slate-100">
            {filtered.map((f) => (
              <DriveListRow key={f.id} f={f} />
            ))}
          </ul>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <p className="mt-4 text-[11px] text-slate-500">
          Showing <span className="font-bold text-slate-700">{totalSize}</span> file{totalSize !== 1 ? 's' : ''}
          {type !== 'all' ? ` of type ${type}` : ''}
          {search ? ` matching “${search}”` : ''}.
        </p>
      )}
    </StudentWorkspaceShell>
  );
}

function useResolvedFileMeta(f: FileRow): { meta: SubmissionFileMeta; measuring: boolean } {
  const { meta: live, measuring } = useSubmissionFileMeta(f.submission.file_url, f.name);
  return { meta: live.bytes != null ? live : f.meta, measuring };
}

function DriveGridCard({ f }: { f: FileRow }) {
  const kind = KIND_META[f.type as keyof typeof KIND_META];
  const Icon = kind.Icon;
  const { meta, measuring } = useResolvedFileMeta(f);

  return (
    <article className="group rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md hover:border-[#84001B]/25 transition-all overflow-hidden flex flex-col">
      <div
        className={`relative h-24 ${kind.tint.replace('text-', 'text-').split(' ')[0]} flex items-center justify-center bg-opacity-100 ${kind.tint}`}
      >
        <Icon className="w-10 h-10 opacity-70" aria-hidden />
        <span className="absolute top-2 right-2 text-[10px] font-bold uppercase tracking-wide bg-white/85 px-1.5 py-0.5 rounded">
          {f.ext || kind.label}
        </span>
        <span
          className="absolute bottom-2 right-2 inline-flex items-center gap-1 text-[10px] font-bold bg-white/90 text-slate-700 px-1.5 py-0.5 rounded tabular-nums"
          title={
            meta.bytes != null
              ? `${meta.bytes.toLocaleString()} bytes`
              : measuring
              ? 'Measuring file size…'
              : 'Size unavailable'
          }
        >
          <HardDrive className="w-3 h-3" aria-hidden />
          {meta.bytes == null && measuring ? '…' : meta.sizeLabel}
        </span>
      </div>
      <div className="p-3 flex flex-col gap-2 flex-1">
        <p className="text-[13px] font-bold text-slate-900 leading-snug line-clamp-2" title={f.name}>
          {f.name}
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wide bg-rose-100 text-[#84001B]">
            {f.documentType}
          </span>
          <StudentStatusPill status={f.status} />
        </div>
        <dl className="text-[11px] text-slate-500 grid grid-cols-2 gap-x-2 gap-y-1 mt-auto">
          <div className="col-span-2 flex items-center gap-1.5 min-w-0">
            <dt className="font-bold text-slate-400 uppercase tracking-wide text-[9px]">MIME</dt>
            <dd className="truncate font-mono text-[10px] text-slate-600" title={meta.mime}>
              {meta.mime}
            </dd>
          </div>
          <div className="flex items-center gap-1">
            <dt className="font-bold text-slate-400 uppercase tracking-wide text-[9px]">Sent</dt>
            <dd className="text-slate-600">{formatShortDate(f.submittedAt)}</dd>
          </div>
          <div className="flex items-center gap-1 justify-end">
            <dt className="font-bold text-slate-400 uppercase tracking-wide text-[9px]">Where</dt>
            <dd className="text-slate-600 truncate" title={meta.urlKindLabel}>
              {meta.urlKindLabel}
            </dd>
          </div>
        </dl>
        <div className="flex items-center justify-between gap-2 pt-1">
          {f.hasFile && f.submission.file_url ? (
            <SubmissionOpenLink
              raw={f.submission.file_url}
              fileName={f.name}
              className="text-[11px] font-bold text-[#84001B] hover:underline"
            />
          ) : (
            <span className="text-[11px] text-slate-400">Local only</span>
          )}
          <Link
            to="/my-submissions"
            className="text-[11px] font-semibold text-slate-500 hover:text-[#84001B]"
          >
            Details →
          </Link>
        </div>
      </div>
    </article>
  );
}

function DriveListRow({ f }: { f: FileRow }) {
  const kind = KIND_META[f.type as keyof typeof KIND_META];
  const Icon = kind.Icon;
  const { meta, measuring } = useResolvedFileMeta(f);
  const sizeText = meta.bytes == null && measuring ? 'Measuring…' : meta.sizeLabel;
  const sizeTitle =
    meta.bytes != null
      ? `${meta.bytes.toLocaleString()} bytes`
      : measuring
      ? 'Measuring file size…'
      : 'Cloud-hosted';

  return (
    <li className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${kind.tint}`}>
        <Icon className="w-5 h-5" aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900 truncate" title={f.name}>
          {f.name}
        </p>
        <p className="text-[11px] text-slate-500 truncate">
          {f.documentType} · {f.ext.toUpperCase() || kind.label} · {formatShortDate(f.submittedAt)} ·{' '}
          <span className="font-mono text-slate-600" title={sizeTitle}>
            {sizeText}
          </span>{' '}
          ·{' '}
          <span className="font-mono text-slate-500" title={meta.mime}>
            {meta.mime}
          </span>
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span
          className="hidden md:inline-flex items-center gap-1 text-[11px] font-bold tabular-nums bg-[#84001B]/8 text-[#84001B] border border-[#84001B]/15 px-2 py-0.5 rounded-full"
          title={sizeTitle}
        >
          <HardDrive className="w-3 h-3" aria-hidden />
          {sizeText}
        </span>
        {f.score != null && (
          <span className="text-[11px] font-bold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
            {f.score}%
          </span>
        )}
        <StudentStatusPill status={f.status} />
        {f.hasFile && f.submission.file_url ? (
          <SubmissionOpenLink
            raw={f.submission.file_url}
            fileName={f.name}
            className="text-xs font-bold text-[#84001B] hover:underline whitespace-nowrap"
          />
        ) : (
          <span className="text-xs text-slate-400">Local only</span>
        )}
      </div>
    </li>
  );
}

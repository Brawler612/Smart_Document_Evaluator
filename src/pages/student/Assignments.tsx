import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Search,
  ClipboardList,
  Upload,
  Calendar,
  X,
  FileText,
  ChevronDown,
  CheckCircle2,
  Zap,
  ListChecks,
  Copy,
  Check,
  Settings,
  RefreshCw,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { resolveStudentSubmissionFileUrl } from '../../lib/submissionStorage';
import { syncLocalSubmissionsToSupabase } from '../../lib/localSubmissionSync';
import { ensureAppUserProfile } from '../../lib/userProfilePersistence';
import { useAuth } from '../../context/AuthContext';
interface Assignment {
  id: string;
  title: string;
  description: string | null;
  document_type: string;
  due_date: string | null;
  status: string;
  submitted?: boolean;
}

const DOC_COLORS: Record<string, string> = {
  SRS: 'bg-[#84001B]/12 text-[#84001B]',
  SDD: 'bg-[#ffd21a]/35 text-[#5c0014]',
  SPMP: 'bg-red-50 text-red-800',
  STD: 'bg-violet-100 text-violet-900',
  Other: 'bg-slate-100 text-slate-600',
};

const QUICK_DOC_TYPES = ['SRS', 'SDD', 'SPMP', 'STD'] as const;

function isMissingSubmissionDocTypeColumn(message: string | undefined): boolean {
  return /submission_doc_type|could not find|column|pgrst204|schema cache/i.test(message ?? '');
}

function submissionDocTypeFromAssignment(dt: string): string {
  const x = dt.trim();
  if (x === 'SRS' || x === 'SDD' || x === 'SPMP' || x === 'STD' || x === 'Other') return x;
  return 'Other';
}

/** Quick submit: empty = no submission_doc_type (DB allows SRS/SDD/SPMP/STD/Other only). */
function submissionDocTypeFromQuickPick(code: string): string | undefined {
  const t = code.trim();
  if (!t) return undefined;
  return t;
}

function parseEmailList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map(v => v.trim().toLowerCase())
    .filter(Boolean);
}

const ADMIN_EMAILS = parseEmailList(import.meta.env.VITE_ADMIN_EMAILS);
const TEACHER_EMAILS = parseEmailList(import.meta.env.VITE_TEACHER_EMAILS);
const LOCAL_SUBMISSION_KEY = 'local_submission_fallback_v1';

/** Shared fields for Quick submit & Turn in modals—aligned with grading + Submission status flows. */
function SubmitUploadFields({
  variant,
  taskTitle,
  fileName,
  setFileName,
  selectedFile,
  setSelectedFile,
  submissionText,
  setSubmissionText,
  quickDocType,
  onPickDocType,
}: {
  variant: 'quick' | 'task';
  taskTitle?: string | null;
  fileName: string;
  setFileName: (v: string) => void;
  selectedFile: File | null;
  setSelectedFile: (f: File | null) => void;
  submissionText: string;
  setSubmissionText: (v: string) => void;
  quickDocType?: string;
  onPickDocType?: (code: string) => void;
}) {
  const [pasteOpen, setPasteOpen] = useState(variant === 'task');
  const [docSearch, setDocSearch] = useState('');

  const filteredQuickTypes = QUICK_DOC_TYPES.filter((t) =>
    t.toLowerCase().includes(docSearch.trim().toLowerCase())
  );

  return (
    <div className="space-y-5">
      {variant === 'quick' && quickDocType != null && onPickDocType && (
        <section className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
          <label className="block text-sm font-semibold text-slate-800 mb-2">Document type</label>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden />
            <input
              type="search"
              value={docSearch}
              onChange={(e) => setDocSearch(e.target.value)}
              placeholder="Type to filter SRS, SDD, SPMP, STD…"
              className="w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B]"
              autoComplete="off"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {filteredQuickTypes.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  onPickDocType(opt);
                  setDocSearch('');
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors ${
                  opt === quickDocType
                    ? 'bg-[#84001B] text-[#ffd21a] ring-2 ring-[#84001B] ring-offset-2'
                    : `${DOC_COLORS[opt] ?? 'bg-slate-100 text-slate-700'} hover:opacity-90`
                }`}
              >
                {opt}
              </button>
            ))}
            <button
              type="button"
              title="Clear document type (no label for the grading queue)"
              onClick={() => {
                onPickDocType('');
                setDocSearch('');
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 normal-case tracking-normal hover:bg-slate-50"
            >
              Clear
            </button>
          </div>
          <p className="text-[11px] text-slate-500 mt-2 leading-snug">
            This label appears as the <span className="font-semibold text-slate-700">Title</span> in your instructor&apos;s grading queue.
          </p>
        </section>
      )}

      <div className="rounded-xl border border-[#84001B]/20 bg-[#84001B]/10 px-4 py-3.5">
        <div className="flex gap-2.5">
          {variant === 'quick' ? (
            <Zap className="w-4 h-4 text-[#84001B] shrink-0 mt-0.5" aria-hidden />
          ) : (
            <FileText className="w-4 h-4 text-[#84001B] shrink-0 mt-0.5" aria-hidden />
          )}
          <div className="min-w-0 text-xs text-slate-700 leading-relaxed space-y-2">
            {variant === 'quick' ? (
              <p>
                <span className="font-bold text-[#84001B] uppercase tracking-wide">Quick path · </span>
                Pick a document type above, upload one file—it queues under that title for staff. Confirm on{' '}
                <span className="font-semibold text-slate-900">Submission status</span>. Course staff finalize scores in the
                grading workspace.
              </p>
            ) : (
              <>
                <p className="font-bold text-[#84001B] uppercase tracking-wide mb-2">Linked to your task</p>
                <ul className="space-y-2">
                  <li>
                    <span className="font-semibold text-slate-900">Task:</span>{' '}
                    <span className="font-medium text-[#84001B]">{taskTitle || 'Course submission'}</span> — graders group
                    your file here.
                  </li>
                  <li>
                    <span className="font-semibold text-slate-900">Status:</span> same tracker as Quick submit—Submission
                    status shows submitted → in review → graded.
                  </li>
                  <li>
                    <span className="font-semibold text-slate-900">Text box:</span> Optional paste helps tooling read PDF /
                    Word; staff still download your uploaded file as the official copy.
                  </li>
                </ul>
              </>
            )}
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#84001B] text-white text-[11px]">
            1
          </span>
          {variant === 'quick' ? 'One file is enough' : 'Attach & label'}
        </div>
        <p className="text-[11px] text-slate-500 -mt-1">
          {variant === 'quick'
            ? 'Choosing a file fills the display name automatically. That’s all most people need for a fast drop-off.'
            : 'Pick your artifact first, tweak the visible name so graders recognize it instantly.'}
        </p>
        <div>
          <label htmlFor={`su-file-${variant}`} className="block text-sm font-semibold text-slate-800 mb-1.5">
            Attach file
          </label>
          <input
            id={`su-file-${variant}`}
            type="file"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setSelectedFile(f);
              if (f) {
                if (variant === 'quick' && quickDocType) setFileName(`${quickDocType}_${f.name}`);
                else setFileName(f.name);
              }
            }}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm file:mr-3 file:py-1.5 file:px-3 file:border-0 file:rounded-lg file:bg-[#84001B] file:text-white file:text-xs file:font-semibold bg-white"
          />
          {selectedFile && (
            <p className="text-[11px] text-slate-600 mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5 border border-slate-100">
              <span className="font-semibold">Selected:</span> {selectedFile.name}{' '}
              <span className="tabular-nums text-slate-500">
                ({selectedFile.size < 1048576
                  ? `${Math.max(1, Math.round(selectedFile.size / 1024))} KB`
                  : `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB`}
                )
              </span>
            </p>
          )}
        </div>
        <div>
          <label htmlFor={`su-name-${variant}`} className="block text-sm font-semibold text-slate-800 mb-1.5">
            Display name <span className="text-slate-400 font-normal text-xs font-medium">— required if no file</span>
          </label>
          <div className="relative">
            <FileText className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden />
            <input
              id={`su-name-${variant}`}
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder={variant === 'quick' ? 'Fills when you choose a file' : 'e.g. SRS_final_Group3.pdf'}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B] bg-white"
            />
          </div>
        </div>
      </section>

      {variant === 'quick' && !pasteOpen && (
        <button
          type="button"
          onClick={() => setPasteOpen(true)}
          className="w-full flex items-center justify-between gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-100 hover:border-slate-400 transition-colors text-left"
        >
          <span>
            Skip extra typing — or{' '}
            <span className="text-[#84001B]">add pasted text</span>{' '}
            <span className="font-normal text-slate-600 text-xs font-medium">for PDF/DOC-friendly review</span>
          </span>
          <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" aria-hidden />
        </button>
      )}

      {(variant === 'task' || pasteOpen) && (
        <section className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/50 p-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-300 text-slate-800 text-[11px]">
                2
              </span>
              Plain-text copy{' '}
              <span className="font-normal text-slate-400 normal-case font-medium">Optional</span>
            </div>
            {variant === 'quick' && pasteOpen && (
              <button
                type="button"
                onClick={() => setPasteOpen(false)}
                className="text-[11px] font-semibold text-slate-500 hover:text-[#84001B]"
              >
                Hide this section
              </button>
            )}
          </div>
          <div>
            <label htmlFor={`su-text-${variant}`} className="block text-sm font-semibold text-slate-800 mb-1.5">
              Paste for search & assists
            </label>
            <textarea
              id={`su-text-${variant}`}
              value={submissionText}
              onChange={(e) => setSubmissionText(e.target.value)}
              rows={variant === 'quick' ? 4 : 5}
              placeholder="Only if helpful: paste the body of your report so review tools don’t rely on PDF/Word alone…"
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B] resize-y bg-white leading-relaxed"
            />
            <p className="text-[11px] text-slate-600 mt-2 leading-relaxed">
              Not duplicated grading—the upload stays the official file. Paste is backup text for scanners and reviewer
              search when the attachment isn’t plain text.
            </p>
          </div>
        </section>
      )}

      <div className="flex gap-2.5 rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-3 text-[11px] text-slate-600 leading-relaxed">
        <ListChecks className="w-4 h-4 text-[#84001B] shrink-0 mt-0.5" aria-hidden />
        <p>
          After <span className="font-semibold text-slate-800">Send upload</span>, open{' '}
          <span className="font-semibold text-[#84001B]">Submission status</span> to verify. Posted scores only after
          course staff completes review—not from this dialogue alone.
        </p>
      </div>
    </div>
  );
}

export default function StudentAssignments() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const resubmitSubmissionId = searchParams.get('resubmit');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState<Assignment | null>(null);
  const [quickSubmitOpen, setQuickSubmitOpen] = useState(false);
  const [fileName, setFileName] = useState('');
  const [submissionText, setSubmissionText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [quickDocType, setQuickDocType] = useState<string>('SRS');
  const [saving, setSaving] = useState(false);
  const [assignmentTable, setAssignmentTable] = useState<'assignments' | 'assignment' | null>(null);
  const [submissionTable, setSubmissionTable] = useState<'submissions' | 'submission' | null>(null);
  /** True after load when neither `submissions` nor `submission` table exists (schema not applied in Supabase). */
  const [submissionSchemaMissing, setSubmissionSchemaMissing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitPageUrl] = useState(() => {
    if (typeof globalThis.window === 'undefined') return '/assignments';
    const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
    return `${globalThis.window.location.origin}${base}/assignments`;
  });
  const [linkCopied, setLinkCopied] = useState(false);

  async function resolveAssignmentTable(): Promise<'assignments' | 'assignment' | null> {
    if (assignmentTable) return assignmentTable;
    const plural = await supabase.from('assignments').select('id').limit(1);
    if (!plural.error) {
      setAssignmentTable('assignments');
      return 'assignments';
    }
    const singular = await supabase.from('assignment').select('id').limit(1);
    if (!singular.error) {
      setAssignmentTable('assignment');
      return 'assignment';
    }
    return null;
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
      setAssignments([]);
      setSubmissionSchemaMissing(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    setSubmissionSchemaMissing(false);
    try {
      await syncLocalSubmissionsToSupabase(user!.id);

      const subTable = await resolveSubmissionTable();
      setSubmissionSchemaMissing(!subTable);

      const table = await resolveAssignmentTable();
      if (!table) {
        setAssignments([]);
        return;
      }
      const [asgn, subs] = await Promise.all([
        supabase.from(table).select('*').eq('status', 'active').order('due_date', { ascending: true }),
        subTable
          ? supabase.from(subTable).select('assignment_id').eq('student_id', user!.id)
          : Promise.resolve({ data: [] as Array<{ assignment_id: string | null }>, error: null }),
      ]);
      const submittedIds = new Set((subs.data || []).map((s: { assignment_id: string }) => s.assignment_id));
      if (!subTable) {
        try {
          const localRaw = localStorage.getItem(LOCAL_SUBMISSION_KEY);
          const localRows = localRaw
            ? (JSON.parse(localRaw) as Array<{ student_id: string; assignment_id: string | null }>)
            : [];
          localRows
            .filter((row) => row.student_id === user!.id && row.assignment_id)
            .forEach((row) => submittedIds.add(row.assignment_id as string));
        } catch {
          /* ignore malformed local fallback rows */
        }
      }
      const data = (asgn.data || []).map(a => ({ ...a, submitted: submittedIds.has(a.id) }));
      setAssignments(data);
    } catch (err) {
      setAssignments([]);
      setLoadError(err instanceof Error ? err.message : 'Failed to load submission tasks.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [user]);

  async function ensureGeneralAssignment(): Promise<string | null> {
    const table = await resolveAssignmentTable();
    if (!table) return null;
    const title = 'General Submission';
    const existing = await supabase
      .from(table)
      .select('id')
      .eq('title', title)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    if (existing.data?.id) return existing.data.id;

    const anyGeneral = await supabase
      .from(table)
      .select('id')
      .eq('title', title)
      .limit(1)
      .maybeSingle();
    if (anyGeneral.data?.id) return anyGeneral.data.id;

    const anyActive = await supabase
      .from(table)
      .select('id')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    if (anyActive.data?.id) return anyActive.data.id;

    const anyAssignment = await supabase
      .from(table)
      .select('id')
      .limit(1)
      .maybeSingle();
    if (anyAssignment.data?.id) return anyAssignment.data.id;

    let teacherId: string | null = null;

    const byConfiguredEmail = await supabase
      .from('users')
      .select('id')
      .in('email', [...ADMIN_EMAILS, ...TEACHER_EMAILS])
      .limit(1)
      .maybeSingle();
    if (byConfiguredEmail.data?.id) teacherId = byConfiguredEmail.data.id;

    if (!teacherId) {
      const byRole = await supabase
        .from('users')
        .select('id')
        .in('role', ['teacher', 'admin'])
        .limit(1)
        .maybeSingle();
      if (byRole.data?.id) teacherId = byRole.data.id;
    }

    if (!teacherId && user?.id) teacherId = user.id;

    if (!teacherId) {
      const anyUser = await supabase
        .from('users')
        .select('id')
        .limit(1)
        .maybeSingle();
      if (anyUser.data?.id) teacherId = anyUser.data.id;
    }

    if (!teacherId) return null;

    const created = await supabase
      .from(table)
      .insert({
        title,
        description: 'Auto-generated bucket for general student uploads.',
        document_type: 'Other',
        teacher_id: teacherId,
        status: 'active',
        max_score: 100,
      })
      .select('id')
      .maybeSingle();

    if (created.error || !created.data?.id) return null;
    return created.data.id;
  }

  async function insertSubmissionDirect(
    finalFileName: string,
    extractedText: string,
    file: File | null,
    opts?: { submissionDocType?: string | null }
  ): Promise<void> {
    if (!user?.id) throw new Error('Please sign in with Google before submitting.');
    await ensureAppUserProfile(user);

    const subTable = await resolveSubmissionTable();
    const fileUrl = await resolveStudentSubmissionFileUrl({
      file,
      extractedText,
      studentId: user.id,
    });

    const assignmentId = await ensureGeneralAssignment();

    if (!subTable) {
      throw new Error(
        'Submissions are not saved to the cloud yet: the database has no `submissions` table. ' +
          'In Supabase → SQL Editor, run `docs/supabase-setup-all-in-one.sql` (or `docs/supabase-assignments-submissions-core.sql` after users exist), then click Run. ' +
          'After that, uploads persist for your account on every device.'
      );
    }

    const basePayload = {
      student_id: user.id,
      file_name: finalFileName,
      file_url: fileUrl,
      status: 'submitted' as const,
    };
    const dt = opts?.submissionDocType?.trim();
    const docExtras = dt ? { submission_doc_type: dt } : {};

    if (assignmentId) {
      let withAssignment = await supabase.from(subTable).insert({
        ...basePayload,
        ...docExtras,
        assignment_id: assignmentId,
      });
      if (
        withAssignment.error &&
        dt &&
        isMissingSubmissionDocTypeColumn(withAssignment.error.message)
      ) {
        withAssignment = await supabase.from(subTable).insert({
          ...basePayload,
          assignment_id: assignmentId,
        });
      }
      if (!withAssignment.error) return;
    }
    let noAssignment = await supabase.from(subTable).insert({ ...basePayload, ...docExtras });
    if (noAssignment.error && dt && isMissingSubmissionDocTypeColumn(noAssignment.error.message)) {
      noAssignment = await supabase.from(subTable).insert(basePayload);
    }
    if (noAssignment.error) {
      throw new Error(`Submit failed: ${noAssignment.error.message}`);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!submitting || (!fileName.trim() && !selectedFile)) return;
    if (submissionSchemaMissing) return;
    setSaving(true);
    const finalFileName = selectedFile?.name || fileName.trim();
    let extractedText = submissionText.trim();
    if (!extractedText && selectedFile) {
      const type = selectedFile.type.toLowerCase();
      const isTextLike = type.startsWith('text/') || /\.(txt|md|json|csv|xml|html|htm)$/i.test(selectedFile.name);
      if (isTextLike) {
        try {
          extractedText = await selectedFile.text();
        } catch {
          extractedText = '';
        }
      }
    }
    try {
      await insertSubmissionDirect(finalFileName, extractedText, selectedFile, {
        submissionDocType: submissionDocTypeFromAssignment(submitting.document_type),
      });
      setSubmitting(null);
      setFileName('');
      setSubmissionText('');
      setSelectedFile(null);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Submit failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleQuickSubmit(e: React.FormEvent) {
    e.preventDefault();
    if ((!fileName.trim() && !selectedFile) || !user?.id) return;
    if (submissionSchemaMissing) return;
    setSaving(true);
    try {
      const finalFileName = selectedFile?.name || fileName.trim();
      let extractedText = submissionText.trim();
      if (!extractedText && selectedFile) {
        const type = selectedFile.type.toLowerCase();
        const isTextLike = type.startsWith('text/') || /\.(txt|md|json|csv|xml|html|htm)$/i.test(selectedFile.name);
        if (isTextLike) {
          try {
            extractedText = await selectedFile.text();
          } catch {
            extractedText = '';
          }
        }
      }
      await insertSubmissionDirect(finalFileName, extractedText, selectedFile, {
        submissionDocType: submissionDocTypeFromQuickPick(quickDocType),
      });
      setQuickSubmitOpen(false);
      setFileName('');
      setSubmissionText('');
      setSelectedFile(null);
      setQuickDocType('SRS');
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Submit failed.');
    } finally {
      setSaving(false);
    }
  }

  const filtered = assignments.filter(a =>
    a.title.toLowerCase().includes(search.toLowerCase()) ||
    a.document_type.toLowerCase().includes(search.toLowerCase())
  );

  const upcoming = filtered.filter(a => !a.submitted);
  const submitted = filtered.filter(a => a.submitted);
  const searching = search.trim().length > 0;

  const canSendUpload = Boolean(fileName.trim() || selectedFile);

  const hasAnyTasks = assignments.length > 0;

  function openQuickSubmitModal() {
    setQuickSubmitOpen(true);
    setQuickDocType('SRS');
    setFileName('SRS');
    setSubmissionText('');
    setSelectedFile(null);
  }

  async function copySubmitLink() {
    try {
      await navigator.clipboard.writeText(submitPageUrl);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = submitPageUrl;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setLinkCopied(true);
        window.setTimeout(() => setLinkCopied(false), 2000);
      } catch {
        window.prompt('Copy this submit page link:', submitPageUrl);
      }
    }
  }

  return (
    <div className="flex min-h-full min-h-dvh w-full flex-1 flex-col bg-slate-50">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6 md:max-w-4xl md:px-6 md:py-8">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-slate-900 md:text-xl">Submit</h1>
            <p className="mt-0.5 max-w-lg text-[12px] leading-snug text-slate-500">
              General queue · track on{' '}
              <Link to="/my-submissions" className="font-medium text-[#84001B] hover:underline">
                Submission status
              </Link>
            </p>
          </div>
        </header>

        {!loading && submissionSchemaMissing && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950 shadow-sm"
          >
            <p className="font-semibold">Cloud submissions are not configured yet</p>
            <p className="mt-1.5 text-xs leading-relaxed text-red-900/95">
              Your Supabase project is missing the <span className="font-mono">submissions</span> table, so uploads
              cannot be saved for every device. <span className="font-semibold">Fastest fix:</span> in Supabase →{' '}
              <span className="font-semibold">Project Settings → Database</span>, copy the{' '}
              <span className="font-semibold">Connection string (URI)</span> with your DB password, put it in{' '}
              <span className="font-mono">.env</span> as <span className="font-mono">DATABASE_URL=...</span> (do not
              commit), then run <span className="font-mono">npm run db:apply</span> in this project folder.{' '}
              <span className="font-semibold">Or</span> open <span className="font-semibold">SQL Editor</span>, paste{' '}
              <span className="font-mono">docs/supabase-setup-all-in-one.sql</span>, click{' '}
              <span className="font-semibold">Run</span>, or use <span className="font-mono">npm run supabase:setup</span>{' '}
              to copy that file. If <span className="font-mono">public.users</span> already exists,{' '}
              <span className="font-mono">docs/supabase-assignments-submissions-core.sql</span> is enough. Then click{' '}
              <span className="font-semibold">Refresh task list</span> below (or reload the page).
            </p>
          </div>
        )}

        {resubmitSubmissionId && (
          <div
            role="status"
            className="mt-4 flex flex-col gap-2 rounded-xl border border-amber-400/70 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="min-w-0 leading-snug">
              <span className="font-semibold">Redo requested — </span>
              upload a new file below. Staff will compare it with your earlier submission (
              <span className="tabular-nums font-medium" title={resubmitSubmissionId}>
                ref {resubmitSubmissionId.replace(/^local_/, '').length <= 12
                  ? resubmitSubmissionId.replace(/^local_/, '')
                  : `${resubmitSubmissionId.replace(/^local_/, '').slice(0, 8)}…`}
              </span>
              ).
            </p>
            <button
              type="button"
              className="shrink-0 rounded-lg border border-amber-400/90 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100/90"
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.delete('resubmit');
                next.delete('assignment');
                setSearchParams(next, { replace: true });
              }}
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="flex flex-1 flex-col gap-3 pt-5">
          <section aria-labelledby="quick-actions-heading" className="rounded-lg border border-slate-200 bg-white p-3">
            <h2 id="quick-actions-heading" className="sr-only">
              Copy shortcut or upload
            </h2>
            <span id="submit-page-url-description" className="sr-only">
              Copied URL is your full submit page address: {submitPageUrl}.
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void copySubmitLink()}
                aria-live="polite"
                aria-describedby="submit-page-url-description"
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-800 hover:bg-slate-50"
              >
                {linkCopied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-green-600" aria-hidden />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                    Copy shortcut
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={openQuickSubmitModal}
                disabled={loading || submissionSchemaMissing}
                title={
                  submissionSchemaMissing
                    ? 'Run docs/supabase-setup-all-in-one.sql in Supabase first'
                    : undefined
                }
                className="inline-flex h-9 min-w-[7.5rem] flex-1 items-center justify-center gap-1.5 rounded-md bg-[#84001B] px-3 text-[13px] font-semibold text-[#ffd21a] hover:bg-[#6b0016] disabled:pointer-events-none disabled:opacity-45"
              >
                <Upload className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Upload file
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-slate-400">
              Assignments from your instructor list below when available.
            </p>
          </section>

          <details className="rounded-lg border border-slate-200 bg-white [&_summary::-webkit-details-marker]:hidden">
            <summary className="cursor-pointer px-3 py-2 text-[12px] font-medium text-slate-600 hover:bg-slate-50">
              Submission tips
            </summary>
            <ul className="border-t border-slate-100 px-3 py-2 text-[11px] leading-snug text-slate-500">
              <li className="py-1">Naming: include course code and deliverable type when you can.</li>
              <li className="py-1 border-t border-slate-50">Optional paste in the form helps search—not a duplicate official file.</li>
              <li className="py-1 border-t border-slate-50">Big files: finish upload, then confirm on Submission status.</li>
            </ul>
          </details>

          <nav aria-labelledby="other-features-heading" className="rounded-lg border border-slate-200 bg-white">
            <h2 id="other-features-heading" className="border-b border-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Other shortcuts
            </h2>
            <ul className="divide-y divide-slate-100">
              <li>
                <Link
                  to="/my-submissions"
                  className="flex items-center gap-3 px-3 py-2.5 text-[13px] text-slate-800 transition-colors hover:bg-slate-50"
                >
                  <FileText className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                  <span className="min-w-0 flex-1 font-medium">Submission status</span>
                  <span className="shrink-0 text-[11px] text-slate-400">History and grades</span>
                </Link>
              </li>
              <li>
                <Link
                  to="/settings"
                  className="flex items-center gap-3 px-3 py-2.5 text-[13px] text-slate-800 transition-colors hover:bg-slate-50"
                >
                  <Settings className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                  <span className="min-w-0 flex-1 font-medium">Account settings</span>
                  <span className="shrink-0 text-[11px] text-slate-400">Name and security</span>
                </Link>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-[13px] text-slate-800 transition-colors hover:bg-slate-50"
                >
                  <RefreshCw className={`h-4 w-4 shrink-0 text-slate-400 ${loading ? 'animate-spin' : ''}`} aria-hidden />
                  <span className="min-w-0 flex-1 font-medium">Refresh task list</span>
                  <span className="shrink-0 text-[11px] text-slate-400">From server</span>
                </button>
              </li>
            </ul>
          </nav>

        {!loading && hasAnyTasks && (
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Open to send</p>
              <p className="text-2xl font-bold text-slate-900 tabular-nums mt-0.5">{upcoming.length}</p>
            </div>
            <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Already sent</p>
              <p className="text-2xl font-bold text-slate-900 tabular-nums mt-0.5">{submitted.length}</p>
            </div>
          </div>
        )}

        {!loading && hasAnyTasks && (
          <div className="rounded-2xl border border-slate-200/90 bg-white/85 backdrop-blur-sm shadow-sm p-4 mb-6">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter tasks by title or document type…"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B]/40 bg-white"
              />
            </div>
          </div>
        )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-[100px] bg-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {loadError && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {loadError}
            </div>
          )}

          {!loading && searching && filtered.length === 0 && hasAnyTasks && (
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
              <span>
                No tasks match <span className="font-semibold">&ldquo;{search.trim()}&rdquo;</span>.
              </span>
              <button
                type="button"
                onClick={() => setSearch('')}
                className="shrink-0 font-semibold text-[#84001B] hover:underline text-left sm:text-right"
              >
                Clear filter
              </button>
            </div>
          )}

          {upcoming.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
                Open for upload ({upcoming.length})
              </h2>
              <div className="space-y-3">
                {upcoming.map((a) => (
                  <div
                    key={a.id}
                    className="bg-white border border-slate-200/90 rounded-2xl p-5 hover:shadow-md hover:border-[#84001B]/15 transition-all"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-11 h-11 bg-[#84001B]/10 rounded-xl flex items-center justify-center flex-shrink-0">
                        <ClipboardList className="w-5 h-5 text-[#84001B]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="font-semibold text-slate-900 truncate">{a.title}</h3>
                            {a.description && (
                              <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">{a.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                            <span
                              className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                                DOC_COLORS[a.document_type] ?? DOC_COLORS.Other
                              }`}
                            >
                              {a.document_type}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setSubmitting(a);
                                setFileName('');
                                setSubmissionText('');
                                setSelectedFile(null);
                              }}
                              disabled={submissionSchemaMissing}
                              title={
                                submissionSchemaMissing
                                  ? 'Run docs/supabase-setup-all-in-one.sql in Supabase first'
                                  : undefined
                              }
                              className="flex items-center gap-1.5 bg-[#84001B] text-white text-xs px-3 py-2 rounded-xl hover:bg-[#6b0016] transition-colors font-semibold shadow-sm disabled:pointer-events-none disabled:opacity-45"
                            >
                              <Upload className="w-3.5 h-3.5" />
                              Turn in
                            </button>
                          </div>
                        </div>
                        {a.due_date && (
                          <p className="text-xs text-slate-500 flex items-center gap-1 mt-2">
                            <Calendar className="w-3.5 h-3.5 shrink-0" aria-hidden />
                            Due {new Date(a.due_date).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {submitted.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
                Sent to your teacher ({submitted.length})
              </h2>
              <div className="space-y-3">
                {submitted.map((a) => (
                  <div
                    key={a.id}
                    className="bg-white border border-slate-200/80 rounded-2xl p-5 opacity-95"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-11 h-11 bg-[#ffd21a]/30 rounded-xl flex items-center justify-center flex-shrink-0">
                        <CheckCircle2 className="w-5 h-5 text-[#84001B]" aria-hidden />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-slate-900 truncate">{a.title}</h3>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                              DOC_COLORS[a.document_type] ?? DOC_COLORS.Other
                            }`}
                          >
                            {a.document_type}
                          </span>
                          <span className="text-[11px] font-bold uppercase tracking-wide text-[#84001B]">
                            Uploaded
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
        </div>
      </div>

      {submitting && (
        <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/55 backdrop-blur-sm">
          <div className="flex min-h-[100dvh] w-full items-center justify-center p-4 sm:p-6">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="turn-in-title"
              className="my-auto w-full max-w-lg max-h-[min(calc(100dvh-2rem),56rem)] overflow-y-auto rounded-2xl bg-white shadow-2xl border border-slate-200/80"
            >
            <div className="flex items-start justify-between gap-3 p-6 border-b border-slate-100 bg-slate-50/60 shrink-0">
              <div className="min-w-0">
                <h2 id="turn-in-title" className="font-bold text-slate-900 text-lg leading-tight">
                  Turn in work
                </h2>
                <p className="text-xs font-semibold text-[#84001B] mt-2 uppercase tracking-wide">Linked task</p>
                <p className="text-sm text-slate-700 font-medium truncate" title={submitting.title}>{submitting.title}</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Type:{' '}
                  <span className="font-semibold text-slate-700">{submitting.document_type}</span>
                </p>
              </div>
              <button type="button" onClick={() => setSubmitting(null)} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-white rounded-xl transition-colors shrink-0"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 pb-7">
              <SubmitUploadFields
                key="turn-in-fields"
                variant="task"
                taskTitle={submitting.title}
                fileName={fileName}
                setFileName={setFileName}
                selectedFile={selectedFile}
                setSelectedFile={setSelectedFile}
                submissionText={submissionText}
                setSubmissionText={setSubmissionText}
              />
              {!canSendUpload && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-4">
                  Choose a file or type a display name before sending.
                </p>
              )}
              <div className={`flex gap-3 pt-4 border-t border-slate-100 ${canSendUpload ? 'mt-6' : 'mt-4'}`}>
                <button type="button" onClick={() => setSubmitting(null)}
                  className="flex-1 px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">Cancel</button>
                <button type="submit" disabled={saving || !canSendUpload || submissionSchemaMissing}
                  className="flex-1 bg-[#84001B] text-white px-4 py-3 rounded-xl text-sm font-semibold hover:bg-[#6b0016] transition-colors disabled:opacity-50 shadow-md shadow-[#84001B]/20">
                  {saving ? 'Sending…' : 'Send upload'}
                </button>
              </div>
            </form>
            </div>
          </div>
        </div>
      )}

      {quickSubmitOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/55 backdrop-blur-sm">
          <div className="flex min-h-[100dvh] w-full items-center justify-center p-4 sm:p-6">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="quick-submit-modal-title"
              className="my-auto w-full max-w-lg max-h-[min(calc(100dvh-2rem),56rem)] overflow-y-auto rounded-2xl bg-white shadow-2xl border border-slate-200/80"
            >
            <div className="flex items-start justify-between gap-3 p-6 border-b border-slate-100 bg-slate-50/60 shrink-0">
              <div>
                <h2 id="quick-submit-modal-title" className="font-bold text-slate-900 text-lg leading-tight">
                  Quick submit
                </h2>
                <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                  Choose SRS, SDD, SPMP, or STD (or <span className="font-semibold">Clear</span> to drop the type), attach
                  your file—the{' '}
                  <span className="font-semibold text-[#84001B]">Title</span> staff see matches your choice (still tied to the
                  general course queue).
                </p>
              </div>
              <button type="button" onClick={() => setQuickSubmitOpen(false)} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-white rounded-xl transition-colors shrink-0"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleQuickSubmit} className="p-6 pb-7">
              <SubmitUploadFields
                key="quick-fields"
                variant="quick"
                quickDocType={quickDocType}
                onPickDocType={(code) => {
                  setQuickDocType(code);
                  setFileName(code);
                }}
                fileName={fileName}
                setFileName={setFileName}
                selectedFile={selectedFile}
                setSelectedFile={setSelectedFile}
                submissionText={submissionText}
                setSubmissionText={setSubmissionText}
              />
              {!canSendUpload && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-4 mb-[-0.25rem]">
                  Choose a file or type a display name before sending.
                </p>
              )}
              <div className="flex gap-3 pt-4 border-t border-slate-100 mt-6">
                <button type="button" onClick={() => setQuickSubmitOpen(false)}
                  className="flex-1 px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">Cancel</button>
                <button type="submit" disabled={saving || !canSendUpload || submissionSchemaMissing}
                  className="flex-1 bg-[#84001B] text-white px-4 py-3 rounded-xl text-sm font-semibold hover:bg-[#6b0016] transition-colors disabled:opacity-50 shadow-md shadow-[#84001B]/20">
                  {saving ? 'Sending…' : 'Send upload'}
                </button>
              </div>
            </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

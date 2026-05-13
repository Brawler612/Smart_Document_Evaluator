import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  GraduationCap,
  Mail,
  Calendar,
  ChevronRight,
  RefreshCw,
  Users,
  ClipboardList,
  FileText,
  UserMinus,
  Download,
  Printer,
  Trash,
} from 'lucide-react';
import {
  isStudentHiddenFromTeacherDirectory,
  isSubmissionHiddenFromTeacherDirectory,
  loadDirectoryRemovalLedger,
  persistRemoveStudentFromDirectory,
  resetDirectoryRemovalLedger,
  type DirectoryRemovalLedger,
} from '../../lib/classDirectoryRemoval';
import { getClassRosterCacheStudents, mergeStudentRosterPreferDb } from '../../lib/classRosterCache';
import { supabase, getSupabaseProjectHost } from '../../lib/supabase';
import { isUsersTableMissingError } from '../../lib/supabaseUsersSetupHint';
import { syncAllLocalSubmissionsToSupabase } from '../../lib/localSubmissionSync';
import {
  fetchTeacherSubmissionRows,
  submissionQueueTitle,
  type TeacherSubmission,
} from '../../lib/teacherSubmissionLoad';
import { performTeacherResubmitRequest } from '../../lib/teacherResubmitRequest';
import { deleteTeacherSubmissionsByIds } from '../../lib/teacherDeleteSubmissions';
import { gradingLinkForSubmission } from '../../lib/gradingRoutes';
import TeacherSubmissionRosterTable from '../../components/teacher/TeacherSubmissionRosterTable';
import UserAvatar from '../../components/UserAvatar';
import { mergeIt332Sem2RosterWithDatabase } from '../../lib/mergeIt332Sem2Roster';
import { IT332_COHORT_DESCRIPTOR } from '../../data/it332Sem2ClassRoster';
import type { AppUser, SubStatus } from '../../types';

function looksLikeUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id.trim());
}

function formatClassListDateTime(iso: string | null | undefined): string {
  if (!iso?.trim()) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadTextFile(filename: string, body: string, mime: string) {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.click();
  URL.revokeObjectURL(url);
}

/** Min ms between background refreshes — stops a fresh refetch every time the tab regains focus. */
const BACKGROUND_REFRESH_MIN_GAP_MS = 30_000;

function signatureForStudents(rows: AppUser[]): string {
  /** Cheap composite key: count + tab-separated id|name|team|status hints. */
  if (rows.length === 0) return '0';
  let out = String(rows.length);
  for (const r of rows) {
    out += `|${r.id}:${r.full_name ?? ''}:${r.team_code ?? ''}:${r.roster_pending ? 'P' : 'A'}`;
  }
  return out;
}

function signatureForSubmissions(rows: TeacherSubmission[]): string {
  if (rows.length === 0) return '0';
  let out = String(rows.length);
  for (const r of rows) {
    out += `|${r.id}:${r.status}:${r.updated_at ?? r.submitted_at}:${r.score ?? ''}`;
  }
  return out;
}

export default function UserManagement() {
  const [students, setStudents] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [usersTableMissing, setUsersTableMissing] = useState(false);
  const [search, setSearch] = useState('');

  const [subRows, setSubRows] = useState<TeacherSubmission[]>([]);
  const [subLoading, setSubLoading] = useState(true);
  const [submissionSearch, setSubmissionSearch] = useState('');
  const [submissionFilter, setSubmissionFilter] = useState<SubStatus | 'all'>('all');
  const [resubmitSavingId, setResubmitSavingId] = useState<string | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const [removedLedger, setRemovedLedger] = useState<DirectoryRemovalLedger>(() => loadDirectoryRemovalLedger());
  const [removeBusyId, setRemoveBusyId] = useState<string | null>(null);
  /** Tracks the manual Sync button without flashing the table skeleton. */
  const [syncing, setSyncing] = useState(false);
  /** Bulk-delete selection for the directory (Remove these students from your class). */
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [bulkRemovingStudents, setBulkRemovingStudents] = useState(false);
  /** Bulk-delete selection for the Uploaded files roster (Delete these submission rows). */
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState<Set<string>>(new Set());
  const [bulkSubmissionDeleting, setBulkSubmissionDeleting] = useState(false);
  /** Last successful background fetch; throttles visibility-change refetches to stop flicker. */
  const lastFetchedAtRef = useRef(0);
  const studentsSignatureRef = useRef('');
  const subRowsSignatureRef = useRef('');

  const studentsVisibleInDirectory = useMemo(
    () => students.filter((u) => !isStudentHiddenFromTeacherDirectory(u, removedLedger)),
    [students, removedLedger]
  );

  const subRowsNotLedgerHidden = useMemo(
    () => subRows.filter((s) => !isSubmissionHiddenFromTeacherDirectory(s, removedLedger)),
    [subRows, removedLedger]
  );

  /**
   * `silent` keeps the current rows on screen while re-fetching in the background, so the page
   * doesn't collapse into a skeleton (which would scroll the user back to the top).
   */
  const load = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!options.silent) setLoading(true);
    setLoadError(null);
    setUsersTableMissing(false);

    const cachedStudents = getClassRosterCacheStudents();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('role', 'student')
      .order('full_name', { ascending: true });

    if (error) {
      const missingTbl = isUsersTableMissingError(error.message);
      setUsersTableMissing(missingTbl);
      setLoadError(error.message);
      const next = mergeIt332Sem2RosterWithDatabase(mergeStudentRosterPreferDb([], cachedStudents));
      const sig = signatureForStudents(next);
      if (sig !== studentsSignatureRef.current) {
        studentsSignatureRef.current = sig;
        setStudents(next);
      }
    } else {
      setLoadError(null);
      const next = mergeIt332Sem2RosterWithDatabase(
        mergeStudentRosterPreferDb((data ?? []) as AppUser[], cachedStudents)
      );
      const sig = signatureForStudents(next);
      /** Skip the state write entirely when the fetched data matches what's already on screen. */
      if (sig !== studentsSignatureRef.current) {
        studentsSignatureRef.current = sig;
        setStudents(next);
      }
    }
    if (!options.silent) setLoading(false);
    lastFetchedAtRef.current = Date.now();
  }, []);

  const refreshSubmissions = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!options.silent) setSubLoading(true);
    try {
      await syncAllLocalSubmissionsToSupabase();
      const next = await fetchTeacherSubmissionRows();
      const sig = signatureForSubmissions(next);
      if (sig !== subRowsSignatureRef.current) {
        subRowsSignatureRef.current = sig;
        setSubRows(next);
      }
    } catch (e) {
      console.error('[class-list] submissions:', e);
      if (!options.silent) {
        subRowsSignatureRef.current = '';
        setSubRows([]);
      }
    } finally {
      if (!options.silent) setSubLoading(false);
      lastFetchedAtRef.current = Date.now();
    }
  }, []);

  const refreshAll = useCallback(
    async (options: { silent?: boolean } = {}) => {
      await Promise.all([load(options), refreshSubmissions(options)]);
    },
    [load, refreshSubmissions]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void refreshSubmissions();
  }, [refreshSubmissions]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      /** Skip when we just refreshed; stops Alt-Tab from flickering numbers + tables. */
      if (Date.now() - lastFetchedAtRef.current < BACKGROUND_REFRESH_MIN_GAP_MS) return;
      void refreshAll({ silent: true });
    };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [refreshAll]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return studentsVisibleInDirectory.filter((u) => {
      const name = (u.full_name || '').toLowerCase();
      const mail = (u.email || '').toLowerCase();
      const sid = String(u.student_number ?? '')
        .toLowerCase()
        .replace(/\s/g, '');
      const team = (u.team_code || '').toLowerCase();
      const coy = String(u.course_year ?? '').toLowerCase();
      const sy = String(u.school_year ?? '').toLowerCase();
      return (
        !q ||
        name.includes(q) ||
        mail.includes(q) ||
        sid.includes(q.replace(/\s/g, '')) ||
        team.includes(q) ||
        coy.includes(q) ||
        sy.includes(q)
      );
    });
  }, [studentsVisibleInDirectory, search]);

  const subFiltered = useMemo(() => {
    const q = submissionSearch.toLowerCase().trim();
    return subRowsNotLedgerHidden.filter((s) => {
      if (!(submissionFilter === 'all' || s.status === submissionFilter)) return false;
      if (!q) return true;
      const hay = [
        s.file_name ?? '',
        s.users?.full_name ?? '',
        s.users?.email ?? '',
        s.users?.student_number ?? '',
        s.student_id ?? '',
        submissionQueueTitle(s),
        s.assignments?.title ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [subRowsNotLedgerHidden, submissionSearch, submissionFilter]);

  const submissionTableRows = useMemo(
    () =>
      [...subFiltered].sort(
        (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
      ),
    [subFiltered]
  );

  /** One row per student: their most recently submitted file (by `submitted_at`). */
  const latestSubmissionByStudentId = useMemo(() => {
    const m = new Map<string, TeacherSubmission>();
    for (const s of subRowsNotLedgerHidden) {
      const sid = s.student_id?.trim();
      if (!sid) continue;
      const prev = m.get(sid);
      if (!prev || new Date(s.submitted_at).getTime() > new Date(prev.submitted_at).getTime()) {
        m.set(sid, s);
      }
    }
    return m;
  }, [subRowsNotLedgerHidden]);

  async function requestResubmitFromClassList(s: TeacherSubmission) {
    const msg = `Request resubmission for “${s.file_name}”?\n\nStudents get an alert to upload a revised file (e.g. empty or incomplete work).`;
    if (!window.confirm(msg)) return;
    setResubmitSavingId(s.id);
    try {
      const result = await performTeacherResubmitRequest({ id: s.id, feedback: s.feedback });
      if (!result.ok) {
        alert(result.message);
        return;
      }
      /** Optimistic: flip just this row to `resubmit` so the chip and roster reflect it instantly. */
      setSubRows((prev) => prev.map((row) => (row.id === s.id ? { ...row, status: 'resubmit' } : row)));
      void refreshSubmissions({ silent: true });
    } finally {
      setResubmitSavingId(null);
    }
  }

  async function deleteSubmissionRow(s: TeacherSubmission) {
    if (!window.confirm(`Delete "${s.file_name}" permanently? This cannot be undone.`)) return;
    setDeleteBusyId(s.id);
    /** Optimistic: drop the row right away so the user keeps their scroll position. */
    setSubRows((prev) => prev.filter((row) => row.id !== s.id));
    try {
      const result = await deleteTeacherSubmissionsByIds([s.id], {
        purgeLocalDuplicatesOf: [
          { student_id: s.student_id, file_name: s.file_name, file_url: s.file_url },
        ],
      });
      if (!result.ok) {
        alert(
          `Could not delete from database: ${result.message}\n\nIf permission was denied, add the teacher DELETE policy (see docs/supabase-rls-submissions-teacher-delete.sql).\nLocal copies are still removed in this browser.`
        );
      }
      void refreshSubmissions({ silent: true });
    } finally {
      setDeleteBusyId(null);
    }
  }

  function toggleStudentSelected(id: string) {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleStudentSelectAll(scope: AppUser[], selectAll: boolean) {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (selectAll) for (const u of scope) next.add(u.id);
      else for (const u of scope) next.delete(u.id);
      return next;
    });
  }

  function toggleSubmissionSelected(id: string) {
    setSelectedSubmissionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSubmissionSelectAll(scope: TeacherSubmission[], selectAll: boolean) {
    setSelectedSubmissionIds((prev) => {
      const next = new Set(prev);
      if (selectAll) for (const s of scope) next.add(s.id);
      else for (const s of scope) next.delete(s.id);
      return next;
    });
  }

  async function deleteSelectedSubmissions(scope: TeacherSubmission[]) {
    const targets = scope.filter((row) => selectedSubmissionIds.has(row.id));
    if (targets.length === 0) return;
    if (
      !window.confirm(
        `Delete ${targets.length} selected submission${targets.length === 1 ? '' : 's'} permanently? This cannot be undone.`
      )
    )
      return;
    setBulkSubmissionDeleting(true);
    const targetIds = new Set(targets.map((t) => t.id));
    setSubRows((prev) => prev.filter((row) => !targetIds.has(row.id)));
    setSelectedSubmissionIds((prev) => {
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
      void refreshSubmissions({ silent: true });
    } finally {
      setBulkSubmissionDeleting(false);
    }
  }

  async function deleteSelectedStudents(scope: AppUser[]) {
    const targets = scope.filter((u) => selectedStudentIds.has(u.id));
    if (targets.length === 0) return;
    if (
      !window.confirm(
        `Remove ${targets.length} selected learner${targets.length === 1 ? '' : 's'} from your class directory on this browser?\n\nTheir submission rows are deleted when Supabase allows. Hidden roster slots return if you choose Show everyone again.`
      )
    )
      return;
    setBulkRemovingStudents(true);
    const targetIds = new Set(targets.map((t) => t.id));
    /** Optimistic: hide students via ledger + drop their submissions in one paint. */
    let nextLedger = removedLedger;
    for (const u of targets) {
      nextLedger = persistRemoveStudentFromDirectory(nextLedger, u);
    }
    setRemovedLedger(nextLedger);
    setStudents((prev) => prev.filter((row) => !targetIds.has(row.id)));
    const studentSubs = subRows.filter((s) => targetIds.has(String(s.student_id).trim()));
    if (studentSubs.length > 0) {
      const subIds = new Set(studentSubs.map((s) => s.id));
      setSubRows((prev) => prev.filter((row) => !subIds.has(row.id)));
    }
    setSelectedStudentIds(new Set());
    try {
      if (studentSubs.length > 0) {
        const result = await deleteTeacherSubmissionsByIds(studentSubs.map((s) => s.id), {
          purgeLocalDuplicatesOf: studentSubs.map((s) => ({
            student_id: s.student_id,
            file_name: s.file_name,
            file_url: s.file_url,
          })),
        });
        if (!result.ok) {
          alert(
            `Some submission rows could not be deleted:\n${result.message}\n\nThe learners are still hidden from your directory on this browser.`
          );
        }
      }
      /** Best-effort: also clear their profile rows if RLS allows it. */
      for (const u of targets) {
        if (looksLikeUuid(u.id) && !u.roster_pending) {
          const { error } = await supabase.from('users').delete().eq('id', u.id).eq('role', 'student');
          if (error && import.meta.env.DEV) console.warn('[class-list] bulk remove profile:', error.message);
        }
      }
      void refreshAll({ silent: true });
    } finally {
      setBulkRemovingStudents(false);
    }
  }

  async function removeStudentFromClassList(u: AppUser) {
    const label = u.full_name?.trim() || u.email || 'this learner';
    if (
      !window.confirm(
        `Remove "${label}" from your class directory on this browser?\n\nSubmission rows are deleted when Supabase allows. Their profile row may need docs/supabase-rls-users-teacher-delete-student.sql. Hidden roster slots return if you choose Show everyone again.`
      )
    )
      return;
    setRemoveBusyId(u.id);
    /**
     * Optimistic: hide the learner via the ledger *and* drop their submission rows immediately. The
     * `studentsVisibleInDirectory`/`subRowsNotLedgerHidden` memos already filter by `removedLedger`, so
     * the visible UI updates on the next paint with no skeleton flash.
     */
    setRemovedLedger((prev) => persistRemoveStudentFromDirectory(prev, u));
    const studentSubs = subRows.filter((s) => String(s.student_id).trim() === String(u.id).trim());
    if (studentSubs.length > 0) {
      const remainingIds = new Set(studentSubs.map((s) => s.id));
      setSubRows((prev) => prev.filter((row) => !remainingIds.has(row.id)));
    }
    setStudents((prev) => prev.filter((row) => row.id !== u.id));
    try {
      if (studentSubs.length > 0) {
        const purgeLocalDuplicatesOf = studentSubs.map((s) => ({
          student_id: s.student_id,
          file_name: s.file_name,
          file_url: s.file_url,
        }));
        const result = await deleteTeacherSubmissionsByIds(studentSubs.map((s) => s.id), {
          purgeLocalDuplicatesOf,
        });
        if (!result.ok) {
          alert(
            `Some submission rows could not be deleted:\n${result.message}\n\nThe learner will still be hidden from your directory on this browser.`
          );
        }
      }

      if (looksLikeUuid(u.id) && !u.roster_pending) {
        const { error } = await supabase.from('users').delete().eq('id', u.id).eq('role', 'student');
        if (error && import.meta.env.DEV) console.warn('[class-list] remove profile:', error.message);
      }

      void refreshAll({ silent: true });
    } finally {
      setRemoveBusyId(null);
    }
  }

  const DIRECTORY_STATUS_CHIP: Record<SubStatus, string> = {
    submitted: 'bg-blue-50 text-blue-800 border border-blue-100',
    under_review: 'bg-amber-50 text-amber-900 border border-amber-100',
    reviewed: 'bg-emerald-50 text-emerald-900 border border-emerald-100',
    resubmit: 'bg-red-50 text-red-800 border border-red-100',
  };

  const DIRECTORY_STATUS_LABEL: Record<SubStatus, string> = {
    submitted: 'Submitted',
    under_review: 'In review',
    reviewed: 'Graded',
    resubmit: 'Redo needed',
  };

  function directoryRowExtras(u: AppUser) {
    return latestSubmissionByStudentId.get(u.id) ?? null;
  }

  function exportDirectoryCsv() {
    const statusFor = (u: AppUser, latest: TeacherSubmission | null) => {
      if (u.roster_pending) return 'Awaiting sign-in';
      if (latest) return DIRECTORY_STATUS_LABEL[latest.status];
      return 'Awaiting upload';
    };
    const headers = [
      'No.',
      'Student name',
      'Student ID',
      'Team code',
      'Course',
      'School year',
      'Email',
      'Live status',
      'Latest file',
      'Submitted',
    ];
    const lines = filtered.map((u, idx) => {
      const latest = latestSubmissionByStudentId.get(u.id) ?? null;
      return [
        csvCell(String(idx + 1)),
        csvCell(u.full_name),
        csvCell(u.student_number ?? ''),
        csvCell(u.team_code ?? ''),
        csvCell(u.course_year ?? ''),
        csvCell(u.school_year ?? ''),
        csvCell(u.email ?? ''),
        csvCell(statusFor(u, latest)),
        csvCell(latest?.file_name ?? ''),
        csvCell(latest ? formatClassListDateTime(latest.submitted_at) : ''),
      ].join(',');
    });
    const stamp = new Date().toISOString().slice(0, 10);
    const bom = '\uFEFF';
    downloadTextFile(
      `class-list-${stamp}.csv`,
      `${bom}${headers.join(',')}\n${lines.join('\n')}`,
      'text/csv;charset=utf-8;'
    );
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-100/95 via-[#faf8f8] to-slate-100/85">
      <div className="p-6 md:p-8 max-w-7xl mx-auto pb-16">
        <header className="mb-10">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div>
              <p className="text-xs font-semibold tracking-[0.14em] uppercase text-[#84001B]">Directory</p>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mt-1.5 tracking-tight flex items-center gap-3">
                <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-[#84001B] text-[#ffd21a] shrink-0 shadow-lg shadow-[#84001B]/20">
                  <Users className="w-[22px] h-[22px]" aria-hidden />
                </span>
                Class list
              </h1>
              <p className="text-slate-600 text-sm mt-2 max-w-2xl leading-relaxed">
                <span className="font-medium text-slate-800">{IT332_COHORT_DESCRIPTOR}</span> first, then everyone else.
                <span className="font-medium text-slate-800"> Awaiting sign-in</span> — roster only until Google matches email or ID.
                <span className="font-medium text-slate-800"> Uploaded files</span> — grade, resubmit, or delete like grading. Groups:{' '}
                <Link className="font-semibold text-[#84001B] hover:underline" to="/student-submissions">
                  Student Submissions
                </Link>
                .
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                onClick={async () => {
                  if (syncing) return;
                  setSyncing(true);
                  try {
                    await refreshAll({ silent: true });
                  } finally {
                    setSyncing(false);
                  }
                }}
                disabled={syncing}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`}
                  aria-hidden
                />
                Sync
              </button>
              <button
                type="button"
                onClick={exportDirectoryCsv}
                disabled={loading || filtered.length === 0}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
                title="Download the current filtered directory as CSV"
              >
                <Download className="w-3.5 h-3.5" aria-hidden />
                Export
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                disabled={loading || filtered.length === 0}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
                title="Print the class list as it appears on screen"
              >
                <Printer className="w-3.5 h-3.5" aria-hidden />
                Print
              </button>
              <Link
                to="/inbox"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Inbox
                <ChevronRight className="w-3.5 h-3.5 opacity-70" />
              </Link>
              <Link
                to="/student-submissions"
                className="inline-flex items-center gap-2 rounded-xl bg-[#84001B] px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-[#84001B]/20 hover:bg-[#6b0016]"
              >
                Submission roster
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </header>

        {usersTableMissing && students.length > 0 && (
          <div
            className="mb-6 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950 shadow-sm"
            role="status"
          >
            <p className="font-semibold">Showing students saved on this device</p>
            <p className="mt-1 text-xs text-sky-900/90">
              The database table is still missing from the API, but accounts that signed in with Google on{' '}
              <span className="font-medium">this browser</span> are cached here. Run the SQL below on the matching
              Supabase project for a full class list.
            </p>
          </div>
        )}

        {loadError && (
          <div
            className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm"
            role="alert"
          >
            <p className="font-semibold">Could not load the class list from Supabase</p>
            <p className="mt-1 text-amber-900/90">{loadError}</p>
            <p className="mt-2 text-xs font-medium text-amber-950/90">
              App is using project host:{' '}
              <code className="rounded bg-amber-100/90 px-1.5 py-0.5">{getSupabaseProjectHost()}</code>
              <span className="font-normal text-amber-900/80">
                {' '}
                — open this exact project in the Supabase dashboard when you run the SQL.
              </span>
            </p>
            {isUsersTableMissingError(loadError) ? (
              <ol className="mt-3 list-decimal list-inside space-y-2 text-xs text-amber-900/85">
                <li>
                  Open Supabase Dashboard for <span className="font-medium">that</span> project →{' '}
                  <span className="font-medium">SQL Editor</span> → New query.
                </li>
                <li>
                  Paste and run <span className="font-medium">the entire file</span>{' '}
                  <code className="rounded bg-amber-100/80 px-1">docs/supabase-bootstrap-public-users.sql</code>
                  . It creates the table, RLS, grants, and runs{' '}
                  <code className="rounded bg-amber-100/80 px-1">NOTIFY pgrst, &apos;reload schema&apos;</code> (needed
                  on PostgREST v14+).
                </li>
                <li>
                  Wait ~10 seconds, then click <span className="font-medium">Sync</span> here. If it still errors, run only:{' '}
                  <code className="rounded bg-amber-100/80 px-1">notify pgrst, &apos;reload schema&apos;;</code>
                </li>
                <li>
                  Sign out and sign back in with Google once so your row is written to{' '}
                  <code className="rounded bg-amber-100/80 px-1">public.users</code>.
                </li>
              </ol>
            ) : (
              <p className="mt-2 text-xs text-amber-900/75">
                If students already use Google sign-in but you still see no rows, confirm RLS from{' '}
                <code className="rounded bg-amber-100/80 px-1">docs/supabase-bootstrap-public-users.sql</code> or{' '}
                <code className="rounded bg-amber-100/80 px-1">docs/supabase-rls-teacher-read-students.sql</code>{' '}
                so staff can read <code className="rounded bg-amber-100/80 px-1">role = &apos;student&apos;</code> profiles.
              </p>
            )}
          </div>
        )}

        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Overview</h2>
          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 md:p-7 shadow-sm border-l-[4px] border-l-[#ffd21a] flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-[#ffd21a] text-[#84001B] flex items-center justify-center shrink-0 shadow-inner">
              <GraduationCap className="w-8 h-8" aria-hidden />
            </div>
            <div>
              <p className="text-4xl font-bold text-slate-900 tabular-nums leading-none">
                {loading ? '—' : students.length}
              </p>
              <p className="text-sm font-semibold text-slate-800 mt-2">Students enrolled</p>
              <p className="text-xs text-slate-500 mt-1">
                Rows with role <span className="font-medium text-[#84001B]">student</span> in your workspace
                {usersTableMissing && (
                  <span className="block mt-1 text-amber-800/90">
                    API reports the <code className="text-[11px]">users</code> table is missing — count may reflect this
                    browser&apos;s offline cache only.
                  </span>
                )}
              </p>
            </div>
          </div>
        </section>

        <div className="rounded-2xl border border-slate-200/90 bg-white/80 backdrop-blur-sm shadow-sm p-4 sm:p-5 mb-6">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, student ID, team code…"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B]/40 bg-white"
              disabled={loading}
            />
          </div>
          {!loading && students.length > 0 && (
            <div className="mt-3 space-y-1.5 text-[11px] text-slate-500">
              <p>
                Showing{' '}
                <span className="font-semibold text-slate-700 tabular-nums">{filtered.length}</span> of{' '}
                <span className="tabular-nums">{studentsVisibleInDirectory.length}</span>{' '}
                {studentsVisibleInDirectory.length === 1 ? 'learner shown' : 'learners shown'}
                {studentsVisibleInDirectory.length < students.length ? (
                  <span className="text-slate-400">
                    {' '}
                    ({students.length - studentsVisibleInDirectory.length} hidden via Remove on this browser)
                  </span>
                ) : null}
              </p>
              <p>
                <span className="font-semibold text-slate-600">Submitted</span> /{' '}
                <span className="font-semibold text-slate-600">modified</span> /
                <span className="font-semibold text-slate-600"> status</span> /{' '}
                <span className="font-semibold text-slate-600">actions</span> refer to each learner&apos;s{' '}
                <span className="italic">most recent</span> upload. Older files stay in{' '}
                <a href="#uploaded-files-section" className="font-semibold text-[#84001B] hover:underline">
                  Uploaded files
                </a>{' '}
                below.
              </p>
            </div>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-[60px] rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : students.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-6 py-16 text-center">
            <GraduationCap className="w-14 h-14 text-slate-200 mx-auto mb-4" aria-hidden />
            <p className="text-lg font-semibold text-slate-800">No students yet</p>
            <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
              {usersTableMissing ? (
                <>
                  Fix the yellow alert above first (create <code className="text-xs bg-slate-100 px-1 rounded">public.users</code> on{' '}
                  <span className="font-medium text-slate-700">{getSupabaseProjectHost()}</span>). Until then, only Google
                  sign-ins on <span className="font-medium text-slate-700">this same browser</span> are remembered offline.
                </>
              ) : (
                <>
                  When someone signs in with Google, the app saves their Gmail and name to{' '}
                  <code className="text-xs bg-slate-100 px-1 rounded">public.users</code> as role{' '}
                  <span className="font-medium text-slate-700">student</span> (unless they are listed as a teacher in your
                  env). They appear here after that—use <span className="font-medium text-slate-700">Sync</span> or return to
                  this tab to refresh.
                </>
              )}
            </p>
            <button
              type="button"
              onClick={() => void refreshAll()}
              className="inline-flex items-center gap-2 mt-6 text-xs font-semibold text-[#84001B] hover:underline"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden />
              Try syncing again
            </button>
          </div>
        ) : studentsVisibleInDirectory.length === 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-6 py-14 text-center max-w-xl mx-auto">
            <GraduationCap className="w-12 h-12 text-amber-700/70 mx-auto mb-3" aria-hidden />
            <p className="text-lg font-semibold text-amber-950">Everyone is hidden from your directory</p>
            <p className="text-sm text-amber-900/85 mt-2 leading-relaxed">
              You used <span className="font-semibold">Remove</span> for every learner on this browser. Nothing is wrong with
              the roster — open <span className="font-semibold">Show everyone again</span> to restore the full list.
            </p>
            <button
              type="button"
              onClick={() => setRemovedLedger(resetDirectoryRemovalLedger())}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#84001B] px-4 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-[#6b0016]"
            >
              Show everyone again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
            <Search className="w-10 h-10 text-slate-200 mx-auto mb-3" aria-hidden />
            <p className="text-sm font-semibold text-slate-800">No matches</p>
            <p className="text-xs text-slate-500 mt-1">Try a shorter search or clear the field.</p>
            <button
              type="button"
              onClick={() => setSearch('')}
              className="mt-5 text-xs font-semibold text-[#84001B] hover:underline"
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
            <p className="px-4 py-2.5 md:px-5 text-[12px] text-slate-800 bg-amber-50/80 border-b border-amber-100/90 leading-relaxed">
              <span className="font-semibold text-amber-950">Directory</span>: name and team/group tags on the left; columns
              to the right — ID, team code, course, school year, email,{' '}
              <span className="font-semibold">date submitted</span> (from their latest file), live status, and actions (
              <span className="font-semibold">Remove</span> on every row;{' '}
              <span className="font-semibold">Delete</span> on the latest upload when present — use Grading workspace or
              Submission roster to score or request redo. Scroll sideways on small screens.
            </p>
            <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-2 md:px-5 border-b border-slate-200/90 bg-slate-50/95">
              <label className="inline-flex items-center gap-2 text-[11px] font-medium text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  aria-label={
                    filtered.length > 0 && filtered.every((u) => selectedStudentIds.has(u.id))
                      ? 'Deselect all learners in this view'
                      : 'Select all learners in this view'
                  }
                  checked={filtered.length > 0 && filtered.every((u) => selectedStudentIds.has(u.id))}
                  ref={(el) => {
                    if (!el) return;
                    const total = filtered.length;
                    const sel = filtered.reduce((acc, u) => (selectedStudentIds.has(u.id) ? acc + 1 : acc), 0);
                    el.indeterminate = sel > 0 && sel < total;
                  }}
                  onChange={(e) => toggleStudentSelectAll(filtered, e.target.checked)}
                  className="h-3.5 w-3.5 accent-[#84001B] cursor-pointer"
                />
                Select all in view
              </label>
              {(() => {
                const sel = filtered.reduce((acc, u) => (selectedStudentIds.has(u.id) ? acc + 1 : acc), 0);
                return (
                  <button
                    type="button"
                    disabled={sel === 0 || bulkRemovingStudents}
                    onClick={() => void deleteSelectedStudents(filtered)}
                    className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-[10px] font-semibold text-red-700 shadow-sm hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title={
                      sel === 0
                        ? 'Tick rows below (or use Select all) to enable bulk remove'
                        : `Remove the ${sel} selected learner${sel === 1 ? '' : 's'} from the directory`
                    }
                  >
                    <Trash className="w-3 h-3 shrink-0" aria-hidden />
                    Delete selected{sel > 0 ? ` (${sel})` : ''}
                  </button>
                );
              })()}
            </div>
            <div className="max-h-[min(720px,78vh)] overflow-auto">
              <table className="w-full min-w-[1180px] border-collapse text-left antialiased text-[13px] leading-snug">
                <thead>
                  <tr className="border-b border-[#5c0013] bg-[#84001B] text-[11px] font-semibold uppercase tracking-[0.06em] text-white shadow-sm">
                    <th className="px-3 py-3 align-bottom text-center font-semibold tabular-nums w-[3.25rem]">No.</th>
                    <th className="px-4 py-3 align-bottom font-semibold min-w-[12rem]">Student name</th>
                    <th className="px-2.5 py-3 align-bottom whitespace-nowrap text-center font-semibold">Student ID</th>
                    <th className="px-2.5 py-3 align-bottom min-w-[8.5rem] font-semibold">Team code</th>
                    <th className="px-2.5 py-3 align-bottom min-w-[7rem] font-semibold">Course / term</th>
                    <th className="px-2.5 py-3 align-bottom whitespace-nowrap font-semibold">School yr</th>
                    <th className="px-3 py-3 align-bottom min-w-[11rem] font-semibold">Email</th>
                    <th className="px-2.5 py-3 align-bottom whitespace-nowrap font-semibold tabular-nums">
                      Date submitted
                    </th>
                    <th className="px-2.5 py-3 align-bottom whitespace-nowrap font-semibold">Status</th>
                    <th className="px-4 py-3 align-bottom text-right whitespace-nowrap font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((u, idx) => {
                    const latest = directoryRowExtras(u);
                    const submittedAt =
                      latest && latest.submitted_at?.trim() !== ''
                        ? formatClassListDateTime(latest.submitted_at)
                        : '—';
                    return (
                      <tr key={u.id} className="group hover:bg-[#fff8f9] align-middle bg-white border-b border-slate-100/90 transition-colors">
                        <td className="px-3 py-3 text-center text-[12px] font-semibold text-slate-500 tabular-nums w-[3.25rem]">
                          {idx + 1}
                        </td>
                        <td className="px-4 py-3 min-w-[12rem]">
                          <div className="flex items-center gap-3 min-w-0">
                            <UserAvatar
                              src={u.avatar_url}
                              name={u.full_name}
                              email={u.email}
                              size={36}
                              rounded="lg"
                              fallbackBg="bg-gradient-to-br from-[#ffd21a] to-[#f5c400]"
                              fallbackFg="text-[#84001B]"
                            />
                            <div className="min-w-0">
                              <p className="font-semibold text-[13.5px] text-slate-900 truncate tracking-tight">
                                {u.full_name?.trim() || 'Unnamed'}
                              </p>
                              {(u.roster_member_number === 1 || u.roster_pending) && (
                                <p className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                  {u.roster_member_number === 1 && (
                                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[#84001B]/90">
                                      Lead
                                    </span>
                                  )}
                                  {u.roster_pending && (
                                    <span className="text-[10px] font-medium text-amber-900 bg-amber-50 border border-amber-100 px-1.5 py-0 rounded">
                                      Awaiting sign-in
                                    </span>
                                  )}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-3 text-[12.5px] font-mono font-semibold text-slate-900 tabular-nums text-center">
                          <span className="inline-block max-w-[7rem] truncate align-middle" title={u.student_number ?? ''}>
                            {u.student_number?.trim() || '—'}
                          </span>
                        </td>
                        <td className="px-2 py-3 text-[12.5px] font-mono font-semibold text-slate-900">
                          <span className="line-clamp-2 break-all" title={u.team_code ?? ''}>
                            {u.team_code?.trim() || '—'}
                          </span>
                        </td>
                        <td className="px-2 py-3 text-[12.5px] font-semibold text-slate-900">
                          <span className="line-clamp-2" title={u.course_year ?? ''}>
                            {u.course_year?.trim() || '—'}
                          </span>
                        </td>
                        <td className="px-2 py-3 text-[12.5px] font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                          {u.school_year?.trim() || '—'}
                        </td>
                        <td className="px-3 py-3 min-w-[11rem]">
                          <span className="flex items-start gap-2 text-slate-800 text-[12.5px] font-medium">
                            <Mail className="w-3.5 h-3.5 text-[#84001B]/70 shrink-0 mt-0.5" aria-hidden />
                            <span className="truncate">{u.email || '—'}</span>
                          </span>
                        </td>
                        <td className="px-2.5 py-3 text-[12px] font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden />
                            <span title={latest?.submitted_at}>{submittedAt}</span>
                          </span>
                        </td>
                        <td className="px-2.5 py-3">
                          {latest ? (
                            <span
                              className={`inline-flex text-[11px] font-semibold px-2.5 py-1 rounded-full shadow-sm ${DIRECTORY_STATUS_CHIP[latest.status]}`}
                            >
                              {DIRECTORY_STATUS_LABEL[latest.status]}
                            </span>
                          ) : (
                            <span className="inline-flex text-[11px] font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200/90">
                              No submission
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex flex-row items-start gap-2 max-w-[15rem]">
                            <input
                              type="checkbox"
                              aria-label={`Select learner ${u.full_name ?? u.email ?? u.id}`}
                              checked={selectedStudentIds.has(u.id)}
                              onChange={() => toggleStudentSelected(u.id)}
                              className="mt-2 h-3.5 w-3.5 accent-[#84001B] cursor-pointer shrink-0"
                            />
                            <div className="inline-flex flex-col items-end gap-1.5">
                            <button
                              type="button"
                              disabled={
                                removeBusyId === u.id ||
                                (!!latest && deleteBusyId === latest.id) ||
                                (!!latest && resubmitSavingId === latest.id)
                              }
                              onClick={() => void removeStudentFromClassList(u)}
                              className="inline-flex w-full justify-center items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 hover:border-slate-400 disabled:opacity-50 shadow-sm"
                              title="Hide from your directory here and delete their submissions when permitted"
                            >
                              <UserMinus className="w-3.5 h-3.5 shrink-0 opacity-70" aria-hidden />
                              Remove
                            </button>
                            {latest ? (
                              <div className="inline-flex flex-wrap justify-end gap-1.5">
                                <button
                                  type="button"
                                  disabled={deleteBusyId === latest.id || resubmitSavingId === latest.id}
                                  onClick={() => void deleteSubmissionRow(latest)}
                                  className="inline-flex items-center rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 shadow-sm"
                                  title="Remove latest submission row only"
                                >
                                  Delete
                                </button>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">Awaiting upload</span>
                            )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <section
          id="uploaded-files-section"
          className="mt-14 pt-10 border-t border-slate-200/90 scroll-mt-6"
          aria-labelledby="class-list-uploads-heading"
        >
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
            <div>
              <p className="text-xs font-semibold tracking-[0.12em] uppercase text-[#84001B]">Files on record</p>
              <h2
                id="class-list-uploads-heading"
                className="text-xl md:text-2xl font-bold text-slate-900 mt-1.5 flex items-center gap-2"
              >
                <FileText className="w-6 h-6 text-[#84001B] shrink-0" aria-hidden />
                Uploaded files
              </h2>
              <p className="text-sm text-slate-600 mt-2 max-w-2xl">
                Same columns as the grading workspace. Status shows on-time vs late when the assignment has a due date;
                otherwise it shows review state. Use trash to remove a row; open Grading workspace or Submission roster to
                evaluate or request redo.
              </p>
            </div>
            <Link
              to="/grading"
              className="inline-flex items-center gap-2 rounded-xl bg-[#84001B] px-3.5 py-2 text-xs font-semibold text-white shadow-md hover:bg-[#6b0016] shrink-0"
            >
              Open grading workspace
              <ChevronRight className="w-3.5 h-3.5" aria-hidden />
            </Link>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white/80 backdrop-blur-sm shadow-sm p-4 sm:p-5 mb-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden />
                <input
                  value={submissionSearch}
                  onChange={(e) => setSubmissionSearch(e.target.value)}
                  placeholder="Search title, student, email, file name…"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B]/40 bg-white"
                  disabled={subLoading}
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                {(['all', 'submitted', 'under_review', 'reviewed', 'resubmit'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setSubmissionFilter(st)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold capitalize transition-colors ${
                      submissionFilter === st
                        ? 'bg-[#84001B] text-white shadow-sm'
                        : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {st.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
            {!subLoading && subRows.length > 0 && (
              <p className="text-[11px] text-slate-500 mt-3">
                Showing <span className="font-semibold text-slate-700">{subFiltered.length}</span> of {subRows.length}{' '}
                file{subRows.length !== 1 ? 's' : ''}
                {submissionFilter !== 'all' && (
                  <span>
                    {' '}
                    · <span className="text-[#84001B] font-medium">{submissionFilter.replace('_', ' ')}</span>
                  </span>
                )}
              </p>
            )}
          </div>

          {subLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-16 rounded-2xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : submissionTableRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-6 py-14 text-center">
              <ClipboardList className="w-14 h-14 text-slate-300 mx-auto mb-4" aria-hidden />
              <p className="text-lg font-semibold text-slate-800">No files match</p>
              <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
                {subRows.length === 0
                  ? 'When learners submit work, each upload appears here with actions — try Sync after new uploads.'
                  : 'Try another status filter or clear the search box.'}
              </p>
            </div>
          ) : (
            <TeacherSubmissionRosterTable
              rows={submissionTableRows}
              resubmitSavingId={resubmitSavingId}
              gradeHref={gradingLinkForSubmission}
              onRequestResubmit={(s) => void requestResubmitFromClassList(s)}
              onDeleteRow={(s) => void deleteSubmissionRow(s)}
              deleteBusyId={deleteBusyId}
              labeledActions
              omitGradeAndRedo
              selection={{
                selectedIds: selectedSubmissionIds,
                onToggle: toggleSubmissionSelected,
                onToggleAll: (selectAll) =>
                  toggleSubmissionSelectAll(submissionTableRows, selectAll),
                onDeleteSelected: () => void deleteSelectedSubmissions(submissionTableRows),
                busy: bulkSubmissionDeleting,
              }}
            />
          )}
        </section>
      </div>
    </div>
  );
}

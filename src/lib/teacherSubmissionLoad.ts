/**
 * Shared Supabase/local merge pipeline for teacher submission lists (grading + submission log pages).
 */
import { supabase } from './supabase';
import { getInvitedStudentRosterEntry } from '../data/invitedStudentEmails';
import type { DocType, SubStatus } from '../types';

/**
 * Resolve a student's display name from the **official class roster** when their
 * email is on the IT332 / CS342 invite list. The class roster is the source of
 * truth — Google profile names (which can be nicknames, anime handles, etc.) are
 * ignored for invited students so the UI is "steady" regardless of how a student
 * has renamed their Google account.
 *
 * For non-invited rows (teachers, admins, unmatched students) we keep whatever
 * `full_name` came back from `public.users`.
 */
export function resolveStudentDisplayName(
  email: string | null | undefined,
  fallbackName: string | null | undefined
): string {
  const entry = getInvitedStudentRosterEntry(email);
  if (entry) {
    return `${entry.firstName} ${entry.lastName}`.trim();
  }
  return (fallbackName ?? '').trim();
}

/**
 * Official school ID from the IT332 / CS342 planned roster when the student's
 * Gmail is on the invite list. Supabase `users.student_number` is often empty
 * until OAuth claims sync — this keeps submission / grading tables showing the
 * steady `XX-XXXX-XXX` ID from the class list instead of a truncated auth UUID.
 */
export function resolveStudentSchoolId(
  email: string | null | undefined,
  fallbackSchoolId: string | null | undefined
): string | null {
  const entry = getInvitedStudentRosterEntry(email);
  const fromRoster = entry?.studentSchoolId?.trim();
  if (fromRoster) return fromRoster;
  const fb = (fallbackSchoolId ?? '').trim();
  return fb || null;
}

export const TEACHER_LOCAL_SUBMISSION_KEY = 'local_submission_fallback_v1';

export interface TeacherSubmission {
  id: string;
  file_name: string;
  file_url: string | null;
  status: SubStatus;
  submitted_at: string;
  /** Quick-submit artifact label (SRS / SDD / SPMP / STD) — shown as queue Title when set. */
  submission_doc_type: string | null;
  /** Last row update (`submissions.updated_at` when migrated; else null from API). */
  updated_at: string | null;
  feedback: string | null;
  score: number | null;
  /** Automated AI snapshot at last “Run AI inspection” (vs teacher-adjusted `score`). */
  ai_draft_score: number | null;
  ai_draft_summary: string | null;
  assignment_id: string;
  student_id: string;
  team_code: string | null;
  school_year: string | null;
  semester: string | null;
  assignments: { title: string; document_type: DocType; due_date: string | null } | null;
  users: {
    full_name: string;
    email: string;
    student_number: string | null;
    course_year: string | null;
    avatar_url: string | null;
  } | null;
}

function applyInvitedRosterPinsToSubmission(s: TeacherSubmission): TeacherSubmission {
  if (!s.users) return s;
  const email = s.users.email;
  const nextName = resolveStudentDisplayName(email, s.users.full_name) || s.users.full_name;
  const nextId = resolveStudentSchoolId(email, s.users.student_number);
  if (nextName === s.users.full_name && nextId === s.users.student_number) return s;
  return { ...s, users: { ...s.users, full_name: nextName, student_number: nextId } };
}

export type LocalSubmissionRow = {
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
  team_code?: string | null;
  school_year?: string | null;
  semester?: string | null;
  updated_at?: string | null;
  student_number?: string | null;
  course_year?: string | null;
};

type BasicUserRow = {
  id: string;
  full_name: string;
  email: string;
  student_number?: string | null;
  course_year?: string | null;
  avatar_url?: string | null;
};

function normalizeDocType(v: unknown): DocType {
  if (v === 'SRS' || v === 'SDD' || v === 'SPMP' || v === 'STD' || v === 'Other') return v;
  return 'Other';
}

/** Same title as `ensureGeneralAssignment` in student Assignments — quick uploads without a specific task. */
export const GENERAL_SUBMISSION_ASSIGNMENT_TITLE = 'General Submission';

/**
 * Short label from an uploaded file name, e.g. `INDIVIDUAL FINAL PROJECT.pdf` → `IFP`.
 * Splits on spaces and common separators; uses the first letter of each word (skipping pure-number tokens’ non-letters).
 */
export function fileNameToTitleAcronym(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) return '';

  const lastDot = trimmed.lastIndexOf('.');
  const ext = lastDot > 0 ? trimmed.slice(lastDot + 1) : '';
  const base =
    lastDot > 0 &&
    lastDot < trimmed.length - 1 &&
    ext.length <= 8 &&
    /^[A-Za-z0-9]+$/.test(ext)
      ? trimmed.slice(0, lastDot).trim()
      : trimmed;

  const normalized = base.replace(/_+/g, ' ').trim();
  const tokens = normalized.split(/[\s\-–—.,;:&/+|]+/).filter((t) => t.length > 0);

  const initials = tokens
    .map((tok) => {
      const m = tok.match(/[A-Za-z]/);
      return m ? m[0].toUpperCase() : '';
    })
    .join('');

  if (initials.length > 0) return initials;

  const compact = normalized.replace(/[^A-Za-z0-9]/g, '');
  if (!compact) return '';
  return compact.slice(0, 12).toUpperCase();
}

/** Title column in grading queue: student-chosen doc type beats assignment title; general bucket uses file-name acronym. */
export function submissionQueueTitle(
  s: {
    submission_doc_type?: string | null;
    assignments?: { title?: string | null } | null;
    file_name?: string | null;
  },
  emptyFallback = '—'
): string {
  const d = s.submission_doc_type?.trim();
  if (d) return d;
  const t = s.assignments?.title?.trim() ?? '';
  const isGeneralBucket = t === GENERAL_SUBMISSION_ASSIGNMENT_TITLE || t === '';

  if (t && !isGeneralBucket) return t;

  const fn = s.file_name?.trim();
  if (isGeneralBucket && fn) {
    const acronym = fileNameToTitleAcronym(fn);
    if (acronym) return acronym;
  }

  if (t) return t;
  if (fn) {
    const acronym = fileNameToTitleAcronym(fn);
    if (acronym) return acronym;
  }
  return emptyFallback;
}

export function gradingDocTypeForAI(sub: TeacherSubmission): string {
  const raw = sub.submission_doc_type?.trim();
  if (raw === 'SRS' || raw === 'SDD' || raw === 'SPMP' || raw === 'STD' || raw === 'Other') return raw;
  return sub.assignments?.document_type ?? 'Other';
}

export function normalizeSubStatus(v: unknown): SubStatus {
  if (v === 'submitted' || v === 'under_review' || v === 'reviewed' || v === 'resubmit') return v;
  return 'submitted';
}

function isRecoverableSchemaError(message: string | undefined): boolean {
  const m = (message ?? '').toLowerCase();
  return (
    m.includes('column') ||
    m.includes('could not find') ||
    m.includes('pgrst204') ||
    m.includes('schema cache') ||
    m.includes('unknown')
  );
}

function optTrimmedText(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

async function fetchUsersByIdsForMerge(userIds: string[]): Promise<BasicUserRow[]> {
  if (userIds.length === 0) return [];
  const selectAttempts = [
    'id, full_name, email, student_number, course_year, avatar_url',
    'id, full_name, email, student_number, course_year',
    'id, full_name, email, avatar_url',
    'id, full_name, email',
  ];
  for (const sel of selectAttempts) {
    const res = await supabase.from('users').select(sel).in('id', userIds);
    if (!res.error && res.data) return res.data as unknown as BasicUserRow[];
    if (res.error && !isRecoverableSchemaError(res.error.message)) break;
  }
  return [];
}

function pickJoinedRecord(rel: unknown): Record<string, unknown> | null {
  if (rel == null) return null;
  if (Array.isArray(rel)) {
    const first = rel[0];
    return first && typeof first === 'object' ? (first as Record<string, unknown>) : null;
  }
  return typeof rel === 'object' ? (rel as Record<string, unknown>) : null;
}

export function normalizeSubmissionRow(row: Record<string, unknown>): TeacherSubmission {
  const aRec = pickJoinedRecord(row.assignments);
  const uRec = pickJoinedRecord(row.users);
  const submitted_at = String(row.submitted_at ?? '');
  const aiDraftScore =
    typeof row.ai_draft_score === 'number'
      ? row.ai_draft_score
      : row.ai_draft_score != null
        ? Number(row.ai_draft_score)
        : null;
  return {
    id: String(row.id ?? ''),
    file_name: String(row.file_name ?? ''),
    file_url: row.file_url != null ? String(row.file_url) : null,
    status: normalizeSubStatus(row.status),
    submitted_at,
    updated_at: optTrimmedText(row.updated_at) ?? (submitted_at.trim() !== '' ? submitted_at : null),
    feedback: row.feedback != null ? String(row.feedback) : null,
    score: typeof row.score === 'number' ? row.score : row.score != null ? Number(row.score) : null,
    ai_draft_score: Number.isFinite(aiDraftScore as number) ? (aiDraftScore as number) : null,
    ai_draft_summary: row.ai_draft_summary != null ? String(row.ai_draft_summary) : null,
    assignment_id: String(row.assignment_id ?? ''),
    student_id: String(row.student_id ?? ''),
    submission_doc_type: optTrimmedText(row.submission_doc_type),
    team_code: optTrimmedText(row.team_code),
    school_year: optTrimmedText(row.school_year),
    semester: optTrimmedText(row.semester),
    assignments: aRec
      ? {
          title: String(aRec.title ?? ''),
          document_type: normalizeDocType(aRec.document_type),
          due_date: optTrimmedText(aRec.due_date),
        }
      : null,
    users: uRec
      ? {
          full_name: resolveStudentDisplayName(
            String(uRec.email ?? ''),
            String(uRec.full_name ?? '')
          ) || String(uRec.full_name ?? ''),
          email: String(uRec.email ?? ''),
          student_number: resolveStudentSchoolId(
            String(uRec.email ?? ''),
            optTrimmedText(uRec.student_number)
          ),
          course_year: optTrimmedText(uRec.course_year),
          avatar_url: optTrimmedText(uRec.avatar_url),
        }
      : null,
  };
}

function looksLikeUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s.trim());
}

/** Placeholder / unusable display names that should trigger a fresh `users` lookup. */
const GENERIC_DISPLAY_NAMES = new Set(
  ['student', 'learner', 'user', 'unknown', 'unnamed', 'name', '—', '-', 'n/a', 'na'].map((s) => s.toLowerCase())
);

function isWeakDisplayName(name: string, studentId: string): boolean {
  const n = name.trim();
  if (!n) return true;
  if (looksLikeUuid(n) || n === studentId) return true;
  if (GENERIC_DISPLAY_NAMES.has(n.toLowerCase())) return true;
  if (/^student\s*\(/i.test(n)) return true;
  return false;
}

function submissionNeedsUserLookup(s: TeacherSubmission): boolean {
  const sid = String(s.student_id ?? '').trim();
  if (!sid) return false;
  const name = (s.users?.full_name ?? '').trim();
  const mail = (s.users?.email ?? '').trim();
  if (!name && !mail) return true;
  return isWeakDisplayName(name, sid);
}

/** When DB/RLS hides student rows, infer a display hint from filenames like `LASTNAME_topic.txt`. */
const GENERIC_FILE_NAME_PREFIXES = new Set(
  [
    'activity',
    'document',
    'file',
    'untitled',
    'new',
    'copy',
    'final',
    'draft',
    'rescued',
    'rescue',
    'unnamed',
    'homework',
    'assignment',
    'project',
    'essay',
    'report',
    'image',
    'screenshot',
    'scan',
    'notes',
  ].map((s) => s.toLowerCase())
);

function inferNameFromFileName(fileName: string): string | null {
  const raw = String(fileName ?? '').trim();
  if (!raw) return null;
  const base = raw.replace(/^.*[/\\]/, '').replace(/\.[^.]+$/, '').trim();
  if (!base) return null;
  const first =
    base
      .split(/[_\s-]+/)
      .find((segment) => segment.replace(/^[('"]+/, '').trim().length > 0)?.replace(/^[('"]+/, '') ?? '';
  const seg = first.trim();
  if (seg.length < 2 || seg.length > 40) return null;
  if (/^\d/.test(seg)) return null;
  if (!/^[A-Za-z][A-Za-z0-9'-]*$/i.test(seg)) return null;
  if (GENERIC_FILE_NAME_PREFIXES.has(seg.toLowerCase())) return null;
  if (/^[A-Z]{2,20}$/.test(seg)) return seg;
  return seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase();
}

async function enrichStudentRows(rows: TeacherSubmission[]): Promise<TeacherSubmission[]> {
  const needsLookup = rows.filter(submissionNeedsUserLookup);
  const userMap: Record<string, BasicUserRow> = {};
  if (needsLookup.length > 0) {
    const ids = [...new Set(needsLookup.map((s) => s.student_id))];
    const chunkSize = 120;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const fetched = await fetchUsersByIdsForMerge(chunk);
      if (import.meta.env.DEV && fetched.length === 0 && chunk.length > 0) {
        console.warn('[teacherSubmissionLoad] users lookup returned no rows (check RLS for teachers reading students)');
      }
      for (const u of fetched) {
        userMap[u.id] = u;
      }
    }
  }
  return rows.map((s) => {
    if (!submissionNeedsUserLookup(s)) return applyInvitedRosterPinsToSubmission(s);
    const prevMail = (s.users?.email ?? '').trim();
    const u = userMap[s.student_id];
    const resolvedName = u?.full_name?.trim();
    const resolvedEmail = (u?.email ?? prevMail).trim();

    let label = resolvedName
      ? resolvedName
      : resolvedEmail && !looksLikeUuid(resolvedEmail)
        ? resolvedEmail.includes('@')
          ? resolvedEmail.split('@')[0] || resolvedEmail
          : resolvedEmail
        : prevMail && !looksLikeUuid(prevMail)
          ? prevMail.includes('@')
            ? prevMail.split('@')[0] || prevMail
            : prevMail
          : '';

    if (!label) label = inferNameFromFileName(s.file_name) ?? 'Unknown learner';

    /** Class roster wins — if this email is on the IT332/CS342 list, use the official name. */
    const officialName = resolveStudentDisplayName(resolvedEmail, label);

    return applyInvitedRosterPinsToSubmission({
      ...s,
      users: {
        full_name: officialName || label,
        email: resolvedEmail,
        student_number: resolveStudentSchoolId(
          resolvedEmail,
          optTrimmedText(u?.student_number) ?? s.users?.student_number ?? null
        ),
        course_year: optTrimmedText(u?.course_year) ?? s.users?.course_year ?? null,
        avatar_url: optTrimmedText(u?.avatar_url) ?? s.users?.avatar_url ?? null,
      },
    });
  });
}

/** Only cache successful resolution — never cache “missing”, so users recover after running SQL without a full browser restart. */
let submissionTableCache: 'submissions' | 'submission' | undefined;

export async function resolveSubmissionTableName(): Promise<'submissions' | 'submission' | null> {
  if (submissionTableCache !== undefined) return submissionTableCache;
  const plural = await supabase.from('submissions').select('id').limit(1);
  if (!plural.error) {
    submissionTableCache = 'submissions';
    return 'submissions';
  }
  const singular = await supabase.from('submission').select('id').limit(1);
  if (!singular.error) {
    submissionTableCache = 'submission';
    return 'submission';
  }
  return null;
}

export async function fetchTeacherSubmissionRows(): Promise<TeacherSubmission[]> {
  const table = await resolveSubmissionTableName();
  if (!table) {
    const localRaw = localStorage.getItem(TEACHER_LOCAL_SUBMISSION_KEY);
    let localRows: LocalSubmissionRow[] = [];
    if (localRaw) {
      try {
        localRows = JSON.parse(localRaw) as LocalSubmissionRow[];
      } catch {
        localRows = [];
      }
    }
    const userIds = Array.from(new Set(localRows.map((row) => row.student_id)));
    let userMap: Record<string, BasicUserRow> = {};
    if (userIds.length > 0) {
      const rows = await fetchUsersByIdsForMerge(userIds);
      userMap = Object.fromEntries(rows.map((u) => [u.id, u]));
    }
    const mapped: TeacherSubmission[] = localRows
      .map((row) => ({
        id: row.id,
        file_name: String(row.file_name ?? ''),
        file_url: row.file_url,
        status: normalizeSubStatus(row.status),
        submitted_at: row.submitted_at,
        updated_at: optTrimmedText(row.updated_at) ?? row.submitted_at,
        feedback: row.feedback,
        score: row.score,
        ai_draft_score: row.ai_draft_score ?? null,
        ai_draft_summary: row.ai_draft_summary ?? null,
        assignment_id: row.assignment_id || '',
        student_id: row.student_id,
        submission_doc_type: optTrimmedText(row.submission_doc_type),
        team_code: optTrimmedText(row.team_code),
        school_year: optTrimmedText(row.school_year),
        semester: optTrimmedText(row.semester),
        assignments: {
          title: 'General Submission',
          document_type: 'Other' as DocType,
          due_date: null,
        },
        users: (() => {
          const u = userMap[row.student_id];
          const email = (u?.email ?? '').trim();
          const dbName = u?.full_name ?? row.student_id;
          const dbNum = optTrimmedText(row.student_number) ?? optTrimmedText(u?.student_number);
          return {
            full_name: resolveStudentDisplayName(email, dbName) || dbName,
            email: u?.email ?? '',
            student_number: resolveStudentSchoolId(email, dbNum),
            course_year: optTrimmedText(row.course_year) ?? optTrimmedText(u?.course_year),
            avatar_url: optTrimmedText(u?.avatar_url),
          };
        })(),
      }))
      .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
    return enrichStudentRows(mapped);
  }

  const joinSelectAttempts = [
    '*, assignments(title, document_type, due_date), users(full_name, email, student_number, course_year, avatar_url)',
    '*, assignments(title, document_type, due_date), users(full_name, email, student_number, course_year)',
    '*, assignments(title, document_type, due_date), users(full_name, email, avatar_url)',
    '*, assignments(title, document_type, due_date), users(full_name, email)',
    '*, assignments(title, document_type), users(full_name, email, student_number, course_year, avatar_url)',
    '*, assignments(title, document_type), users(full_name, email, student_number, course_year)',
    '*, assignments(title, document_type), users(full_name, email, avatar_url)',
    '*, assignments(title, document_type), users(full_name, email)',
  ];

  let joinData: unknown[] | null = null;
  for (const sel of joinSelectAttempts) {
    const withJoins = await supabase.from(table).select(sel).order('submitted_at', { ascending: false });
    if (!withJoins.error) {
      joinData = (withJoins.data || []) as unknown[];
      break;
    }
    if (!isRecoverableSchemaError(withJoins.error.message)) {
      if (import.meta.env.DEV) {
        console.warn('[teacherSubmissionLoad] join select failed', withJoins.error.message);
      }
      break;
    }
  }

  if (joinData) {
    const rows = joinData.map((raw) => normalizeSubmissionRow(raw as Record<string, unknown>));
    return enrichStudentRows(rows);
  }

  const plain = await supabase
    .from(table)
    .select('*')
    .order('submitted_at', { ascending: false });
  const base = (plain.data || []).map((s: Record<string, unknown>) =>
    normalizeSubmissionRow({ ...s, assignments: null, users: null })
  );
  return enrichStudentRows(base);
}

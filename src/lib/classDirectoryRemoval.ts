import type { AppUser } from '../types';
import type { TeacherSubmission } from './teacherSubmissionLoad';

const KEY = 'smart_docs_class_directory_removed_v1';

export type DirectoryRemovalLedger = {
  ids: string[];
  emails: string[];
};

function normEmail(e: string): string {
  return e.trim().toLowerCase();
}

export function loadDirectoryRemovalLedger(): DirectoryRemovalLedger {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ids: [], emails: [] };
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== 'object') return { ids: [], emails: [] };
    const rec = p as DirectoryRemovalLedger;
    const ids = Array.isArray(rec.ids) ? rec.ids.map(String).filter(Boolean) : [];
    const emails = Array.isArray(rec.emails) ? rec.emails.map(normEmail).filter(Boolean) : [];
    return {
      ids: [...new Set(ids)],
      emails: [...new Set(emails)],
    };
  } catch {
    return { ids: [], emails: [] };
  }
}

function saveDirectoryRemovalLedger(ledger: DirectoryRemovalLedger): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ ids: [...new Set(ledger.ids)], emails: [...new Set(ledger.emails.map(normEmail))] })
    );
  } catch {
    /* quota / private mode */
  }
}

/** Clears removals for this browser (directory + submitted-files table). */
export function resetDirectoryRemovalLedger(): DirectoryRemovalLedger {
  const empty: DirectoryRemovalLedger = { ids: [], emails: [] };
  saveDirectoryRemovalLedger(empty);
  return empty;
}

export function persistRemoveStudentFromDirectory(
  ledger: DirectoryRemovalLedger,
  u: AppUser
): DirectoryRemovalLedger {
  const idSet = new Set(ledger.ids.map(String));
  const mailSet = new Set(ledger.emails.map(normEmail));
  const idTrim = String(u.id ?? '').trim();
  if (idTrim) idSet.add(idTrim);
  const em = normEmail(u.email || '');
  if (em) mailSet.add(em);
  const next: DirectoryRemovalLedger = {
    ids: [...idSet],
    emails: [...mailSet],
  };
  saveDirectoryRemovalLedger(next);
  return next;
}

export function isStudentHiddenFromTeacherDirectory(u: AppUser, ledger: DirectoryRemovalLedger): boolean {
  const idTrim = String(u.id ?? '').trim();
  if (idTrim && ledger.ids.includes(idTrim)) return true;
  const em = normEmail(u.email || '');
  if (em && ledger.emails.includes(em)) return true;
  return false;
}

export function isSubmissionHiddenFromTeacherDirectory(
  s: TeacherSubmission,
  ledger: DirectoryRemovalLedger
): boolean {
  const sid = String(s.student_id ?? '').trim();
  if (sid && ledger.ids.includes(sid)) return true;
  const em = normEmail(s.users?.email ?? '');
  if (em && ledger.emails.includes(em)) return true;
  return false;
}

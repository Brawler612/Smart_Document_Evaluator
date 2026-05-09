import type { AppUser } from '../types';

const KEY = 'smart_docs_class_roster_v1';

/** Keeps a copy of profiles seen on this browser when `public.users` is missing or unreachable. */
export function mergeProfileIntoClassRosterCache(profile: AppUser): void {
  try {
    const raw = localStorage.getItem(KEY);
    const byId = new Map<string, AppUser>();
    if (raw) {
      const parsed = JSON.parse(raw) as AppUser[];
      if (Array.isArray(parsed)) {
        for (const u of parsed) {
          if (u?.id) byId.set(u.id, u);
        }
      }
    }
    byId.set(profile.id, { ...profile });
    localStorage.setItem(KEY, JSON.stringify([...byId.values()]));
  } catch {
    /* quota / private mode */
  }
}

export function getClassRosterCacheStudents(): AppUser[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AppUser[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((u) => u?.id && u.role === 'student');
  } catch {
    return [];
  }
}

export function mergeStudentRosterPreferDb(dbRows: AppUser[], cacheStudents: AppUser[]): AppUser[] {
  const m = new Map<string, AppUser>();
  for (const u of cacheStudents) {
    if (u.role === 'student') m.set(u.id, { ...u });
  }
  for (const u of dbRows) {
    if (u.role === 'student') m.set(u.id, { ...u });
  }
  return [...m.values()].sort((a, b) =>
    (a.full_name || a.email).localeCompare(b.full_name || b.email, undefined, { sensitivity: 'base' })
  );
}

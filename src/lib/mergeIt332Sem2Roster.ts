import type { AppUser } from '../types';
import {
  IT332_SEM2_COURSE_DISPLAY,
  IT332_SEM2_SCHOOL_YEAR,
  IT332_SEM2_PLANNED_ROSTER,
  type It332PlannedMember,
} from '../data/it332Sem2ClassRoster';

function normEmail(e: string): string {
  return e.trim().toLowerCase();
}

function normStudentNo(s: string | null | undefined): string {
  return String(s ?? '').replace(/\D/g, '');
}

function rosterDisplayName(p: It332PlannedMember): string {
  return `${p.firstName} ${p.lastName}`.trim();
}

function syntheticId(email: string): string {
  const slug = normEmail(email).replace(/[^a-z0-9]/g, '');
  return `roster-pending-${slug || 'unknown'}`;
}

function enrichFromPlanned(row: AppUser, p: It332PlannedMember): AppUser {
  const fromRoster = rosterDisplayName(p);
  return {
    ...row,
    full_name: row.full_name?.trim() ? row.full_name : fromRoster,
    student_number: p.studentSchoolId,
    course_year: IT332_SEM2_COURSE_DISPLAY,
    school_year: IT332_SEM2_SCHOOL_YEAR,
    team_code: p.teamCode,
    roster_member_number: p.memberNumber,
    roster_pending: false,
  };
}

function syntheticUser(p: It332PlannedMember): AppUser {
  return {
    id: syntheticId(p.citEmail),
    email: p.citEmail.trim(),
    full_name: rosterDisplayName(p),
    role: 'student',
    created_at: '1970-01-01T00:00:00.000Z',
    student_number: p.studentSchoolId,
    course_year: IT332_SEM2_COURSE_DISPLAY,
    school_year: IT332_SEM2_SCHOOL_YEAR,
    team_code: p.teamCode,
    roster_member_number: p.memberNumber,
    roster_pending: true,
  };
}

/**
 * Merges the official IT332 Sem 2 team sheet (G1–G7) with students from Supabase / cache.
 * Roster order is preserved; students who signed in with a different email still appear after the cohort.
 */
export function mergeIt332Sem2RosterWithDatabase(dbAndCacheStudents: AppUser[]): AppUser[] {
  const pool = dbAndCacheStudents.filter((u) => u.role === 'student');
  const byEmail = new Map<string, AppUser>();
  const byDigits = new Map<string, AppUser>();
  for (const u of pool) {
    const k = normEmail(u.email ?? '');
    if (k) byEmail.set(k, u);
    const digits = normStudentNo(u.student_number);
    if (digits.length >= 4) byDigits.set(digits, u);
  }

  const out: AppUser[] = [];
  const consumedIds = new Set<string>();

  for (const p of IT332_SEM2_PLANNED_ROSTER) {
    const k = normEmail(p.citEmail);
    let hit = byEmail.get(k);
    if (!hit) {
      const sid = normStudentNo(p.studentSchoolId);
      if (sid.length >= 4) hit = byDigits.get(sid);
    }
    if (hit) {
      consumedIds.add(hit.id);
      out.push(enrichFromPlanned(hit, p));
    } else {
      out.push(syntheticUser(p));
    }
  }

  const rest = pool
    .filter((u) => !consumedIds.has(u.id))
    .sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email, undefined, { sensitivity: 'base' }));

  return [...out, ...rest];
}

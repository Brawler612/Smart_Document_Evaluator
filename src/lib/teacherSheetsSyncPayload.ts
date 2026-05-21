import { getClassRosterCacheStudents, mergeStudentRosterPreferDb } from './classRosterCache';
import { buildClassListSheetValues } from './classListSheetRows';
import { mergeIt332Sem2RosterWithDatabase } from './mergeIt332Sem2Roster';
import { supabase } from './supabase';
import { fetchTeacherSubmissionRows, type TeacherSubmission } from './teacherSubmissionLoad';
import type { AppUser } from '../types';

export function latestSubmissionByStudentId(
  rows: TeacherSubmission[]
): Map<string, TeacherSubmission> {
  const map = new Map<string, TeacherSubmission>();
  for (const s of rows) {
    const cur = map.get(s.student_id);
    if (!cur || new Date(s.submitted_at).getTime() > new Date(cur.submitted_at).getTime()) {
      map.set(s.student_id, s);
    }
  }
  return map;
}

export async function fetchClassListStudentsForSheets(): Promise<AppUser[]> {
  const cachedStudents = getClassRosterCacheStudents();
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('role', 'student')
    .order('full_name', { ascending: true });

  if (error) {
    return mergeIt332Sem2RosterWithDatabase(mergeStudentRosterPreferDb([], cachedStudents));
  }
  return mergeIt332Sem2RosterWithDatabase(
    mergeStudentRosterPreferDb((data ?? []) as AppUser[], cachedStudents)
  );
}

export async function buildClassListSheetValuesFromSupabase(): Promise<string[][]> {
  const [students, submissions] = await Promise.all([
    fetchClassListStudentsForSheets(),
    fetchTeacherSubmissionRows(),
  ]);
  return buildClassListSheetValues(students, latestSubmissionByStudentId(submissions));
}

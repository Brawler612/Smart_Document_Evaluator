export type UserRole = 'teacher' | 'admin' | 'student';
export interface AppUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  created_at: string;
  /** When synced from SSO optional claims mapped into OAuth metadata. See `oauthRosterClaims`. */
  student_number?: string | null;
  course_year?: string | null;
  /** Scholastic school year label (e.g. 2025–2026) when sourced from cohort roster. */
  school_year?: string | null;
  /** IT332 team formation code from the class roster (e.g. 2526-sem2-it332-01). */
  team_code?: string | null;
  /** Member # on the team sheet; 1 = team lead. */
  roster_member_number?: number | null;
  /** No Supabase profile yet — row is from the sheet until the student signs in with this campus email. */
  roster_pending?: boolean;
  /** Profile picture URL synced from the OAuth provider (Google `picture` claim) on each sign-in. */
  avatar_url?: string | null;
}
export type { DocType } from '../lib/documentTypes';
export { DOCUMENT_TYPES, DEFAULT_DOC_TYPE, normalizeDocType, DOC_TYPE_COLORS } from '../lib/documentTypes';
export type AStatus = 'active' | 'closed' | 'draft';
export type SubStatus = 'submitted' | 'under_review' | 'reviewed' | 'resubmit';
export interface Assignment { id: string; title: string; description: string; document_type: DocType; teacher_id: string; group_id: string | null; due_date: string | null; max_score: number; status: AStatus; created_at: string; updated_at: string; }
export interface Submission { id: string; assignment_id: string; student_id: string; file_name: string; status: SubStatus; submitted_at: string; }
export const DEMO_ACCOUNTS = [
  { email: 'prof.santos@cit.edu.ph', password: 'Teacher@CIT2024', role: 'teacher' as UserRole, full_name: 'Prof. Maria Santos' },
  { email: 'juan.dela.cruz@cit.edu.ph', password: 'Student@CIT2024', role: 'student' as UserRole, full_name: 'Juan Dela Cruz' },
];

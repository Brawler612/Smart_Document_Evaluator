export type UserRole = 'teacher' | 'admin' | 'student';
export interface AppUser { id: string; email: string; full_name: string; role: UserRole; created_at: string; }
export type DocType = 'SRS' | 'SDD' | 'SPMP' | 'STD' | 'Other';
export type AStatus = 'active' | 'closed' | 'draft';
export type SubStatus = 'submitted' | 'under_review' | 'reviewed' | 'resubmit';
export interface Assignment { id: string; title: string; description: string; document_type: DocType; teacher_id: string; group_id: string | null; due_date: string | null; max_score: number; status: AStatus; created_at: string; updated_at: string; }
export interface Submission { id: string; assignment_id: string; student_id: string; file_name: string; status: SubStatus; submitted_at: string; }
export const DEMO_ACCOUNTS = [
  { email: 'prof.santos@cit.edu.ph', password: 'Teacher@CIT2024', role: 'teacher' as UserRole, full_name: 'Prof. Maria Santos' },
  { email: 'juan.dela.cruz@cit.edu.ph', password: 'Student@CIT2024', role: 'student' as UserRole, full_name: 'Juan Dela Cruz' },
];

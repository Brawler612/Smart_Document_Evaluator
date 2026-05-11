-- Core tables so submissions persist for every Google sign-in on any device (not browser-local only).
-- PREREQUISITE: `public.users` + Google profile trigger + `public.app_user_is_staff()` must already exist
--   (run docs/supabase-bootstrap-public-users.sql or Part A of supabase-setup-all-in-one.sql first).
-- Run in Supabase SQL Editor once per project (also embedded in supabase-setup-all-in-one.sql Part B).

-- ---------- assignments ----------
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  document_type text not null default 'Other',
  teacher_id uuid not null references public.users (id) on delete cascade,
  group_id uuid null,
  due_date timestamptz null,
  max_score integer not null default 100,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.assignments drop constraint if exists assignments_document_type_check;
alter table public.assignments
  add constraint assignments_document_type_check check (document_type in ('SRS', 'SDD', 'SPMP', 'Other'));

alter table public.assignments drop constraint if exists assignments_status_check;
alter table public.assignments
  add constraint assignments_status_check check (status in ('active', 'closed', 'draft'));

alter table public.assignments enable row level security;

drop policy if exists "assignments_select_visible" on public.assignments;
create policy "assignments_select_visible" on public.assignments
  for select to authenticated
  using (
    status = 'active'
    or teacher_id = auth.uid()
    or public.app_user_is_staff()
  );

drop policy if exists "assignments_insert_own" on public.assignments;
create policy "assignments_insert_own" on public.assignments
  for insert to authenticated
  with check (teacher_id = auth.uid());

drop policy if exists "assignments_update_own" on public.assignments;
create policy "assignments_update_own" on public.assignments
  for update to authenticated
  using (teacher_id = auth.uid() or public.app_user_is_staff())
  with check (teacher_id = auth.uid() or public.app_user_is_staff());

drop policy if exists "assignments_delete_own" on public.assignments;
create policy "assignments_delete_own" on public.assignments
  for delete to authenticated
  using (teacher_id = auth.uid() or public.app_user_is_staff());

-- ---------- submissions ----------
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references public.assignments (id) on delete set null,
  student_id uuid not null references public.users (id) on delete cascade,
  file_name text not null,
  file_url text,
  status text not null default 'submitted',
  feedback text,
  score numeric,
  ai_draft_score integer,
  ai_draft_summary text,
  submission_doc_type text,
  submitted_at timestamptz not null default now()
);

alter table public.submissions drop constraint if exists submissions_submission_doc_type_check;
alter table public.submissions
  add constraint submissions_submission_doc_type_check check (
    submission_doc_type is null
    or submission_doc_type in ('SRS', 'SDD', 'SPMP', 'STD', 'Other')
  );

alter table public.submissions drop constraint if exists submissions_status_check;
alter table public.submissions
  add constraint submissions_status_check check (status in ('submitted', 'under_review', 'reviewed', 'resubmit'));

alter table public.submissions enable row level security;

drop policy if exists "submissions_select_own" on public.submissions;
create policy "submissions_select_own" on public.submissions
  for select to authenticated
  using (student_id = auth.uid());

drop policy if exists "submissions_select_staff" on public.submissions;
create policy "submissions_select_staff" on public.submissions
  for select to authenticated
  using (public.app_user_is_staff());

drop policy if exists "submissions_insert_own" on public.submissions;
create policy "submissions_insert_own" on public.submissions
  for insert to authenticated
  with check (student_id = auth.uid());

drop policy if exists "submissions_insert_staff" on public.submissions;
create policy "submissions_insert_staff" on public.submissions
  for insert to authenticated
  with check (public.app_user_is_staff());

drop policy if exists "submissions_update_student" on public.submissions;
create policy "submissions_update_student" on public.submissions
  for update to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

drop policy if exists "submissions_update_staff" on public.submissions;
create policy "submissions_update_staff" on public.submissions
  for update to authenticated
  using (public.app_user_is_staff())
  with check (public.app_user_is_staff());

drop policy if exists "submissions_delete_teacher" on public.submissions;
create policy "submissions_delete_teacher" on public.submissions
  for delete to authenticated
  using (public.app_user_is_staff());

drop policy if exists "submissions_delete_own" on public.submissions;
create policy "submissions_delete_own" on public.submissions
  for delete to authenticated
  using (student_id = auth.uid());

grant select, insert, update, delete on table public.assignments to authenticated;
grant select, insert, update, delete on table public.submissions to authenticated;
grant all on table public.assignments to service_role;
grant all on table public.submissions to service_role;

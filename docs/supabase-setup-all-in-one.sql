-- ============================================================================
-- Paste this ENTIRE file into Supabase → SQL Editor → Run (one click).
-- Combines: users + assignments/submissions (persistent across devices) + storage + roster columns.
-- ============================================================================

-- ---------- Part A: public.users ----------
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role text not null default 'student',
  created_at timestamptz not null default now()
);

alter table public.users drop constraint if exists users_role_check;
alter table public.users
  add constraint users_role_check check (role in ('teacher', 'student', 'admin'));

alter table public.users enable row level security;

-- Staff check for RLS: must NOT use nested `FROM public.users` inside policies ON users (PostgreSQL recursion).
create or replace function public.app_user_is_staff()
returns boolean
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  return exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role in ('teacher', 'admin')
  );
end;
$$;

revoke all on function public.app_user_is_staff() from public;
grant execute on function public.app_user_is_staff() to anon;
grant execute on function public.app_user_is_staff() to authenticated;

drop policy if exists "users_select_own" on public.users;
create policy "users_select_own" on public.users
  for select using (auth.uid() = id);

drop policy if exists "users_insert_own" on public.users;
create policy "users_insert_own" on public.users
  for insert with check (auth.uid() = id);

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own" on public.users
  for update using (auth.uid() = id);

drop policy if exists "users_select_staff_read_students" on public.users;
create policy "users_select_staff_read_students" on public.users
  for select using (role = 'student' and public.app_user_is_staff());

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on table public.users to authenticated;
grant all on table public.users to service_role;

-- Auto-create public.users rows for Google sign-ins so submissions always have a durable owner.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, role)
  values (
    new.id,
    coalesce(nullif(new.email, ''), new.id::text || '@auth.local'),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(nullif(new.email, ''), new.id::text), '@', 1),
      'User'
    ),
    'student'
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = case
      when public.users.full_name is null or btrim(public.users.full_name) = '' then excluded.full_name
      else public.users.full_name
    end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

insert into public.users (id, email, full_name, role)
select
  au.id,
  coalesce(nullif(au.email, ''), au.id::text || '@auth.local'),
  coalesce(
    nullif(au.raw_user_meta_data ->> 'full_name', ''),
    nullif(au.raw_user_meta_data ->> 'name', ''),
    split_part(coalesce(nullif(au.email, ''), au.id::text), '@', 1),
    'User'
  ),
  'student'
from auth.users au
u ron conflict (id) do update set
  email = excluded.email,
  full_name = case
    when public.users.full_name is null or btrim(public.users.full_name) = '' then excluded.full_name
    else public.users.full_name
  end;

-- ---------- Part B: assignments + submissions (same data after Google sign-in on any device) ----------

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

grant select, insert, update, delete on table public.assignments to authenticated;
grant select, insert, update, delete on table public.submissions to authenticated;
grant all on table public.assignments to service_role;
grant all on table public.submissions to service_role;

-- ---------- Part C: Storage (Open file / uploads) ----------
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES (
  'student-submissions',
  'student-submissions',
  true,
  52428800
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = COALESCE(EXCLUDED.file_size_limit, storage.buckets.file_size_limit);

DROP POLICY IF EXISTS "subs_public_read_student_submissions" ON storage.objects;
DROP POLICY IF EXISTS "subs_authenticated_upload_own_folder" ON storage.objects;

CREATE POLICY "subs_public_read_student_submissions"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'student-submissions');

CREATE POLICY "subs_authenticated_upload_own_folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'student-submissions'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

-- ---------- Part D: Roster spreadsheet columns (grading queue) ----------
-- Title / student roster fields: STUDENT ID, COURSE & YEAR, TEAM CODE, SY, SEMESTER, LAST MODIFIED.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS student_number text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS course_year text;

DO $roster$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'submissions'
  ) THEN
    ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS team_code text;
    ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS school_year text;
    ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS semester text;
    ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS updated_at timestamptz;

    UPDATE public.submissions SET updated_at = submitted_at WHERE updated_at IS NULL;

    ALTER TABLE public.submissions ALTER COLUMN updated_at SET DEFAULT now();
    ALTER TABLE public.submissions ALTER COLUMN updated_at SET NOT NULL;

    CREATE OR REPLACE FUNCTION public.submissions_touch_updated_at()
    RETURNS TRIGGER AS $fn$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_submissions_touch_updated_at ON public.submissions;
    CREATE TRIGGER trg_submissions_touch_updated_at
      BEFORE UPDATE ON public.submissions
      FOR EACH ROW
      EXECUTE PROCEDURE public.submissions_touch_updated_at();
  END IF;
END $roster$;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Paste this ENTIRE file into Supabase → SQL Editor → Run (one click).
-- Combines: public.users bootstrap + student-submissions storage + roster columns for the grading table.
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

-- ---------- Part B: Storage (Open file / uploads) ----------
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

-- ---------- Part C: Roster spreadsheet columns (grading queue) ----------
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

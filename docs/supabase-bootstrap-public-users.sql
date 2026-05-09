-- =============================================================================
-- ONE-SHOT SETUP: public.users + RLS (run this if you see
-- "Could not find the table 'public.users' in the schema cache" in the app)
-- =============================================================================
-- Supabase Dashboard → SQL Editor → paste → Run.
-- Then wait a few seconds and click Sync on Class list (or refresh the app).

-- 1) Table — links each profile row to auth.users(id) (same id as Google sign-in).
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role text not null default 'student',
  created_at timestamptz not null default now()
);

-- Allow teacher / student / admin (app uses admins from env; must match AuthContext).
alter table public.users drop constraint if exists users_role_check;
alter table public.users
  add constraint users_role_check check (role in ('teacher', 'student', 'admin'));

-- 2) Row Level Security — own row insert/update/read; staff read students (policy block 3).
alter table public.users enable row level security;

-- Policies on `public.users` cannot use nested `FROM public.users` — use SECURITY DEFINER helper instead.
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

-- 3) Staff read roster — teacher or admin viewers can SELECT student rows (class list / grading).
drop policy if exists "users_select_staff_read_students" on public.users;
create policy "users_select_staff_read_students" on public.users
  for select using (role = 'student' and public.app_user_is_staff());

-- 4) Let the Data API reach the table (some projects use explicit grants); RLS still applies.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on table public.users to authenticated;
grant all on table public.users to service_role;

-- 5) PostgREST v14+ often needs a schema reload so the API stops saying "schema cache" / table missing.
notify pgrst, 'reload schema';

-- If the API still cannot see `users`: Dashboard → Project Settings → Data API → ensure `public` is exposed,
-- or pause/unpause the project once, then run this script again.

-- Example RLS for `public.users` so Google (and email) sign-in can insert/read the signed-in user's row.
-- Apply in Supabase → SQL Editor after your `users` table exists and `id` matches `auth.users(id)`.
-- First-time setup (table missing / schema cache error): use `supabase-bootstrap-public-users.sql` instead.

alter table public.users enable row level security;

drop policy if exists "users_select_own" on public.users;
create policy "users_select_own" on public.users
  for select using (auth.uid() = id);

drop policy if exists "users_insert_own" on public.users;
create policy "users_insert_own" on public.users
  for insert with check (auth.uid() = id);

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own" on public.users
  for update using (auth.uid() = id);

-- Staff reading students: apply `docs/supabase-rls-teacher-read-students.sql`
-- Recursion errors on `/users`: `docs/supabase-fix-users-rls-recursion.sql`.

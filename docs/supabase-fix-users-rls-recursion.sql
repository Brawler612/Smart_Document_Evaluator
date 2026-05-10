-- Fix: HTTP 500 / “infinite recursion detected in policy for relation users”
-- Cause: SELECT policies on `public.users` must not use nested `FROM public.users` (RLS loops).
-- Supabase → SQL Editor → paste this entire file → Run.
-- Or locally (needs DATABASE_URL in .env): npm run db:fix-rls

-- Legacy policy name from older docs — drop before recreate.
drop policy if exists "users_select_teachers_read_students" on public.users;

-- `SET row_security = off` makes the inner SELECT ignore RLS so this cannot recurse.
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

drop policy if exists "users_select_staff_read_students" on public.users;

create policy "users_select_staff_read_students" on public.users
  for select using (
    role = 'student'
    and public.app_user_is_staff()
  );

notify pgrst, 'reload schema';

-- Allow teachers to read student rows on `public.users` (class list, grading roster, submission lists).
-- Apply in Supabase → SQL Editor after `public.users` exists.
--
-- Uses `public.app_user_is_staff()` (SECURITY DEFINER) so policy evaluation does not recurse on `users`.

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

drop policy if exists "users_select_teachers_read_students" on public.users;
drop policy if exists "users_select_staff_read_students" on public.users;

create policy "users_select_staff_read_students" on public.users
  for select using (role = 'student' and public.app_user_is_staff());

notify pgrst, 'reload schema';

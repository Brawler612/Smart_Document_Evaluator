-- Run once in Supabase SQL Editor if grades publish but Table Editor does not change.
-- Fixes: instructor Google account blocked by RLS when public.users.role is still "student".

-- 1) Staff = teacher/admin role OR your instructor Gmail (edit the email if needed)
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
      and (
        u.role in ('teacher', 'admin')
        or lower(trim(u.email)) in (
          lower('dinaponash26@gmail.com')
        )
      )
  );
end;
$$;

revoke all on function public.app_user_is_staff() from public;
grant execute on function public.app_user_is_staff() to anon;
grant execute on function public.app_user_is_staff() to authenticated;

-- 2) Ensure instructor row can write submissions
drop policy if exists "submissions_update_staff" on public.submissions;
create policy "submissions_update_staff" on public.submissions
  for update to authenticated
  using (public.app_user_is_staff())
  with check (public.app_user_is_staff());

-- 3) Set instructor role in roster (replace email if you use a different Gmail)
update public.users
set role = 'admin'
where lower(trim(email)) = lower('dinaponash26@gmail.com');

notify pgrst, 'reload schema';

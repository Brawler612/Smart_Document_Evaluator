-- Optional: let teachers delete grading-queue rows from the app ("Delete" on /grading).
-- If delete shows a database error, run this for your actual submissions table name
-- (`submissions` or `submission` — match `resolveSubmissionTableName` / Supabase Table Editor).

-- alter table public.submissions enable row level security;

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

drop policy if exists "submissions_delete_teacher" on public.submissions;
create policy "submissions_delete_teacher" on public.submissions
  for delete using (public.app_user_is_staff());

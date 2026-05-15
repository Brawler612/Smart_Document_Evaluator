-- Lets students delete their own submission rows even when table DELETE policies
-- were never applied. Safe: runs as definer but only deletes where student_id = auth.uid().
--
-- Run once in Supabase → SQL Editor (or: npm run db:fix-student-delete)

create or replace function public.delete_own_submission(p_submission_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if auth.uid() is null then
    return false;
  end if;

  if to_regclass('public.submissions') is not null then
    delete from public.submissions
    where id = p_submission_id and student_id = auth.uid();
    get diagnostics n = row_count;
    if n > 0 then
      return true;
    end if;
  end if;

  if to_regclass('public.submission') is not null then
    delete from public.submission
    where id = p_submission_id and student_id = auth.uid();
    get diagnostics n = row_count;
    if n > 0 then
      return true;
    end if;
  end if;

  return false;
end;
$$;

revoke all on function public.delete_own_submission(uuid) from public;
grant execute on function public.delete_own_submission(uuid) to authenticated;

-- Keep RLS delete policy in sync (harmless if it already exists)
grant delete on table public.submissions to authenticated;

drop policy if exists "submissions_delete_own" on public.submissions;
create policy "submissions_delete_own" on public.submissions
  for delete to authenticated
  using (student_id = auth.uid());

notify pgrst, 'reload schema';

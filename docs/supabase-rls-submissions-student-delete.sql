-- Allows authenticated students to delete their own submission rows.
-- For the full fix (RPC + policy), run instead:
--   docs/supabase-fn-delete-own-submission.sql
--   npm run db:fix-student-delete

grant delete on table public.submissions to authenticated;

drop policy if exists "submissions_delete_own" on public.submissions;
create policy "submissions_delete_own" on public.submissions
  for delete to authenticated
  using (student_id = auth.uid());

notify pgrst, 'reload schema';

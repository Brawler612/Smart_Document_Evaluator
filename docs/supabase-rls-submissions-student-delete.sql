-- Allows authenticated students to delete their own submission rows.
-- Apply this if you see the "Delete was blocked by Row Level Security" hint
-- in the My Submissions page when clicking Remove.
--
-- The existing `submissions_delete_teacher` policy is unchanged; students
-- and teachers now have parallel delete policies that are evaluated with OR
-- semantics, so teachers retain their broader access.

-- Schema A: table is named `submissions` (plural). Default in this repo.
grant delete on table public.submissions to authenticated;

drop policy if exists "submissions_delete_own" on public.submissions;
create policy "submissions_delete_own" on public.submissions
  for delete to authenticated
  using (student_id = auth.uid());

-- Schema B: table is named `submission` (singular). Uncomment if your DB uses it.
-- grant delete on table public.submission to authenticated;
-- drop policy if exists "submission_delete_own" on public.submission;
-- create policy "submission_delete_own" on public.submission
--   for delete to authenticated
--   using (student_id = auth.uid());

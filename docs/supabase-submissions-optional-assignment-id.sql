-- Optional: restore `assignment_id` on public.submissions if it was removed in Table Editor.
-- The app works WITHOUT this column (uploads use student_id + file fields only).
-- Only run this if you still use the assignments table and want FK links back.

-- alter table public.submissions
--   add column if not exists assignment_id uuid references public.assignments(id) on delete set null;

-- After adding the column, refresh PostgREST:
-- NOTIFY pgrst, 'reload schema';

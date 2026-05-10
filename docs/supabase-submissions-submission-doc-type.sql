-- Adds student-selected document label for Quick submit (SRS / SDD / SPMP / STD) — shows as grading queue Title.
-- Safe on existing DBs: ADD COLUMN IF NOT EXISTS.

alter table public.submissions add column if not exists submission_doc_type text;

alter table public.submissions drop constraint if exists submissions_submission_doc_type_check;
alter table public.submissions
  add constraint submissions_submission_doc_type_check check (
    submission_doc_type is null
    or submission_doc_type in ('SRS', 'SDD', 'SPMP', 'STD', 'Other')
  );

notify pgrst, 'reload schema';

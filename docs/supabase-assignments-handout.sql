-- Optional: teacher assignment handout (PDF/spec) visible to students on Tasks + Assignments.
-- Run in Supabase → SQL Editor after `assignments` exists.

alter table public.assignments add column if not exists handout_url text null;
alter table public.assignments add column if not exists handout_file_name text null;

comment on column public.assignments.handout_url is 'Public Storage URL (or https) for the task file students download.';
comment on column public.assignments.handout_file_name is 'Original filename for display / download attribute.';

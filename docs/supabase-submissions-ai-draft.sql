-- Optional: store AI preliminary snapshot when teachers save (vs final score / feedback).
-- Run in Supabase SQL editor, then NOTIFY so PostgREST refreshes:
--   NOTIFY pgrst, 'reload schema';

alter table public.submissions
  add column if not exists ai_draft_score integer,
  add column if not exists ai_draft_summary text;

-- If your table is singular:
-- alter table public.submission
--   add column if not exists ai_draft_score integer,
--   add column if not exists ai_draft_summary text;

notify pgrst, 'reload schema';

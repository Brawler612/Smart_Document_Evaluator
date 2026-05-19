-- Optional one-time cleanup: remove old built-in heuristic summary text from submissions.
-- Run in Supabase SQL Editor if students/teachers still see the long automated block
-- after deploying the app filter (safe to run multiple times).

update public.submissions
set ai_draft_summary = null
where ai_draft_summary ilike '%extended automated summary%'
   or ai_draft_summary ilike '%rubric-aligned draft scores%'
   or ai_draft_summary ilike '%this criterion is scoring in a strong band%';

update public.submissions
set feedback = null
where feedback ilike '%extended automated summary%'
   or feedback ilike '%please read each rubric cell in the modal%';

-- Add STD to assignments.document_type allowed values (run once in Supabase SQL Editor if your DB
-- was created before STD was included in assignments_document_type_check).

alter table public.assignments drop constraint if exists assignments_document_type_check;
alter table public.assignments
  add constraint assignments_document_type_check check (document_type in ('SRS', 'SDD', 'SPMP', 'STD', 'Other'));

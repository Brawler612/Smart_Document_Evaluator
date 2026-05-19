-- Migrate document type constraints to SPP only (run once in Supabase SQL Editor).
-- Existing rows with SRS/SDD/SPMP/STD/Other are normalized to SPP before constraints are applied.

update public.assignments
set document_type = 'SPP'
where document_type is distinct from 'SPP';

update public.submissions
set submission_doc_type = 'SPP'
where submission_doc_type is not null
  and submission_doc_type is distinct from 'SPP';

alter table public.assignments drop constraint if exists assignments_document_type_check;
alter table public.assignments
  alter column document_type set default 'SPP';
alter table public.assignments
  add constraint assignments_document_type_check check (document_type in ('SPP'));

alter table public.submissions drop constraint if exists submissions_submission_doc_type_check;
alter table public.submissions
  add constraint submissions_submission_doc_type_check check (
    submission_doc_type is null
    or submission_doc_type in ('SPP')
  );

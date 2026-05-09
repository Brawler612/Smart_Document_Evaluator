-- Student submission files (PDF, DOC, PPT, etc.) — public read URLs for Open file in grading portal.
-- Run in Supabase → SQL Editor (project owner). Adjust file_size_limit if you need larger portfolios.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES (
  'student-submissions',
  'student-submissions',
  true,
  52428800
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = COALESCE(EXCLUDED.file_size_limit, storage.buckets.file_size_limit);

-- Idempotent policies (Storage RLS uses storage.objects)
DROP POLICY IF EXISTS "subs_public_read_student_submissions" ON storage.objects;
DROP POLICY IF EXISTS "subs_authenticated_upload_own_folder" ON storage.objects;

CREATE POLICY "subs_public_read_student_submissions"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'student-submissions');

CREATE POLICY "subs_authenticated_upload_own_folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'student-submissions'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

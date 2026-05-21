-- Add `updated_at` to public.submissions (fixes "Could not find updated_at column" on publish).
-- Run once in Supabase → SQL Editor, then refresh the Table Editor.

ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.submissions SET updated_at = submitted_at WHERE updated_at IS NULL;

ALTER TABLE public.submissions ALTER COLUMN updated_at SET DEFAULT now();

NOTIFY pgrst, 'reload schema';

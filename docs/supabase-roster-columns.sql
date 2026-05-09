-- Roster spreadsheet fields (TITLE, STUDENT ID, COURSE & YEAR, TEAM CODE, SY, SEMESTER, LAST MODIFIED).
-- Run once in Supabase SQL Editor; safe to re-run (IF NOT EXISTS / DO $$ blocks).

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS student_number text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS course_year text;

DO $roster$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'submissions'
  ) THEN
    ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS team_code text;
    ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS school_year text;
    ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS semester text;
    ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS updated_at timestamptz;

    UPDATE public.submissions SET updated_at = submitted_at WHERE updated_at IS NULL;

    ALTER TABLE public.submissions ALTER COLUMN updated_at SET DEFAULT now();
    ALTER TABLE public.submissions ALTER COLUMN updated_at SET NOT NULL;

    CREATE OR REPLACE FUNCTION public.submissions_touch_updated_at()
    RETURNS TRIGGER AS $fn$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_submissions_touch_updated_at ON public.submissions;
    CREATE TRIGGER trg_submissions_touch_updated_at
      BEFORE UPDATE ON public.submissions
      FOR EACH ROW
      EXECUTE PROCEDURE public.submissions_touch_updated_at();
  END IF;
END $roster$;

-- If your table is singular `submission`, mirror columns there:
-- ALTER TABLE public.submission ADD COLUMN IF NOT EXISTS team_code text;
-- (and repeat updated_at + trigger on that table)

NOTIFY pgrst, 'reload schema';

-- Allow soft-delete state on opportunities / tasks / meetings
-- https://supabase.com/dashboard/project/uigncohufvzhcgngwluj/sql/new

DO $$ BEGIN
  ALTER TABLE public.opportunities DROP CONSTRAINT IF EXISTS opportunities_state_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_state_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.meetings_calls DROP CONSTRAINT IF EXISTS meetings_calls_state_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.meetings_calls ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

UPDATE public.opportunities SET state = 'active' WHERE state IS NULL OR state = '';
UPDATE public.tasks SET state = 'active' WHERE state IS NULL OR state = '';
UPDATE public.meetings_calls SET state = 'active' WHERE state IS NULL OR state = '';

DO $$ BEGIN
  ALTER TABLE public.opportunities
    ADD CONSTRAINT opportunities_state_check CHECK (state IN ('active', 'deleted', 'inactive'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_state_check CHECK (state IN ('active', 'deleted', 'inactive'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.meetings_calls
    ADD CONSTRAINT meetings_calls_state_check CHECK (state IN ('active', 'deleted', 'inactive'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT UPDATE ON public.opportunities TO authenticated;
GRANT UPDATE ON public.tasks TO authenticated;
GRANT UPDATE ON public.meetings_calls TO authenticated;

SELECT '006 done — state deleted allowed for soft-delete' AS status;

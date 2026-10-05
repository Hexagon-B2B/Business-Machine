-- Allow soft-delete state on opportunities / tasks / meetings
-- https://supabase.com/dashboard/project/uigncohufvzhcgngwluj/sql/new
-- Safe to re-run. Fixes constraint violation by normalizing state first.

-- 1) Drop existing state checks
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

-- 2) Ensure deleted_at columns exist
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.meetings_calls ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 3) Normalize ALL existing state values before adding constraint
UPDATE public.opportunities
SET state = CASE
  WHEN deleted_at IS NOT NULL THEN 'deleted'
  WHEN lower(trim(coalesce(state, ''))) IN ('deleted', 'trash', 'removed') THEN 'deleted'
  WHEN lower(trim(coalesce(state, ''))) IN ('inactive', 'archived') THEN 'inactive'
  ELSE 'active'
END;

UPDATE public.tasks
SET state = CASE
  WHEN deleted_at IS NOT NULL THEN 'deleted'
  WHEN lower(trim(coalesce(state, ''))) IN ('deleted', 'trash', 'removed') THEN 'deleted'
  WHEN lower(trim(coalesce(state, ''))) IN ('inactive', 'archived') THEN 'inactive'
  ELSE 'active'
END;

UPDATE public.meetings_calls
SET state = CASE
  WHEN deleted_at IS NOT NULL THEN 'deleted'
  WHEN lower(trim(coalesce(state, ''))) IN ('deleted', 'trash', 'removed') THEN 'deleted'
  WHEN lower(trim(coalesce(state, ''))) IN ('inactive', 'archived') THEN 'inactive'
  ELSE 'active'
END;

-- 4) Diagnostic
SELECT 'opportunities' AS tbl, state, count(*) AS n FROM public.opportunities GROUP BY state
UNION ALL
SELECT 'tasks', state, count(*) FROM public.tasks GROUP BY state
UNION ALL
SELECT 'meetings_calls', state, count(*) FROM public.meetings_calls GROUP BY state
ORDER BY 1, 2;

-- 5) Add permissive checks only after data is clean
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

ALTER TABLE public.opportunities ALTER COLUMN state SET DEFAULT 'active';
ALTER TABLE public.tasks ALTER COLUMN state SET DEFAULT 'active';
ALTER TABLE public.meetings_calls ALTER COLUMN state SET DEFAULT 'active';

GRANT UPDATE ON public.opportunities TO authenticated;
GRANT UPDATE ON public.tasks TO authenticated;
GRANT UPDATE ON public.meetings_calls TO authenticated;

SELECT '006 done — state normalized + deleted allowed for soft-delete' AS status;

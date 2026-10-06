-- =============================================================================
-- 008: company pincode + locations metadata note + fix tasks_priority_check
-- Run in Supabase SQL Editor (safe to re-run)
-- Project: uigncohufvzhcgngwluj
-- =============================================================================

-- 1) Company pincode
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS pincode text;
COMMENT ON COLUMN public.companies.pincode IS 'Primary address postal / PIN code';

-- 2) Optional structured locations (also stored in metadata.locations by the app)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE public.companies ADD COLUMN metadata jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- 3) Fix tasks priority check — allow low / medium / high (app values)
DO $$
BEGIN
  ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_priority_check;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  UPDATE public.tasks SET priority = lower(trim(priority))
  WHERE priority IS NOT NULL;

  UPDATE public.tasks SET priority = 'high'
  WHERE lower(priority) IN ('p1', '1', 'urgent', 'critical');

  UPDATE public.tasks SET priority = 'medium'
  WHERE priority IS NULL OR priority = '' OR lower(priority) IN ('p2', '2', 'normal');

  UPDATE public.tasks SET priority = 'low'
  WHERE lower(priority) IN ('p3', '3');

  UPDATE public.tasks
  SET priority = 'medium'
  WHERE priority IS NULL OR lower(priority) NOT IN ('low', 'medium', 'high');

  ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_priority_check
    CHECK (priority IS NULL OR priority IN ('low', 'medium', 'high'));
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

-- 4) meetings_calls status for edit workflow
DO $$
BEGIN
  ALTER TABLE public.meetings_calls ADD COLUMN IF NOT EXISTS status text DEFAULT 'open';
  UPDATE public.meetings_calls SET status = 'completed'
  WHERE status IS NULL OR status = '' OR lower(status) IN ('done', 'closed');
  UPDATE public.meetings_calls SET status = lower(status) WHERE status IS NOT NULL;

  ALTER TABLE public.meetings_calls DROP CONSTRAINT IF EXISTS meetings_calls_status_check;
  ALTER TABLE public.meetings_calls
    ADD CONSTRAINT meetings_calls_status_check
    CHECK (status IS NULL OR status IN ('open', 'in_progress', 'completed', 'cancelled'));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

SELECT 'companies.pincode' AS check, EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema='public' AND table_name='companies' AND column_name='pincode'
)::text AS ok
UNION ALL
SELECT 'tasks_priority_check', EXISTS (
  SELECT 1 FROM pg_constraint WHERE conname = 'tasks_priority_check'
)::text;

-- =============================================================================
-- 010: Expand meetings_calls.type to call | meeting | visit | message
--      Align status values with app (open | in_progress | completed | cancelled)
-- Run in Supabase SQL Editor (safe to re-run)
-- Project: uigncohufvzhcgngwluj
-- =============================================================================

-- Normalize existing type values
UPDATE public.meetings_calls
SET type = lower(trim(type))
WHERE type IS NOT NULL;

UPDATE public.meetings_calls
SET type = 'call'
WHERE type IS NULL OR type = '' OR lower(type) NOT IN ('call', 'meeting', 'visit', 'message');

-- Drop old type check if present (name may vary)
DO $$
BEGIN
  ALTER TABLE public.meetings_calls DROP CONSTRAINT IF EXISTS meetings_calls_type_check;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.meetings_calls'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%type%'
  LOOP
    EXECUTE format('ALTER TABLE public.meetings_calls DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

ALTER TABLE public.meetings_calls
  ADD CONSTRAINT meetings_calls_type_check
  CHECK (type IS NULL OR type IN ('call', 'meeting', 'visit', 'message'));

-- Ensure status column + check (from 008; safe re-run)
DO $$
BEGIN
  ALTER TABLE public.meetings_calls ADD COLUMN IF NOT EXISTS status text DEFAULT 'open';
  UPDATE public.meetings_calls SET status = 'completed'
  WHERE status IS NULL OR status = '' OR lower(status) IN ('done', 'closed');
  UPDATE public.meetings_calls SET status = lower(status) WHERE status IS NOT NULL;
  UPDATE public.meetings_calls SET status = 'open'
  WHERE status IS NULL OR lower(status) NOT IN ('open', 'in_progress', 'completed', 'cancelled');

  ALTER TABLE public.meetings_calls DROP CONSTRAINT IF EXISTS meetings_calls_status_check;
  ALTER TABLE public.meetings_calls
    ADD CONSTRAINT meetings_calls_status_check
    CHECK (status IS NULL OR status IN ('open', 'in_progress', 'completed', 'cancelled'));
EXCEPTION WHEN undefined_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

-- Optional columns used by app
ALTER TABLE public.meetings_calls ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.meetings_calls ADD COLUMN IF NOT EXISTS outcome text;
ALTER TABLE public.meetings_calls ADD COLUMN IF NOT EXISTS next_action text;
ALTER TABLE public.meetings_calls ADD COLUMN IF NOT EXISTS next_action_due_at timestamptz;
ALTER TABLE public.meetings_calls ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;
ALTER TABLE public.meetings_calls ADD COLUMN IF NOT EXISTS contact_id uuid;
ALTER TABLE public.meetings_calls ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.meetings_calls ADD COLUMN IF NOT EXISTS state text DEFAULT 'active';
ALTER TABLE public.meetings_calls ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.meetings_calls.type IS 'call | meeting | visit | message';
COMMENT ON COLUMN public.meetings_calls.status IS 'open | in_progress | completed | cancelled';

-- Verify
SELECT 'type_check' AS check_name,
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meetings_calls_type_check')::text AS ok
UNION ALL
SELECT 'status_check',
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meetings_calls_status_check')::text
UNION ALL
SELECT 'sample types allowed', string_agg(DISTINCT type, ', ')
FROM public.meetings_calls;

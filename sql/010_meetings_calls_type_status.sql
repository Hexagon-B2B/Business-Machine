-- =============================================================================
-- 010: CREATE meetings_calls (if missing) + type/status constraints
-- Run in Supabase SQL Editor — paste the FULL script, not the filename
-- Project: uigncohufvzhcgngwluj
-- Safe to re-run
-- =============================================================================

-- 1) Create table if it does not exist
CREATE TABLE IF NOT EXISTS public.meetings_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  type text NOT NULL DEFAULT 'call'
    CHECK (type IN ('call', 'meeting', 'visit', 'message')),
  subject text NOT NULL,
  description text,
  outcome text,
  next_action text,
  next_action_due_at timestamptz,
  scheduled_at timestamptz DEFAULT now(),
  status text DEFAULT 'open'
    CHECK (status IS NULL OR status IN ('open', 'in_progress', 'completed', 'cancelled')),
  state text NOT NULL DEFAULT 'active'
    CHECK (state IN ('active', 'deleted', 'inactive')),
  deleted_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) If table already existed with fewer columns, add missing ones
ALTER TABLE public.meetings_calls ADD COLUMN IF NOT EXISTS contact_id uuid;
ALTER TABLE public.meetings_calls ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.meetings_calls ADD COLUMN IF NOT EXISTS outcome text;
ALTER TABLE public.meetings_calls ADD COLUMN IF NOT EXISTS next_action text;
ALTER TABLE public.meetings_calls ADD COLUMN IF NOT EXISTS next_action_due_at timestamptz;
ALTER TABLE public.meetings_calls ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;
ALTER TABLE public.meetings_calls ADD COLUMN IF NOT EXISTS status text DEFAULT 'open';
ALTER TABLE public.meetings_calls ADD COLUMN IF NOT EXISTS state text DEFAULT 'active';
ALTER TABLE public.meetings_calls ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.meetings_calls ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.meetings_calls ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.meetings_calls ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 3) Normalize type values, then enforce allowed set
UPDATE public.meetings_calls
SET type = lower(trim(type))
WHERE type IS NOT NULL;

UPDATE public.meetings_calls
SET type = 'call'
WHERE type IS NULL OR type = '' OR lower(type) NOT IN ('call', 'meeting', 'visit', 'message');

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.meetings_calls'::regclass
      AND contype = 'c'
      AND (
        pg_get_constraintdef(oid) ILIKE '%type%'
        OR conname ILIKE '%type%'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.meetings_calls DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

ALTER TABLE public.meetings_calls DROP CONSTRAINT IF EXISTS meetings_calls_type_check;
ALTER TABLE public.meetings_calls
  ADD CONSTRAINT meetings_calls_type_check
  CHECK (type IS NULL OR type IN ('call', 'meeting', 'visit', 'message'));

-- 4) Status normalize + check
UPDATE public.meetings_calls SET status = 'completed'
WHERE status IS NULL OR status = '' OR lower(status) IN ('done', 'closed');
UPDATE public.meetings_calls SET status = lower(status) WHERE status IS NOT NULL;
UPDATE public.meetings_calls SET status = 'open'
WHERE status IS NULL OR lower(status) NOT IN ('open', 'in_progress', 'completed', 'cancelled');

ALTER TABLE public.meetings_calls DROP CONSTRAINT IF EXISTS meetings_calls_status_check;
ALTER TABLE public.meetings_calls
  ADD CONSTRAINT meetings_calls_status_check
  CHECK (status IS NULL OR status IN ('open', 'in_progress', 'completed', 'cancelled'));

-- 5) State normalize + check
UPDATE public.meetings_calls SET state = 'active' WHERE state IS NULL OR state = '';
ALTER TABLE public.meetings_calls DROP CONSTRAINT IF EXISTS meetings_calls_state_check;
ALTER TABLE public.meetings_calls
  ADD CONSTRAINT meetings_calls_state_check
  CHECK (state IN ('active', 'deleted', 'inactive'));

-- 6) Indexes
CREATE INDEX IF NOT EXISTS idx_meetings_company ON public.meetings_calls(company_id);
CREATE INDEX IF NOT EXISTS idx_meetings_scheduled ON public.meetings_calls(scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_meetings_state ON public.meetings_calls(state);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON public.meetings_calls(status);

-- 7) RLS + grants (same pattern as rest of app)
ALTER TABLE public.meetings_calls ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY meetings_calls_all ON public.meetings_calls
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meetings_calls TO authenticated;

COMMENT ON TABLE public.meetings_calls IS 'Calls, meetings, visits, messages linked to a company';
COMMENT ON COLUMN public.meetings_calls.type IS 'call | meeting | visit | message';
COMMENT ON COLUMN public.meetings_calls.status IS 'open | in_progress | completed | cancelled';

-- 8) Verify
SELECT 'table_exists' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'meetings_calls'
  )::text AS ok
UNION ALL
SELECT 'type_check',
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meetings_calls_type_check')::text
UNION ALL
SELECT 'status_check',
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meetings_calls_status_check')::text
UNION ALL
SELECT 'row_count', count(*)::text FROM public.meetings_calls;

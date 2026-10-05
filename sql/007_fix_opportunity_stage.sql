-- =============================================================================
-- 007 Fix opportunities_stage_check to match app OPP_STAGES
-- https://supabase.com/dashboard/project/uigncohufvzhcgngwluj/sql/new
-- Safe to re-run.
-- App stages (buyer progress):
--   requirement | qualification | discovery | solution | quotation
--   | negotiation | decision | won | lost
-- =============================================================================

-- 1) See current distribution (diagnostic)
SELECT stage, count(*) AS n
FROM public.opportunities
GROUP BY stage
ORDER BY n DESC;

-- 2) Drop restrictive / outdated stage check
DO $$ BEGIN
  ALTER TABLE public.opportunities DROP CONSTRAINT IF EXISTS opportunities_stage_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- Also drop any similarly named constraints
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.opportunities'::regclass
      AND contype = 'c'
      AND (conname ILIKE '%stage%')
  LOOP
    EXECUTE format('ALTER TABLE public.opportunities DROP CONSTRAINT IF EXISTS %I', r.conname);
    RAISE NOTICE 'Dropped constraint %', r.conname;
  END LOOP;
END $$;

-- 3) Normalize legacy / blank / mismatched stage values → app codes
UPDATE public.opportunities
SET stage = lower(trim(stage))
WHERE stage IS NOT NULL;

UPDATE public.opportunities SET stage = 'requirement'
WHERE stage IS NULL OR stage IN ('', 'new', 'lead', 'prospect', 'open', 'identified');

UPDATE public.opportunities SET stage = 'qualification'
WHERE stage IN ('qualify', 'qualified', 'qualifying', 'qualification');

UPDATE public.opportunities SET stage = 'discovery'
WHERE stage IN ('discover', 'discovery', 'needs analysis', 'needs_analysis');

UPDATE public.opportunities SET stage = 'solution'
WHERE stage IN ('solution', 'proposal', 'propose', 'solutioning');

UPDATE public.opportunities SET stage = 'quotation'
WHERE stage IN ('quotation', 'quote', 'quoted', 'pricing');

UPDATE public.opportunities SET stage = 'negotiation'
WHERE stage IN ('negotiation', 'negotiate', 'negotiating');

UPDATE public.opportunities SET stage = 'decision'
WHERE stage IN ('decision', 'closing', 'commit', 'verbal');

UPDATE public.opportunities SET stage = 'won'
WHERE stage IN ('won', 'closed_won', 'closed won', 'order', 'booked');

UPDATE public.opportunities SET stage = 'lost'
WHERE stage IN ('lost', 'closed_lost', 'closed lost', 'dropped', 'dead');

-- Anything still outside the allowed set → requirement (safe default)
UPDATE public.opportunities
SET stage = 'requirement'
WHERE stage IS NULL
   OR stage NOT IN (
     'requirement', 'qualification', 'discovery', 'solution',
     'quotation', 'negotiation', 'decision', 'won', 'lost'
   );

-- 4) Confirm clean
SELECT stage, count(*) AS n
FROM public.opportunities
GROUP BY stage
ORDER BY n DESC;

-- 5) Add constraint matching app constants.js OPP_STAGES
DO $$ BEGIN
  ALTER TABLE public.opportunities
    ADD CONSTRAINT opportunities_stage_check
    CHECK (stage IN (
      'requirement', 'qualification', 'discovery', 'solution',
      'quotation', 'negotiation', 'decision', 'won', 'lost'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 6) Default for new rows
ALTER TABLE public.opportunities ALTER COLUMN stage SET DEFAULT 'requirement';

-- 7) Ensure state soft-delete still allowed (idempotent with 006)
DO $$ BEGIN
  ALTER TABLE public.opportunities DROP CONSTRAINT IF EXISTS opportunities_state_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

UPDATE public.opportunities
SET state = CASE
  WHEN deleted_at IS NOT NULL THEN 'deleted'
  WHEN lower(trim(coalesce(state, ''))) IN ('deleted', 'trash', 'removed') THEN 'deleted'
  WHEN lower(trim(coalesce(state, ''))) IN ('inactive', 'archived') THEN 'inactive'
  ELSE 'active'
END;

DO $$ BEGIN
  ALTER TABLE public.opportunities
    ADD CONSTRAINT opportunities_state_check
    CHECK (state IN ('active', 'deleted', 'inactive'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.opportunities ALTER COLUMN state SET DEFAULT 'active';
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

GRANT INSERT, UPDATE, SELECT, DELETE ON public.opportunities TO authenticated;

SELECT '007 done — opportunities stage + state constraints aligned with app' AS status;

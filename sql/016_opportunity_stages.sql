-- Opportunity stages (Nov 2026 pipeline)
-- requirement → qualified → discovery → quotation → negotiation → approved → won | lost
-- Run in Supabase SQL editor.
-- IMPORTANT: drop constraint FIRST, then normalize data, then re-add check.

-- 1) Drop existing stage check (name may vary)
ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_stage_check;

-- Also drop if Postgres auto-named a different check on stage
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'opportunities'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%stage%'
  LOOP
    EXECUTE format('ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

-- 2) Normalize legacy stage values (safe now that check is gone)
UPDATE opportunities SET stage = 'qualified'   WHERE stage = 'qualification';
UPDATE opportunities SET stage = 'discovery'   WHERE stage = 'solution';
UPDATE opportunities SET stage = 'negotiation' WHERE stage = 'decision';

-- 3) Re-add check with full allowed set
ALTER TABLE opportunities
  ADD CONSTRAINT opportunities_stage_check
  CHECK (
    stage IS NULL
    OR stage IN (
      'requirement',
      'qualified',
      'discovery',
      'quotation',
      'negotiation',
      'approved',
      'won',
      'lost'
    )
  );

-- 4) Quick verify
SELECT stage, count(*) FROM opportunities GROUP BY stage ORDER BY 1;

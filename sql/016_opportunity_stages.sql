-- Opportunity stages (Nov 2026 pipeline)
-- requirement → qualified → discovery → quotation → negotiation → approved → won | lost
-- Run in Supabase SQL editor if stage check constraint blocks updates.

UPDATE opportunities SET stage = 'qualified' WHERE stage = 'qualification';
UPDATE opportunities SET stage = 'discovery' WHERE stage = 'solution';
UPDATE opportunities SET stage = 'negotiation' WHERE stage = 'decision';

ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_stage_check;
ALTER TABLE opportunities ADD CONSTRAINT opportunities_stage_check
  CHECK (stage IS NULL OR stage IN (
    'requirement', 'qualified', 'discovery', 'quotation', 'negotiation', 'approved', 'won', 'lost',
    'qualification', 'solution', 'decision'
  ));

-- 017 Add opportunity stage: confirmed (after negotiation, before approved)
-- Confirmed = PO/confirmation received, order waiting to execute
-- Approved = DC / delivery challan — pending invoice
-- Won = invoice entered

ALTER TABLE public.opportunities DROP CONSTRAINT IF EXISTS opportunities_stage_check;

ALTER TABLE public.opportunities
  ADD CONSTRAINT opportunities_stage_check
  CHECK (
    stage IS NULL
    OR stage IN (
      'requirement',
      'qualified',
      'discovery',
      'quotation',
      'negotiation',
      'confirmed',
      'approved',
      'won',
      'lost',
      -- legacy aliases still allowed
      'qualification',
      'solution',
      'decision'
    )
  );

COMMENT ON CONSTRAINT opportunities_stage_check ON public.opportunities IS
  'requirement → qualified → discovery → quotation → negotiation → confirmed → approved (DC) → won (invoice) | lost';

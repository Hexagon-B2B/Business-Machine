-- =============================================================================
-- 011: Add lifecycle "not_qualified" + not_qualified_reason
-- Paste full script in Supabase SQL Editor (not the filename)
-- Safe to re-run
-- =============================================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS not_qualified_reason text;

COMMENT ON COLUMN public.companies.not_qualified_reason IS
  'When lifecycle_status = not_qualified: too_small | no_need | financial_risk | bad_payer | high_service | out_of_territory | competitor_locked | compliance | other';

DO $$
BEGIN
  ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_lifecycle_status_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_lifecycle_status_check
  CHECK (
    lifecycle_status IS NULL
    OR lifecycle_status IN (
      'prospect_no_contact',
      'wishlist_1',
      'wishlist_2',
      'first_contact',
      'spoc_identified',
      'rfq_only',
      'active',
      'lost',
      'not_qualified'
    )
  );

SELECT '011 done' AS status,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'not_qualified_reason'
  )::text AS has_reason_column,
  EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_lifecycle_status_check'
  )::text AS has_lifecycle_check;

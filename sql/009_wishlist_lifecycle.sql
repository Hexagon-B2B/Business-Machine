-- =============================================================================
-- 009 Add Wishlist 1 / Wishlist 2 to company lifecycle
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/uigncohufvzhcgngwluj/sql/new
-- Safe to re-run.
-- =============================================================================

DO $$ BEGIN
  ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_lifecycle_status_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- Keep existing rows; only expand allowed values
ALTER TABLE public.companies
  ADD CONSTRAINT companies_lifecycle_status_check
  CHECK (lifecycle_status IS NULL OR lifecycle_status IN (
    'prospect_no_contact',
    'wishlist_1',
    'wishlist_2',
    'first_contact',
    'spoc_identified',
    'rfq_only',
    'active',
    'lost'
  ));

SELECT '009 done — wishlist_1 / wishlist_2 allowed on companies.lifecycle_status' AS status;

SELECT lifecycle_status, count(*) AS n
FROM public.companies
GROUP BY lifecycle_status
ORDER BY n DESC;

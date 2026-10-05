-- =============================================================================
-- 005b Fix lifecycle check constraint (run after 005 failed on constraint)
-- https://supabase.com/dashboard/project/uigncohufvzhcgngwluj/sql/new
-- Safe to re-run.
-- =============================================================================

-- 1) See what values exist (informational)
SELECT lifecycle_status, count(*) AS n
FROM public.companies
GROUP BY lifecycle_status
ORDER BY n DESC;

-- 2) Drop constraint if partially added
DO $$ BEGIN
  ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_lifecycle_status_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- 3) Normalize case / whitespace
UPDATE public.companies
SET lifecycle_status = lower(trim(lifecycle_status))
WHERE lifecycle_status IS NOT NULL;

-- 4) Map known legacy labels → new codes
UPDATE public.companies SET lifecycle_status = 'prospect_no_contact'
  WHERE lifecycle_status IS NULL
     OR lifecycle_status IN ('', 'prospect', 'prospect_no_contact', 'trying', 'no contact', 'no_contact');

UPDATE public.companies SET lifecycle_status = 'first_contact'
  WHERE lifecycle_status IN ('first_contact', '1st contact', '1st contact only', 'first contact', 'first_contact_only');

UPDATE public.companies SET lifecycle_status = 'spoc_identified'
  WHERE lifecycle_status IN ('spoc_identified', 'spoc identified', 'spoc', 'spoc_id');

UPDATE public.companies SET lifecycle_status = 'rfq_only'
  WHERE lifecycle_status IN ('rfq_only', 'rfq only', 'rfq');

UPDATE public.companies SET lifecycle_status = 'active'
  WHERE lifecycle_status IN ('active', 'repeat', 'dormant', 'customer', 'won');

UPDATE public.companies SET lifecycle_status = 'lost'
  WHERE lifecycle_status IN ('lost', 'inactive', 'closed');

-- 5) Anything still outside the allowed set → prospect_no_contact (safe default)
UPDATE public.companies
SET lifecycle_status = 'prospect_no_contact'
WHERE lifecycle_status IS NULL
   OR lifecycle_status NOT IN (
     'prospect_no_contact', 'first_contact', 'spoc_identified',
     'rfq_only', 'active', 'lost'
   );

-- 6) Confirm clean
SELECT lifecycle_status, count(*) AS n
FROM public.companies
GROUP BY lifecycle_status
ORDER BY n DESC;

-- 7) Add constraint only when every row is valid
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.companies
    WHERE lifecycle_status IS NULL
       OR lifecycle_status NOT IN (
         'prospect_no_contact', 'first_contact', 'spoc_identified',
         'rfq_only', 'active', 'lost'
       )
  ) THEN
    RAISE EXCEPTION 'Still have invalid lifecycle_status values — check SELECT above';
  END IF;

  ALTER TABLE public.companies
    ADD CONSTRAINT companies_lifecycle_status_check
    CHECK (lifecycle_status IN (
      'prospect_no_contact', 'first_contact', 'spoc_identified',
      'rfq_only', 'active', 'lost'
    ));
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'Constraint already exists — OK';
END $$;

SELECT '005b done — lifecycle constraint applied' AS status;

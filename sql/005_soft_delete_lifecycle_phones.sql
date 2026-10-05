-- =============================================================================
-- 005 Soft-delete, lifecycle, contact phones, last_billed_at
-- https://supabase.com/dashboard/project/uigncohufvzhcgngwluj/sql/new
-- Safe to re-run. REQUIRED for: Deleted items, multi-phone, lifecycle, dormant.
-- =============================================================================

-- A) Opportunity history: remove blocking triggers + CASCADE FK
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tgname FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'opportunities'
      AND NOT t.tgisinternal
      AND (tgname ILIKE '%history%' OR tgname ILIKE '%log%')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.opportunities', r.tgname);
    RAISE NOTICE 'Dropped trigger %', r.tgname;
  END LOOP;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='opportunity_history') THEN
    ALTER TABLE public.opportunity_history DROP CONSTRAINT IF EXISTS opportunity_history_opportunity_id_fkey;
    ALTER TABLE public.opportunity_history
      ADD CONSTRAINT opportunity_history_opportunity_id_fkey
      FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE CASCADE;
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunity_history TO authenticated;
DO $$ BEGIN
  CREATE POLICY opportunity_history_all ON public.opportunity_history
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- B) Soft-delete columns (state + deleted_at)
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.meetings_calls ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.tasks ALTER COLUMN state SET DEFAULT 'active';
ALTER TABLE public.meetings_calls ALTER COLUMN state SET DEFAULT 'active';
ALTER TABLE public.opportunities ALTER COLUMN state SET DEFAULT 'active';

UPDATE public.tasks SET state = 'active' WHERE state IS NULL OR state = '';
UPDATE public.meetings_calls SET state = 'active' WHERE state IS NULL OR state = '';
UPDATE public.opportunities SET state = 'active' WHERE state IS NULL OR state = '';

CREATE INDEX IF NOT EXISTS idx_tasks_state ON public.tasks(state);
CREATE INDEX IF NOT EXISTS idx_meetings_state ON public.meetings_calls(state);
CREATE INDEX IF NOT EXISTS idx_opps_state ON public.opportunities(state);
CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at ON public.tasks(deleted_at);
CREATE INDEX IF NOT EXISTS idx_meetings_deleted_at ON public.meetings_calls(deleted_at);
CREATE INDEX IF NOT EXISTS idx_opps_deleted_at ON public.opportunities(deleted_at);

-- C) Contact phones: existing phone = Mobile 1; add Mobile 2, landline, extension
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS phone_mobile_2 text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS phone_landline text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS phone_extension text;

-- D) Company last billed + lifecycle values
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS last_billed_at date;

DO $$ BEGIN
  ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_lifecycle_status_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

UPDATE public.companies SET lifecycle_status = 'prospect_no_contact'
  WHERE lifecycle_status IS NULL
     OR lifecycle_status IN ('prospect', 'Prospect', 'prospect_no_contact');
UPDATE public.companies SET lifecycle_status = 'first_contact'
  WHERE lifecycle_status IN ('first_contact', '1st Contact Only', '1st contact');
UPDATE public.companies SET lifecycle_status = 'spoc_identified'
  WHERE lifecycle_status IN ('spoc_identified', 'SPOC Identified');
UPDATE public.companies SET lifecycle_status = 'rfq_only'
  WHERE lifecycle_status IN ('rfq_only', 'RFQ Only', 'RFQ only');
UPDATE public.companies SET lifecycle_status = 'active'
  WHERE lifecycle_status IN ('active', 'Active', 'repeat', 'Repeat', 'dormant', 'Dormant');
UPDATE public.companies SET lifecycle_status = 'lost'
  WHERE lifecycle_status IN ('lost', 'Lost');

DO $$ BEGIN
  ALTER TABLE public.companies
    ADD CONSTRAINT companies_lifecycle_status_check
    CHECK (lifecycle_status IN (
      'prospect_no_contact', 'first_contact', 'spoc_identified',
      'rfq_only', 'active', 'lost'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_companies_lifecycle ON public.companies(lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_companies_last_billed ON public.companies(last_billed_at);

-- E) Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meetings_calls TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.companies TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

SELECT '005 applied: soft-delete, phones, lifecycle, last_billed_at' AS status;

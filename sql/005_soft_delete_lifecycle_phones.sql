-- 005: Soft-delete, opportunity delete fix, contact phones, lifecycle, last_billed
-- https://supabase.com/dashboard/project/uigncohufvzhcgngwluj/sql/new

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT t.tgname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'opportunities' AND NOT t.tgisinternal
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

ALTER TABLE public.tasks ALTER COLUMN state SET DEFAULT 'active';
ALTER TABLE public.meetings_calls ALTER COLUMN state SET DEFAULT 'active';
ALTER TABLE public.opportunities ALTER COLUMN state SET DEFAULT 'active';

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.meetings_calls ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_tasks_state ON public.tasks(state);
CREATE INDEX IF NOT EXISTS idx_meetings_state ON public.meetings_calls(state);
CREATE INDEX IF NOT EXISTS idx_opps_state ON public.opportunities(state);

ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS phone_mobile_2 text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS phone_landline text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS phone_extension text;

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS last_billed_at date;

DO $$ BEGIN
  ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_lifecycle_status_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

UPDATE public.companies SET lifecycle_status = 'prospect_no_contact' WHERE lifecycle_status IN ('prospect');
UPDATE public.companies SET lifecycle_status = 'active' WHERE lifecycle_status IN ('repeat', 'dormant');

GRANT DELETE, UPDATE ON public.tasks TO authenticated;
GRANT DELETE, UPDATE ON public.meetings_calls TO authenticated;
GRANT DELETE, UPDATE ON public.opportunities TO authenticated;
GRANT UPDATE ON public.contacts TO authenticated;
GRANT UPDATE ON public.companies TO authenticated;

SELECT '005 applied: soft-delete, phones, lifecycle, last_billed_at' AS status;

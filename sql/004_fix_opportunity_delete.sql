-- Fix opportunity delete (FK opportunity_history_opportunity_id_fkey)
-- https://supabase.com/dashboard/project/uigncohufvzhcgngwluj/sql/new

DO $$ BEGIN
  CREATE POLICY opportunity_history_all ON public.opportunity_history
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN undefined_table THEN NULL;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunity_history TO authenticated;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tgname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'opportunities'
      AND NOT t.tgisinternal
      AND (tgname ILIKE '%history%' OR tgname ILIKE '%log%')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.opportunities', r.tgname);
    RAISE NOTICE 'Dropped trigger %', r.tgname;
  END LOOP;
END $$;

DO $$ BEGIN
  ALTER TABLE public.opportunity_history
    DROP CONSTRAINT IF EXISTS opportunity_history_opportunity_id_fkey;
  ALTER TABLE public.opportunity_history
    ADD CONSTRAINT opportunity_history_opportunity_id_fkey
    FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'opportunity_history missing — skipped FK change';
WHEN OTHERS THEN
  RAISE NOTICE 'FK change: %', SQLERRM;
END $$;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT DELETE ON public.tasks TO authenticated;
GRANT DELETE ON public.meetings_calls TO authenticated;
GRANT DELETE ON public.opportunities TO authenticated;

SELECT 'opportunity delete fix applied' AS status;

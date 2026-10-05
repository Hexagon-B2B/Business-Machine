-- =============================================================================
-- HEXAGON B2B — SAFE RESET OPERATIONAL DATA
-- Keeps: companies + contacts
-- Deletes: tasks, opportunities, meetings, signals, research, quotes, activity
-- https://supabase.com/dashboard/project/uigncohufvzhcgngwluj/sql/new
-- =============================================================================

SELECT 'tasks' AS tbl, count(*)::int AS n FROM public.tasks
UNION ALL SELECT 'opportunities', count(*)::int FROM public.opportunities
UNION ALL SELECT 'meetings_calls', count(*)::int FROM public.meetings_calls
UNION ALL SELECT 'signals', count(*)::int FROM public.signals
UNION ALL SELECT 'companies', count(*)::int FROM public.companies
UNION ALL SELECT 'contacts', count(*)::int FROM public.contacts;

DO $$ BEGIN DELETE FROM public.opportunity_history; EXCEPTION WHEN undefined_table THEN NULL; WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DELETE FROM public.quotation_items; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DELETE FROM public.quotations; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DELETE FROM public.activity_log; EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.opportunities DISABLE TRIGGER USER; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DELETE FROM public.opportunities;
DO $$ BEGIN ALTER TABLE public.opportunities ENABLE TRIGGER USER; EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.tasks DISABLE TRIGGER USER; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DELETE FROM public.tasks;
DO $$ BEGIN ALTER TABLE public.tasks ENABLE TRIGGER USER; EXCEPTION WHEN OTHERS THEN NULL; END $$;

DELETE FROM public.meetings_calls;
DELETE FROM public.signals;
DO $$ BEGIN DELETE FROM public.research_queue; EXCEPTION WHEN undefined_table THEN NULL; END $$;

SELECT 'tasks_remaining' AS what, count(*)::int AS n FROM public.tasks
UNION ALL SELECT 'opportunities_remaining', count(*)::int FROM public.opportunities
UNION ALL SELECT 'meetings_remaining', count(*)::int FROM public.meetings_calls
UNION ALL SELECT 'signals_remaining', count(*)::int FROM public.signals
UNION ALL SELECT 'companies_kept', count(*)::int FROM public.companies
UNION ALL SELECT 'contacts_kept', count(*)::int FROM public.contacts;

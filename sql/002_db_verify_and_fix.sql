-- =============================================================================
-- HEXAGON B2B — DATABASE VERIFY + FIX (run once, safe to re-run)
-- Project: uigncohufvzhcgngwluj
-- https://supabase.com/dashboard/project/uigncohufvzhcgngwluj/sql/new
-- =============================================================================

-- 1) SEQUENCE GRANTS (fixes: permission denied for sequence task_code_seq)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO anon;

DO $$ BEGIN
  GRANT USAGE, SELECT ON SEQUENCE public.task_code_seq TO authenticated, anon;
EXCEPTION WHEN undefined_object THEN NULL; END $$;
DO $$ BEGIN
  GRANT USAGE, SELECT ON SEQUENCE public.opportunity_code_seq TO authenticated, anon;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- 2) COMPANY PROFILE COLUMNS
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS legal_name text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS hq_location text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS employee_count integer;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS board_no text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS gst_no text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS industry text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS notes text;

-- 3) QUOTATIONS + ITEMS + ACTIVITY
CREATE TABLE IF NOT EXISTS public.quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  quotation_no text,
  version int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'superseded')),
  validity_date date,
  delivery_tat text,
  payment_terms text,
  transport_terms text,
  special_terms text,
  revision_reason text,
  no_regret_price boolean NOT NULL DEFAULT false,
  total_value numeric,
  transfer_total numeric,
  margin_amount numeric,
  margin_pct numeric,
  currency text DEFAULT 'INR',
  notes text,
  state text NOT NULL DEFAULT 'active',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quotations_opportunity ON public.quotations(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_quotations_company ON public.quotations(company_id);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON public.quotations(status);

CREATE TABLE IF NOT EXISTS public.quotation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id uuid NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  specification text,
  brand text,
  model_part_no text,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric,
  line_total numeric,
  cost_price numeric,
  transfer_price numeric,
  customer_price numeric,
  margin_pct numeric,
  min_margin_pct numeric,
  line_type text DEFAULT 'product',
  parent_id text,
  billing text DEFAULT 'on_bill',
  charge_kind text,
  vendor text,
  sort_order int NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation ON public.quotation_items(quotation_id);

CREATE TABLE IF NOT EXISTS public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  summary text,
  payload jsonb DEFAULT '{}'::jsonb,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON public.activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON public.activity_log(created_at DESC);

ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY quotations_all ON public.quotations FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY quotation_items_all ON public.quotation_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY activity_log_all ON public.activity_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotation_items TO authenticated;
GRANT SELECT, INSERT ON public.activity_log TO authenticated;

CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON public.tasks(due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_company ON public.tasks(company_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON public.opportunities(stage);
CREATE INDEX IF NOT EXISTS idx_opportunities_company ON public.opportunities(company_id);
CREATE INDEX IF NOT EXISTS idx_contacts_company ON public.contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_meetings_company ON public.meetings_calls(company_id);
CREATE INDEX IF NOT EXISTS idx_signals_company ON public.signals(company_id);

SELECT 'done' AS status;

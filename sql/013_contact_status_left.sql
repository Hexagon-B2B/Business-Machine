-- 013: Allow contact_status = left (and inactive) for Move / former contacts
-- Fixes: new row for relation "contacts" violates check constraint "contacts_contact_status_check"
-- Safe to re-run.

-- Drop existing check if present
ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_contact_status_check;

-- Re-add with expanded values used by the app
-- active  = current employee / working contact
-- left    = left this company (former) — Move → "Left this company"
-- inactive = soft hold / do not contact (optional future use)
ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_contact_status_check
  CHECK (
    contact_status IS NULL
    OR contact_status IN ('active', 'left', 'inactive')
  );

-- Ensure metadata exists for history (previous company, left reason) — no-op if already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contacts' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE public.contacts ADD COLUMN metadata jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;

COMMENT ON CONSTRAINT contacts_contact_status_check ON public.contacts IS
  'active | left | inactive — left used when contact leaves or is marked former';

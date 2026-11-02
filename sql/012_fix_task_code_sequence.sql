-- Fix: duplicate key value violates unique constraint "tasks_task_code_uidx"
-- Cause: task_code_seq is behind existing task_code values (common after imports/resets).
-- Run once in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/uigncohufvzhcgngwluj/sql/new

-- 1) Grants (safe to re-run)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

-- 2) Align task_code_seq with the highest existing numeric suffix in task_code
DO $$
DECLARE
  seq_name text;
  max_n bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'task_code_seq' AND relkind = 'S') THEN
    seq_name := 'public.task_code_seq';
  ELSE
    SELECT pg_get_serial_sequence('public.tasks', 'task_code') INTO seq_name;
  END IF;

  IF seq_name IS NULL THEN
    RAISE NOTICE 'No task_code sequence found — check tasks.task_code default';
    RETURN;
  END IF;

  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(COALESCE(task_code::text, ''), '\D', '', 'g'), '')::bigint
  ), 0)
  INTO max_n
  FROM public.tasks
  WHERE task_code IS NOT NULL;

  IF max_n < 1 THEN
    max_n := 1;
  END IF;

  PERFORM setval(seq_name, max_n, true);
  RAISE NOTICE 'Set % to % (next task_code will be higher)', seq_name, max_n;
END $$;

-- 3) Verify
SELECT
  pg_get_serial_sequence('public.tasks', 'task_code') AS seq,
  (SELECT last_value FROM public.task_code_seq) AS last_value,
  (SELECT MAX(NULLIF(regexp_replace(COALESCE(task_code::text, ''), '\D', '', 'g'), '')::bigint) FROM public.tasks) AS max_code_num;

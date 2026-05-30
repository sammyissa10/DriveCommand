-- Rollback for Quick-416 — Remove deleted_at + deleted_by_id from public.dispatches.
--
-- WARNING: This rollback PERMANENTLY DROPS the two columns and any data they
-- contain. If any rows were soft-deleted (deleted_at IS NOT NULL) between the
-- forward migration and this rollback, that data will be lost. Verify with:
--   SELECT count(*) FROM public.dispatches WHERE deleted_at IS NOT NULL;
-- before running.
--
-- This file is NOT applied automatically — invoke manually via Supabase MCP if
-- a rollback is required.

BEGIN;

ALTER TABLE public.dispatches DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE public.dispatches DROP COLUMN IF EXISTS deleted_by_id;

COMMIT;

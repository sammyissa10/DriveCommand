-- Applied via Supabase MCP apply_migration on 2026-05-15.
-- Replaces the unique constraint (loadId, driverId) with a partial unique
-- index that only enforces uniqueness for live rows (deleted_at IS NULL),
-- so soft-deleted driver assignments do not block re-assigning the same
-- driver to the same load.

ALTER TABLE load_driver_assignments
  DROP CONSTRAINT lda_unique_load_driver;

CREATE UNIQUE INDEX load_driver_assignments_load_id_driver_id_active_unique
  ON load_driver_assignments (load_id, driver_id)
  WHERE deleted_at IS NULL;

-- Phase 8 Cleanup Gap 1 — partial unique on driver_settlements
-- Allows re-generation after a settlement is VOIDED or soft-deleted.
-- The original constraint `ds_unique_period` blocked re-generation because
-- VOIDED rows still occupied the (driver_id, period_start, period_end) slot.

-- Drop the legacy table constraint (idempotent)
ALTER TABLE driver_settlements
  DROP CONSTRAINT IF EXISTS ds_unique_period;

-- Drop any leftover index Prisma may have produced previously (idempotent)
DROP INDEX IF EXISTS driver_settlements_driver_id_period_start_period_end_key;

-- Create partial unique index — only enforces uniqueness for ACTIVE settlements
CREATE UNIQUE INDEX IF NOT EXISTS ds_unique_period_active
  ON driver_settlements (driver_id, period_start, period_end)
  WHERE deleted_at IS NULL
    AND status <> 'VOIDED';

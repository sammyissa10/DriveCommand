-- Phase 11: payroll export employment-type snapshot
ALTER TABLE driver_settlements
  ADD COLUMN employment_type_snapshot "EmploymentType";

-- Backfill existing FINALIZED and PAID rows from the DriverCompensationTemplate
-- effective at finalized_at (or created_at if finalized_at is null).
UPDATE driver_settlements ds
SET employment_type_snapshot = sub.employment_type
FROM (
  SELECT DISTINCT ON (ds2.id)
    ds2.id AS settlement_id,
    dct.employment_type
  FROM driver_settlements ds2
  JOIN driver_compensation_templates dct
    ON dct.driver_id = ds2.driver_id
   AND dct.tenant_id = ds2.tenant_id
   AND dct.effective_from <= COALESCE(ds2.finalized_at, ds2.created_at)
   AND (dct.effective_to IS NULL
        OR dct.effective_to >= COALESCE(ds2.finalized_at, ds2.created_at))
  WHERE ds2.status IN ('FINALIZED', 'PAID')
  ORDER BY ds2.id, dct.effective_from DESC
) sub
WHERE ds.id = sub.settlement_id
  AND ds.employment_type_snapshot IS NULL;

CREATE INDEX IF NOT EXISTS driver_settlements_employment_snapshot_idx
  ON driver_settlements(tenant_id, employment_type_snapshot)
  WHERE employment_type_snapshot IS NOT NULL;

-- Phase 11 hotfix (quick-311): retry backfill of employment_type_snapshot
-- Idempotent — only updates rows where snapshot is still NULL.
-- PAID rows are mutated ONLY in this snapshot column (immutability of pay math preserved).
-- Root cause of original backfill gap: missing `AND dct.deleted_at IS NULL` filter and
-- missing `AND ds2.deleted_at IS NULL` guard — cause (b): WHERE clause too narrow.

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
   AND dct.deleted_at IS NULL
  WHERE ds2.status IN ('FINALIZED', 'PAID')
    AND ds2.deleted_at IS NULL
    AND ds2.employment_type_snapshot IS NULL
  ORDER BY ds2.id, dct.effective_from DESC
) sub
WHERE ds.id = sub.settlement_id
  AND ds.employment_type_snapshot IS NULL
  AND ds.status IN ('FINALIZED', 'PAID')
  AND ds.deleted_at IS NULL;

-- Fallback for settlements whose template lookup failed via date range:
-- if any non-VOIDED, non-deleted settlement still has NULL snapshot AND the driver has
-- exactly ONE active compensation template (effective_to IS NULL), use that.
UPDATE driver_settlements ds
SET employment_type_snapshot = dct.employment_type
FROM driver_compensation_templates dct
WHERE ds.driver_id = dct.driver_id
  AND ds.tenant_id = dct.tenant_id
  AND dct.effective_to IS NULL
  AND dct.deleted_at IS NULL
  AND ds.employment_type_snapshot IS NULL
  AND ds.status IN ('FINALIZED', 'PAID')
  AND ds.deleted_at IS NULL
  AND (
    SELECT COUNT(*) FROM driver_compensation_templates dct2
    WHERE dct2.driver_id = ds.driver_id
      AND dct2.tenant_id = ds.tenant_id
      AND dct2.effective_to IS NULL
      AND dct2.deleted_at IS NULL
  ) = 1;

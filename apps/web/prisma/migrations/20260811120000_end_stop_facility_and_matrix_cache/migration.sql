-- ADDITIVE ONLY. The two objects Phase 7 reported as gaps (07-SUMMARY.md):
--
--   1. `route_templates.end_stop_facility_id` — so a route template can express
--      spec Section 9's `DESIGNATED_PARKING` at the TEMPLATE rung instead of
--      degrading to a per-trip choice.
--   2. `route_matrix_cache` — so the optimiser's distance matrix survives a
--      deploy and a cold start, which is what makes Section 9's "optimise once,
--      reuse daily" true across more than one process.
--
-- Both were already applied to production via Supabase MCP before this file was
-- written, and are marked applied with `prisma migrate resolve --applied` rather
-- than replayed, per DEC-3 rules 1 and 4 — there is no non-production database to
-- replay them against. Idempotent regardless, and the body below mirrors exactly
-- what is live (columns, constraint names and index names read back from
-- `information_schema` and `pg_constraint`, not inferred).
--
-- Known and NOT addressed here, deliberately: `route_matrix_cache` has RLS
-- disabled and no `app_user` grant, consistent with the incomplete RLS Phase 2
-- cutover. Granting it is that cutover's work, not this migration's.
ALTER TABLE route_templates ADD COLUMN IF NOT EXISTS end_stop_facility_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'route_templates_end_stop_facility_id_fkey') THEN
    ALTER TABLE route_templates
      ADD CONSTRAINT route_templates_end_stop_facility_id_fkey
      FOREIGN KEY (end_stop_facility_id) REFERENCES facilities(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS route_matrix_cache (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL,
  facility_key TEXT NOT NULL,
  miles        JSONB NOT NULL,
  minutes      JSONB NOT NULL,
  computed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS route_matrix_cache_org_key_unique ON route_matrix_cache (org_id, facility_key);
CREATE INDEX IF NOT EXISTS route_matrix_cache_org_idx ON route_matrix_cache (org_id);

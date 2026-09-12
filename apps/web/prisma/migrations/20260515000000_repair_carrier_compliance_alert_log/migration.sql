-- REPAIR MIGRATION (quick-593, repair 3)
--
-- Missing object: table "carrier_compliance_alert_log" (whole table)
--
-- Why it was missing: no migration in this repository creates it. Only two
-- reference it, and both only ALTER it:
--   20260515000001_db_security_standardization  (RLS, grants, audit columns)
--   20260527000001_quick410_advisor_rls_fix     (RLS)
-- The table was created in production out of band. 20260515000001 therefore
-- succeeds there and fails on any database rebuilt from this repository with
--   relation "carrier_compliance_alert_log" does not exist
--
-- How production's definition was established: read from production
-- (project oqdhberkghtnszrkdvfm), read-only, on 2026-09-12.
--
--   information_schema.columns (all 7, in ordinal order):
--     1 id         uuid        NOT NULL  DEFAULT gen_random_uuid()
--     2 org_id     uuid        NOT NULL  (no default)
--     3 alert_type text        NOT NULL  (no default)
--     4 entity_id  text        NOT NULL  (no default)
--     5 message    text        NOT NULL  (no default)
--     6 severity   text        NOT NULL  (no default)
--     7 created_at timestamptz NULL      DEFAULT now()
--
--   pg_constraint: exactly one constraint, carrier_compliance_alert_log_pkey
--     PRIMARY KEY (id). No foreign key on org_id. No CHECK constraints.
--
--   pg_indexes: four, of which two are created by no migration and are
--   therefore reproduced here:
--     idx_compliance_log_created  btree (created_at)
--     idx_compliance_log_org      btree (org_id)
--   The other two are the primary key's index and
--   idx_carrier_compliance_alert_log_org_id, which the chain creates itself.
--
-- KNOWN DIVERGENCE, recorded rather than silently reconciled:
-- 20260515000001 adds created_by, updated_by, deleted_at and deleted_by to this
-- table, and its production ledger row shows it DID run (applied_steps_count=1,
-- non-empty logs, non-zero duration) -- yet production has only the 7 columns
-- above. So production's table is missing four columns its own applied
-- migration should have added, most likely because the table was dropped and
-- recreated out of band after that migration ran. This repair deliberately
-- creates the 7 columns production actually has, not the 11 the chain implies,
-- because the instruction is to match production's real definition. The chain
-- will then add the other four to staging, and the resulting difference is
-- reported in docs/audits/migration-chain-repair.md rather than papered over.
--
-- No-op against production: the table already exists there, so
-- CREATE TABLE IF NOT EXISTS does nothing, and both indexes already exist, so
-- CREATE INDEX IF NOT EXISTS does nothing.

CREATE TABLE IF NOT EXISTS "carrier_compliance_alert_log" (
  "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
  "org_id"     UUID        NOT NULL,
  "alert_type" TEXT        NOT NULL,
  "entity_id"  TEXT        NOT NULL,
  "message"    TEXT        NOT NULL,
  "severity"   TEXT        NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT "carrier_compliance_alert_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS idx_compliance_log_created
  ON "carrier_compliance_alert_log"("created_at");
CREATE INDEX IF NOT EXISTS idx_compliance_log_org
  ON "carrier_compliance_alert_log"("org_id");

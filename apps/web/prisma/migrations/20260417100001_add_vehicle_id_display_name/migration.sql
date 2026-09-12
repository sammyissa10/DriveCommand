-- Add vehicle_id and display_name to carrier_trucks
--
-- ============================================================================
-- EDITED 2026-09-11 (quick-593). This is an existing migration file, which is
-- normally never edited. The exemption was granted for THIS FILE ONLY.
--
-- WHY: the UPDATE below used a window function, ROW_NUMBER() OVER (...), inside
-- an UPDATE ... SET. PostgreSQL rejects that at parse-analysis, independent of
-- data or schema:
--
--     ERROR: window functions are not allowed in UPDATE
--
-- So this file has never been executable, and no forward migration could repair
-- it: the error is raised before any data is touched, so no amount of
-- pre-created schema changes the outcome. It blocked a replay of the chain from
-- zero at migration 63 of 141.
--
-- WHY THE EDIT CANNOT AFFECT PRODUCTION: this file has never executed against
-- production. Its production ledger row is a resolved-not-run marker, quoted
-- here in full from public._prisma_migrations on project oqdhberkghtnszrkdvfm,
-- read read-only on 2026-09-12:
--
--     id                  : 386d3de8-8366-4d8b-9220-718b9f95c2f2
--     migration_name      : 20260417100001_add_vehicle_id_display_name
--     checksum            : e533292ebf01dff720f70892f4780cc96eb01867b9224b2c22e173c76838ccee
--     applied_steps_count : 0
--     logs                : ''            (empty string)
--     rolled_back_at      : NULL
--     started_at          : 2026-04-19 18:14:30.170903+00
--     finished_at         : 2026-04-19 18:14:30.170903+00
--     duration            : 00:00:00
--
-- applied_steps_count = 0, empty logs and a zero duration are the signature of
-- a hand-mirrored resolved-not-run row (DEC-17). Rows that scripts/migrate.mjs
-- actually executed carry applied_steps_count = 1 and the literal checksum
-- 'manual'; this one carries a real SHA-256, which is the mirrored form.
--
-- Production already holds both columns, added by a different route: the
-- Supabase ledger records 20260418184001_add_vehicle_id_display_name_to_carrier_trucks,
-- applied through the MCP path with different SQL. Production state as read on
-- 2026-09-12: vehicle_id character varying(50) NOT NULL; display_name character
-- varying(200) nullable. Re-running this file against production would find
-- both ADD COLUMN lines already satisfied and the UPDATE matching zero rows.
--
-- WHAT CHANGED: only the UPDATE's window function, replaced by an equivalent
-- correlated subquery. The two guarded ADD COLUMN lines, the second UPDATE, the
-- SET NOT NULL and the unique index are untouched, unformatted and unmodernised.
-- The subquery orders on ("created_at", "id") rather than "created_at" alone
-- because COUNT(*) assigns equal ranks to ties, which would produce duplicate
-- vehicle_id values and fail the unique index created at the end of this file;
-- ROW_NUMBER() broke such ties arbitrarily. "id" is the uuid primary key, so the
-- pair is a strict total order.
-- ============================================================================

ALTER TABLE "carrier_trucks" ADD COLUMN IF NOT EXISTS "vehicle_id" VARCHAR(50);
ALTER TABLE "carrier_trucks" ADD COLUMN IF NOT EXISTS "display_name" VARCHAR(200);

-- Backfill vehicle_id for existing rows: VH-YYYY-NNNNN where YYYY = current year
UPDATE "carrier_trucks" AS t
SET "vehicle_id" = 'VH-' || EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || '-' || LPAD((
  SELECT COUNT(*)
  FROM "carrier_trucks" AS t2
  WHERE t2."vehicle_id" IS NULL
    AND (t2."created_at", t2."id") <= (t."created_at", t."id")
)::TEXT, 5, '0')
WHERE t."vehicle_id" IS NULL;

-- Backfill display_name from unit_number
UPDATE "carrier_trucks"
SET "display_name" = "unit_number"
WHERE "display_name" IS NULL;

-- Now make vehicle_id NOT NULL and add unique constraint
ALTER TABLE "carrier_trucks" ALTER COLUMN "vehicle_id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "carrier_trucks_vehicle_id_key" ON "carrier_trucks"("vehicle_id");

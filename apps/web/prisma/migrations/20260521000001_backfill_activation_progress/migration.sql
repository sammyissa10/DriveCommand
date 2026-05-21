-- TKT-0040 backfill: create ActivationProgress rows for every tenant that
-- was provisioned before migration 20260429000001 (which added the seeding
-- logic in provision-tenant.ts).  Also fills in NULL milestone columns on
-- rows that already exist but were never stamped.
--
-- IDEMPOTENT — safe to re-run:
--   • INSERT uses WHERE ap.id IS NULL  (skips tenants that already have a row)
--   • UPDATE uses COALESCE(ap.col, computed) (never overwrites a non-NULL value)
--
-- Milestone proxy strategy:
--   firstRealTruckAt   — MIN across "Truck".createdAt (isSample=false) and
--                        carrier_trucks.created_at (is_sample=false), per-tenant
--   firstRealDriverAt  — MIN across "User".createdAt (role=DRIVER, isSample=false) and
--                        carrier_drivers.created_at (is_sample=false), per-tenant
--   firstRealClientAt  — MIN across "Customer".createdAt (isSample=false) and
--                        clients.created_at (is_sample=false), per-tenant
--                        (clients.is_sample column was added in migration 20260501000002)
--   firstLoadInTransitAt — MIN("Load".updatedAt) WHERE status='IN_TRANSIT' AND
--                          isSample=false.  Load.updatedAt is the best available proxy
--                          for when the status transition occurred — no dedicated
--                          transitioned_at column exists in the schema.
--
-- completionPct formula mirrors activation-tracker.ts:
--   20 * (1 + truck_done + driver_done + client_done + transit_done)
-- isActivated = completionPct = 100
--
-- NOTE: PostgreSQL CTEs are scoped to a single statement.  The two DML
-- operations below (INSERT + UPDATE) each carry their own WITH clause.

-- ─────────────────────────────────────────────────────────────
-- STEP A: Insert rows for tenants that have no ActivationProgress yet
-- ─────────────────────────────────────────────────────────────
WITH tenant_milestones AS (
  SELECT
    t.id                                                        AS tenant_id,
    t."createdAt"                                               AS account_created_at,

    -- firstRealTruckAt
    (
      SELECT MIN(d)
      FROM (
        SELECT MIN(tr."createdAt") AS d
        FROM "Truck" tr
        WHERE tr."tenantId" = t.id AND tr."isSample" = false
        UNION ALL
        SELECT MIN(ct.created_at) AS d
        FROM carrier_trucks ct
        WHERE ct.org_id = t.id AND ct.is_sample = false
      ) u
    )                                                           AS first_truck,

    -- firstRealDriverAt
    (
      SELECT MIN(d)
      FROM (
        SELECT MIN(u2."createdAt") AS d
        FROM "User" u2
        WHERE u2."tenantId" = t.id AND u2.role = 'DRIVER' AND u2."isSample" = false
        UNION ALL
        SELECT MIN(cd.created_at) AS d
        FROM carrier_drivers cd
        WHERE cd.org_id = t.id AND cd.is_sample = false
      ) u
    )                                                           AS first_driver,

    -- firstRealClientAt
    (
      SELECT MIN(d)
      FROM (
        SELECT MIN(cu."createdAt") AS d
        FROM "Customer" cu
        WHERE cu."tenantId" = t.id AND cu."isSample" = false
        UNION ALL
        SELECT MIN(cl.created_at) AS d
        FROM clients cl
        WHERE cl.org_id = t.id AND cl.is_sample = false
      ) u
    )                                                           AS first_client,

    -- firstLoadInTransitAt (updatedAt = best proxy for transition time)
    (
      SELECT MIN(l."updatedAt")
      FROM "Load" l
      WHERE l."tenantId" = t.id AND l.status = 'IN_TRANSIT' AND l."isSample" = false
    )                                                           AS first_transit

  FROM "Tenant" t
),
computed AS (
  SELECT
    tm.*,
    20 * (
      1
      + CASE WHEN tm.first_truck   IS NOT NULL THEN 1 ELSE 0 END
      + CASE WHEN tm.first_driver  IS NOT NULL THEN 1 ELSE 0 END
      + CASE WHEN tm.first_client  IS NOT NULL THEN 1 ELSE 0 END
      + CASE WHEN tm.first_transit IS NOT NULL THEN 1 ELSE 0 END
    ) AS completion_pct
  FROM tenant_milestones tm
)
INSERT INTO "ActivationProgress" (
  id,
  "tenantId",
  "accountCreatedAt",
  "firstRealTruckAt",
  "firstRealDriverAt",
  "firstRealClientAt",
  "firstLoadInTransitAt",
  "completionPct",
  "isActivated",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  c.tenant_id,
  c.account_created_at,
  c.first_truck,
  c.first_driver,
  c.first_client,
  c.first_transit,
  c.completion_pct,
  (c.completion_pct = 100),
  NOW(),
  NOW()
FROM computed c
LEFT JOIN "ActivationProgress" ap ON ap."tenantId" = c.tenant_id
WHERE ap.id IS NULL;

-- ─────────────────────────────────────────────────────────────
-- STEP B: Fill NULL milestone columns on rows that already exist
-- COALESCE ensures non-NULL values are NEVER overwritten
-- ─────────────────────────────────────────────────────────────
WITH tenant_milestones AS (
  SELECT
    t.id                                                        AS tenant_id,

    -- firstRealTruckAt
    (
      SELECT MIN(d)
      FROM (
        SELECT MIN(tr."createdAt") AS d
        FROM "Truck" tr
        WHERE tr."tenantId" = t.id AND tr."isSample" = false
        UNION ALL
        SELECT MIN(ct.created_at) AS d
        FROM carrier_trucks ct
        WHERE ct.org_id = t.id AND ct.is_sample = false
      ) u
    )                                                           AS first_truck,

    -- firstRealDriverAt
    (
      SELECT MIN(d)
      FROM (
        SELECT MIN(u2."createdAt") AS d
        FROM "User" u2
        WHERE u2."tenantId" = t.id AND u2.role = 'DRIVER' AND u2."isSample" = false
        UNION ALL
        SELECT MIN(cd.created_at) AS d
        FROM carrier_drivers cd
        WHERE cd.org_id = t.id AND cd.is_sample = false
      ) u
    )                                                           AS first_driver,

    -- firstRealClientAt
    (
      SELECT MIN(d)
      FROM (
        SELECT MIN(cu."createdAt") AS d
        FROM "Customer" cu
        WHERE cu."tenantId" = t.id AND cu."isSample" = false
        UNION ALL
        SELECT MIN(cl.created_at) AS d
        FROM clients cl
        WHERE cl.org_id = t.id AND cl.is_sample = false
      ) u
    )                                                           AS first_client,

    -- firstLoadInTransitAt
    (
      SELECT MIN(l."updatedAt")
      FROM "Load" l
      WHERE l."tenantId" = t.id AND l.status = 'IN_TRANSIT' AND l."isSample" = false
    )                                                           AS first_transit

  FROM "Tenant" t
)
UPDATE "ActivationProgress" ap
SET
  "firstRealTruckAt"     = COALESCE(ap."firstRealTruckAt",     tm.first_truck),
  "firstRealDriverAt"    = COALESCE(ap."firstRealDriverAt",    tm.first_driver),
  "firstRealClientAt"    = COALESCE(ap."firstRealClientAt",    tm.first_client),
  "firstLoadInTransitAt" = COALESCE(ap."firstLoadInTransitAt", tm.first_transit),
  "completionPct"        = 20 * (
                             1
                             + CASE WHEN COALESCE(ap."firstRealTruckAt",     tm.first_truck)   IS NOT NULL THEN 1 ELSE 0 END
                             + CASE WHEN COALESCE(ap."firstRealDriverAt",    tm.first_driver)  IS NOT NULL THEN 1 ELSE 0 END
                             + CASE WHEN COALESCE(ap."firstRealClientAt",    tm.first_client)  IS NOT NULL THEN 1 ELSE 0 END
                             + CASE WHEN COALESCE(ap."firstLoadInTransitAt", tm.first_transit) IS NOT NULL THEN 1 ELSE 0 END
                           ),
  "isActivated"          = (
                             20 * (
                               1
                               + CASE WHEN COALESCE(ap."firstRealTruckAt",     tm.first_truck)   IS NOT NULL THEN 1 ELSE 0 END
                               + CASE WHEN COALESCE(ap."firstRealDriverAt",    tm.first_driver)  IS NOT NULL THEN 1 ELSE 0 END
                               + CASE WHEN COALESCE(ap."firstRealClientAt",    tm.first_client)  IS NOT NULL THEN 1 ELSE 0 END
                               + CASE WHEN COALESCE(ap."firstLoadInTransitAt", tm.first_transit) IS NOT NULL THEN 1 ELSE 0 END
                             ) = 100
                           ) OR ap."isActivated",
  "updatedAt"            = NOW()
FROM tenant_milestones tm
WHERE ap."tenantId" = tm.tenant_id;

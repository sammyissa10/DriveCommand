-- ============================================================
-- Migration: 20260429000001_tenant_self_onboarding
--
-- Purpose: Phase 47 — Tenant Self-Onboarding Foundation
--   Adds 6 new enums, extends Tenant table with 6 new columns
--   (backfilling slug NOT NULL), adds isSample to 4 domain tables,
--   creates 9 new tables (Plan, Promo, Subscription, ActivationProgress,
--   AutomationRule, AutomationRun, AppEvent, TenantMetricsDaily,
--   TenantHealthScore), all indexes, FK constraints, and RLS policies.
--
-- NOTE: Do NOT wrap in BEGIN/COMMIT — migrate.mjs wraps each migration
--       in its own transaction.
-- NOTE: All statements are idempotent (IF NOT EXISTS / DO-EXCEPTION blocks)
-- ============================================================


-- ============================================================
-- SECTION 1: ENUMS
-- ============================================================

DO $$ BEGIN
  CREATE TYPE "FleetSizeBucket" AS ENUM ('OWNER_OPERATOR', 'SMALL', 'MEDIUM', 'LARGE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TenantStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ProvisioningPhase" AS ENUM ('MINIMAL', 'HYDRATED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AutomationScope" AS ENUM ('SYSTEM', 'TENANT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AutomationRunStatus" AS ENUM ('FIRED', 'SKIPPED_CONDITION', 'SKIPPED_ALREADY_RAN', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- SECTION 2: EXTEND TENANT TABLE
-- ============================================================

-- Backfill NULL slugs before setting NOT NULL (slug already exists as nullable)
UPDATE "Tenant" SET "slug" = gen_random_uuid()::text WHERE "slug" IS NULL;
ALTER TABLE "Tenant" ALTER COLUMN "slug" SET NOT NULL;

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "fleetSizeBucket" "FleetSizeBucket" NOT NULL DEFAULT 'OWNER_OPERATOR';
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "manualTrial" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "emailConfirmedAt" TIMESTAMPTZ;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "sampleDataSeeded" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "provisioningPhase" "ProvisioningPhase" NOT NULL DEFAULT 'MINIMAL';


-- ============================================================
-- SECTION 3: ADD isSample TO DOMAIN TABLES
-- ============================================================

ALTER TABLE "Truck" ADD COLUMN IF NOT EXISTS "isSample" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isSample" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "isSample" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "Load" ADD COLUMN IF NOT EXISTS "isSample" BOOLEAN NOT NULL DEFAULT FALSE;


-- ============================================================
-- SECTION 4: NEW TABLE — Plan
-- ============================================================

CREATE TABLE IF NOT EXISTS "Plan" (
    "id"                  UUID          NOT NULL DEFAULT gen_random_uuid(),
    "key"                 TEXT          NOT NULL,
    "name"                TEXT          NOT NULL,
    "description"         TEXT,
    "defaultTrialDays"    INTEGER       NOT NULL DEFAULT 14,
    "monthlyPriceCents"   INTEGER       NOT NULL,
    "yearlyPriceCents"    INTEGER,
    "maxTrucks"           INTEGER,
    "maxUsers"            INTEGER,
    "storageGbLimit"      INTEGER,
    "isActive"            BOOLEAN       NOT NULL DEFAULT TRUE,
    "sortOrder"           INTEGER       NOT NULL DEFAULT 0,
    "stripeProductId"     TEXT,
    "createdAt"           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    "updatedAt"           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Plan_key_key" ON "Plan"("key");
CREATE INDEX IF NOT EXISTS "Plan_isActive_idx" ON "Plan"("isActive");


-- ============================================================
-- SECTION 5: NEW TABLE — Promo
-- ============================================================

CREATE TABLE IF NOT EXISTS "Promo" (
    "id"                UUID        NOT NULL DEFAULT gen_random_uuid(),
    "code"              TEXT        NOT NULL,
    "description"       TEXT,
    "bonusTrialDays"    INTEGER     NOT NULL DEFAULT 0,
    "discountPct"       INTEGER,
    "activeFrom"        TIMESTAMPTZ NOT NULL,
    "activeTo"          TIMESTAMPTZ NOT NULL,
    "maxRedemptions"    INTEGER,
    "redemptionCount"   INTEGER     NOT NULL DEFAULT 0,
    "isActive"          BOOLEAN     NOT NULL DEFAULT TRUE,
    "stripeCouponId"    TEXT,
    "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "Promo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Promo_code_key" ON "Promo"("code");
CREATE INDEX IF NOT EXISTS "Promo_isActive_idx" ON "Promo"("isActive");


-- ============================================================
-- SECTION 6: NEW TABLE — Subscription
-- ============================================================

CREATE TABLE IF NOT EXISTS "Subscription" (
    "id"                        UUID                NOT NULL DEFAULT gen_random_uuid(),
    "tenantId"                  UUID                NOT NULL,
    "planId"                    UUID                NOT NULL,
    "promoId"                   UUID,
    "status"                    "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "trialEndsAt"               TIMESTAMPTZ         NOT NULL,
    "manualExtensionUntil"      TIMESTAMPTZ,
    "currentPeriodStart"        TIMESTAMPTZ,
    "currentPeriodEnd"          TIMESTAMPTZ,
    "stripeCustomerId"          TEXT,
    "stripeSubscriptionId"      TEXT,
    "cancelAtPeriodEnd"         BOOLEAN             NOT NULL DEFAULT FALSE,
    "createdAt"                 TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    "updatedAt"                 TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_tenantId_key" ON "Subscription"("tenantId");
CREATE INDEX IF NOT EXISTS "Subscription_tenantId_idx" ON "Subscription"("tenantId");
CREATE INDEX IF NOT EXISTS "Subscription_status_idx" ON "Subscription"("status");
CREATE INDEX IF NOT EXISTS "Subscription_trialEndsAt_idx" ON "Subscription"("trialEndsAt");

DO $$ BEGIN
  ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_promoId_fkey"
    FOREIGN KEY ("promoId") REFERENCES "Promo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- SECTION 7: NEW TABLE — ActivationProgress
-- ============================================================

CREATE TABLE IF NOT EXISTS "ActivationProgress" (
    "id"                        UUID        NOT NULL DEFAULT gen_random_uuid(),
    "tenantId"                  UUID        NOT NULL,
    "accountCreatedAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "firstRealTruckAt"          TIMESTAMPTZ,
    "firstRealDriverAt"         TIMESTAMPTZ,
    "firstRealClientAt"         TIMESTAMPTZ,
    "firstRealLoadCreatedAt"    TIMESTAMPTZ,
    "firstLoadInTransitAt"      TIMESTAMPTZ,
    "firstLoadDeliveredAt"      TIMESTAMPTZ,
    "completionPct"             INTEGER     NOT NULL DEFAULT 20,
    "isActivated"               BOOLEAN     NOT NULL DEFAULT FALSE,
    "createdAt"                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "ActivationProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ActivationProgress_tenantId_key" ON "ActivationProgress"("tenantId");
CREATE INDEX IF NOT EXISTS "ActivationProgress_tenantId_idx" ON "ActivationProgress"("tenantId");
CREATE INDEX IF NOT EXISTS "ActivationProgress_isActivated_idx" ON "ActivationProgress"("isActivated");

DO $$ BEGIN
  ALTER TABLE "ActivationProgress" ADD CONSTRAINT "ActivationProgress_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- SECTION 8: NEW TABLE — AutomationRule
-- ============================================================

CREATE TABLE IF NOT EXISTS "AutomationRule" (
    "id"                UUID                NOT NULL DEFAULT gen_random_uuid(),
    "key"               TEXT                NOT NULL,
    "name"              TEXT                NOT NULL,
    "description"       TEXT,
    "triggerEvent"      TEXT                NOT NULL,
    "conditionsJson"    JSONB               NOT NULL DEFAULT '{}',
    "actionsJson"       JSONB               NOT NULL,
    "scope"             "AutomationScope"   NOT NULL DEFAULT 'SYSTEM',
    "tenantId"          UUID,
    "isActive"          BOOLEAN             NOT NULL DEFAULT TRUE,
    "runOncePerTenant"  BOOLEAN             NOT NULL DEFAULT TRUE,
    "createdAt"         TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    "updatedAt"         TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AutomationRule_key_key" ON "AutomationRule"("key");
CREATE INDEX IF NOT EXISTS "AutomationRule_triggerEvent_isActive_idx" ON "AutomationRule"("triggerEvent", "isActive");
CREATE INDEX IF NOT EXISTS "AutomationRule_tenantId_idx" ON "AutomationRule"("tenantId");

DO $$ BEGIN
  ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- SECTION 9: NEW TABLE — AutomationRun
-- ============================================================

CREATE TABLE IF NOT EXISTS "AutomationRun" (
    "id"            UUID                    NOT NULL DEFAULT gen_random_uuid(),
    "ruleId"        UUID,
    "tenantId"      UUID                    NOT NULL,
    "userId"        UUID,
    "triggeredBy"   TEXT                    NOT NULL,
    "status"        "AutomationRunStatus"   NOT NULL,
    "resultJson"    JSONB,
    "firedAt"       TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AutomationRun_ruleId_idx" ON "AutomationRun"("ruleId");
CREATE INDEX IF NOT EXISTS "AutomationRun_tenantId_idx" ON "AutomationRun"("tenantId");
CREATE INDEX IF NOT EXISTS "AutomationRun_firedAt_idx" ON "AutomationRun"("firedAt");

DO $$ BEGIN
  ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_ruleId_fkey"
    FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- SECTION 10: NEW TABLE — AppEvent
-- ============================================================

CREATE TABLE IF NOT EXISTS "AppEvent" (
    "id"            UUID        NOT NULL DEFAULT gen_random_uuid(),
    "tenantId"      UUID        NOT NULL,
    "userId"        UUID,
    "eventType"     TEXT        NOT NULL,
    "properties"    JSONB       NOT NULL DEFAULT '{}',
    "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "AppEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AppEvent_tenantId_createdAt_idx" ON "AppEvent"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "AppEvent_eventType_createdAt_idx" ON "AppEvent"("eventType", "createdAt");
CREATE INDEX IF NOT EXISTS "AppEvent_userId_createdAt_idx" ON "AppEvent"("userId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "AppEvent" ADD CONSTRAINT "AppEvent_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- SECTION 11: NEW TABLE — TenantMetricsDaily
-- ============================================================

CREATE TABLE IF NOT EXISTS "TenantMetricsDaily" (
    "id"                UUID        NOT NULL DEFAULT gen_random_uuid(),
    "tenantId"          UUID        NOT NULL,
    "date"              DATE        NOT NULL,
    "dauCount"          INTEGER     NOT NULL DEFAULT 0,
    "sessionCount"      INTEGER     NOT NULL DEFAULT 0,
    "keyActionCount"    INTEGER     NOT NULL DEFAULT 0,
    "storageBytes"      BIGINT      NOT NULL DEFAULT 0,
    "seatsUsed"         INTEGER     NOT NULL DEFAULT 0,
    "loadsCreated"      INTEGER     NOT NULL DEFAULT 0,
    "loadsInTransit"    INTEGER     NOT NULL DEFAULT 0,
    CONSTRAINT "TenantMetricsDaily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TenantMetricsDaily_tenantId_date_key" ON "TenantMetricsDaily"("tenantId", "date");
CREATE INDEX IF NOT EXISTS "TenantMetricsDaily_tenantId_idx" ON "TenantMetricsDaily"("tenantId");
CREATE INDEX IF NOT EXISTS "TenantMetricsDaily_date_idx" ON "TenantMetricsDaily"("date");

DO $$ BEGIN
  ALTER TABLE "TenantMetricsDaily" ADD CONSTRAINT "TenantMetricsDaily_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- SECTION 12: NEW TABLE — TenantHealthScore
-- ============================================================

CREATE TABLE IF NOT EXISTS "TenantHealthScore" (
    "id"                UUID        NOT NULL DEFAULT gen_random_uuid(),
    "tenantId"          UUID        NOT NULL,
    "score"             INTEGER     NOT NULL,
    "topFactorsJson"    JSONB       NOT NULL,
    "computedAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "TenantHealthScore_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TenantHealthScore_tenantId_key" ON "TenantHealthScore"("tenantId");
CREATE INDEX IF NOT EXISTS "TenantHealthScore_score_idx" ON "TenantHealthScore"("score");

DO $$ BEGIN
  ALTER TABLE "TenantHealthScore" ADD CONSTRAINT "TenantHealthScore_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- SECTION 13: RLS POLICIES
-- ============================================================

-- Subscription (tenant-scoped — both policies)
ALTER TABLE "Subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subscription" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation_policy ON "Subscription"
    FOR ALL
    USING ("tenantId" = current_tenant_id())
    WITH CHECK ("tenantId" = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY bypass_rls_policy ON "Subscription"
    FOR ALL
    USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ActivationProgress (tenant-scoped — both policies)
ALTER TABLE "ActivationProgress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ActivationProgress" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation_policy ON "ActivationProgress"
    FOR ALL
    USING ("tenantId" = current_tenant_id())
    WITH CHECK ("tenantId" = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY bypass_rls_policy ON "ActivationProgress"
    FOR ALL
    USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AutomationRule (partial policy — SYSTEM scope bypasses tenant check)
ALTER TABLE "AutomationRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationRule" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation_policy ON "AutomationRule"
    FOR ALL
    USING (scope = 'SYSTEM' OR "tenantId" = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY bypass_rls_policy ON "AutomationRule"
    FOR ALL
    USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AutomationRun (tenant-scoped — both policies)
ALTER TABLE "AutomationRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationRun" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation_policy ON "AutomationRun"
    FOR ALL
    USING ("tenantId" = current_tenant_id())
    WITH CHECK ("tenantId" = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY bypass_rls_policy ON "AutomationRun"
    FOR ALL
    USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AppEvent (tenant-scoped — both policies)
ALTER TABLE "AppEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AppEvent" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation_policy ON "AppEvent"
    FOR ALL
    USING ("tenantId" = current_tenant_id())
    WITH CHECK ("tenantId" = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY bypass_rls_policy ON "AppEvent"
    FOR ALL
    USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- TenantMetricsDaily (tenant-scoped — both policies)
ALTER TABLE "TenantMetricsDaily" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantMetricsDaily" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation_policy ON "TenantMetricsDaily"
    FOR ALL
    USING ("tenantId" = current_tenant_id())
    WITH CHECK ("tenantId" = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY bypass_rls_policy ON "TenantMetricsDaily"
    FOR ALL
    USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- TenantHealthScore (tenant-scoped — both policies)
ALTER TABLE "TenantHealthScore" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantHealthScore" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation_policy ON "TenantHealthScore"
    FOR ALL
    USING ("tenantId" = current_tenant_id())
    WITH CHECK ("tenantId" = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY bypass_rls_policy ON "TenantHealthScore"
    FOR ALL
    USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Plan and Promo: NO RLS (platform-level, readable by all tenants, written only by SysAdmin)

-- =============================================================================
-- Migration: Driver Pay Phase 1
-- Implements DriverPay_TechnicalSpec_v4.md — Sections 4 (field additions),
-- 5 (new models), and 7 (Row Level Security).
--
-- New tables (9):
--   driver_compensation_templates, driver_settlements,
--   load_driver_assignments, load_pay_components,
--   driver_bonuses, driver_deductions, pay_component_attachments,
--   driver_disputes, driver_pay_audit_logs
--
-- Altered tables (3):
--   stops    — free_time_minutes, work_state
--   contracts — default_free_time_minutes
--   loads    — total_miles, loaded_miles, mileage_source
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS btree_gist;


-- ---------------------------------------------------------------------------
-- 1. New enum types (idempotent via EXCEPTION block)
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "EmploymentType" AS ENUM ('W2_EMPLOYEE', 'OWNER_OPERATOR_1099', 'LEASE_OPERATOR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DriverPayType" AS ENUM ('CPM', 'HOURLY', 'FLAT_PER_LOAD', 'PERCENTAGE', 'DAILY', 'SALARY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RateUnit" AS ENUM ('PER_MILE', 'PER_HOUR', 'PER_LOAD', 'PERCENTAGE', 'PER_DAY', 'ANNUAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DriverRole" AS ENUM ('MAIN_DRIVER', 'CO_DRIVER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MileageSource" AS ENUM ('PCMILER', 'GOOGLE', 'ELD', 'MANUAL', 'RAND_MCNALLY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DriverAssignmentStatus" AS ENUM (
    'DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PAID', 'DISPUTED', 'CORRECTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PayComponentType" AS ENUM (
    'BASE_PAY_MILEAGE', 'BASE_PAY_HOURLY', 'BASE_PAY_FLAT',
    'BASE_PAY_PERCENTAGE', 'BASE_PAY_DAILY',
    'FUEL_SURCHARGE', 'OVERTIME', 'HAZMAT_PREMIUM', 'HOLIDAY_PREMIUM',
    'LOAD_COMPLETION_BONUS', 'FUEL_EFFICIENCY_BONUS',
    'DETENTION', 'LAYOVER', 'TONU', 'STOP_OFF', 'TARP', 'BREAKDOWN',
    'PER_DIEM', 'LUMPER_REIMBURSEMENT', 'SCALE_REIMBURSEMENT', 'FUEL_REIMBURSEMENT',
    'ADVANCE_REPAYMENT', 'ESCROW_CONTRIBUTION', 'FUEL_CARD_DEBT',
    'CARGO_CLAIM', 'EQUIPMENT_DAMAGE', 'GARNISHMENT', 'CHILD_SUPPORT',
    'ADJUSTMENT_POSITIVE', 'ADJUSTMENT_NEGATIVE'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PayComponentCategory" AS ENUM (
    'EARNING', 'BONUS', 'ACCESSORIAL', 'ALLOWANCE',
    'REIMBURSEMENT', 'DEDUCTION', 'ADJUSTMENT'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PayComponentUnit" AS ENUM (
    'MILES', 'HOURS', 'STOPS', 'DAYS', 'FLAT', 'PERCENTAGE'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BonusType" AS ENUM (
    'SIGN_ON', 'RETENTION', 'SAFETY', 'FUEL_EFFICIENCY', 'REFERRAL', 'PERFORMANCE', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DeductionType" AS ENUM (
    'ADVANCE', 'ESCROW', 'GARNISHMENT', 'CHILD_SUPPORT',
    'EQUIPMENT_LEASE', 'INSURANCE', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DeductionSchedule" AS ENUM (
    'ONE_TIME', 'EVERY_SETTLEMENT', 'FIXED_INSTALLMENTS'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DriverSettlementStatus" AS ENUM ('DRAFT', 'FINALIZED', 'PAID', 'VOIDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DisputeTargetType" AS ENUM ('LOAD_PAY', 'SETTLEMENT', 'COMPONENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DisputeIssueCategory" AS ENUM (
    'WRONG_AMOUNT', 'MISSING_PAY', 'WRONG_MILES', 'MISSING_RECEIPT', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DisputeStatus" AS ENUM (
    'OPEN', 'IN_REVIEW', 'RESOLVED_PAID', 'RESOLVED_NO_CHANGE', 'CLOSED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ---------------------------------------------------------------------------
-- 2. Extend existing tables (Section 4)
-- ---------------------------------------------------------------------------

-- stops: free time and work state for detention / per-state pay calculations
ALTER TABLE stops
  ADD COLUMN IF NOT EXISTS free_time_minutes INTEGER     NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS work_state        VARCHAR(2);

-- contracts: carrier-level default for free time (overridden per stop)
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS default_free_time_minutes INTEGER;

-- loads: mileage fields drive CPM pay calculations
ALTER TABLE loads
  ADD COLUMN IF NOT EXISTS total_miles    DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS loaded_miles   DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS mileage_source "MileageSource";


-- ---------------------------------------------------------------------------
-- 3. New tables (created in FK dependency order)
-- ---------------------------------------------------------------------------

-- ─── 3.1 driver_compensation_templates ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS driver_compensation_templates (
  id                       UUID           NOT NULL DEFAULT gen_random_uuid(),
  tenant_id                UUID           NOT NULL,
  driver_id                UUID           NOT NULL,
  employment_type          "EmploymentType"  NOT NULL,
  pay_type                 "DriverPayType"   NOT NULL,
  base_rate                DECIMAL(10, 4) NOT NULL,
  rate_unit                "RateUnit"        NOT NULL,
  loaded_miles_only        BOOLEAN        NOT NULL,
  fuel_surcharge_rate      DECIMAL(10, 4),
  per_diem_enabled         BOOLEAN        NOT NULL,
  per_diem_rate            DECIMAL(8, 2),
  overtime_eligible        BOOLEAN        NOT NULL,
  overtime_threshold_hours DECIMAL(5, 2),
  overtime_multiplier      DECIMAL(4, 2),
  daily_overtime_threshold DECIMAL(4, 2),
  weekly_earning_goal      DECIMAL(10, 2),
  currency                 VARCHAR(3)     NOT NULL DEFAULT 'USD',
  effective_from           DATE           NOT NULL,
  effective_to             DATE,
  notes                    TEXT,
  created_at               TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  created_by               UUID           NOT NULL,
  deleted_at               TIMESTAMPTZ(6),

  CONSTRAINT driver_compensation_templates_pkey PRIMARY KEY (id),
  CONSTRAINT dct_base_rate_non_negative  CHECK (base_rate >= 0),
  CONSTRAINT dct_effective_dates_valid   CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT dct_tenant_fk FOREIGN KEY (tenant_id) REFERENCES "Tenant"(id) ON DELETE RESTRICT,
  CONSTRAINT dct_driver_fk FOREIGN KEY (driver_id) REFERENCES carrier_drivers(id) ON DELETE RESTRICT
);

-- Prevent overlapping active pay periods for the same driver.
-- btree_gist required: handles UUID = operator inside GIST index.
ALTER TABLE driver_compensation_templates
  ADD CONSTRAINT dct_no_overlapping_pay_periods
  EXCLUDE USING GIST (
    driver_id WITH =,
    daterange(effective_from, COALESCE(effective_to, '9999-12-31'::DATE), '[)') WITH &&
  )
  WHERE (deleted_at IS NULL);


-- ─── 3.2 driver_settlements (before load_driver_assignments due to FK) ───────

CREATE TABLE IF NOT EXISTS driver_settlements (
  id                   UUID                     NOT NULL DEFAULT gen_random_uuid(),
  tenant_id            UUID                     NOT NULL,
  driver_id            UUID                     NOT NULL,
  period_start         DATE                     NOT NULL,
  period_end           DATE                     NOT NULL,
  status               "DriverSettlementStatus" NOT NULL DEFAULT 'DRAFT',
  gross_taxable        DECIMAL(12, 2)           NOT NULL,
  gross_non_taxable    DECIMAL(12, 2)           NOT NULL,
  total_deductions     DECIMAL(12, 2)           NOT NULL,
  net_pay              DECIMAL(12, 2)           NOT NULL,
  finalized_by         UUID,
  finalized_at         TIMESTAMPTZ(6),
  paid_at              TIMESTAMPTZ(6),
  settlement_reference VARCHAR(100),
  pdf_url              VARCHAR(500),
  notes                TEXT,
  created_at           TIMESTAMPTZ(6)           NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ(6)           NOT NULL DEFAULT NOW(),
  created_by           UUID                     NOT NULL,
  deleted_at           TIMESTAMPTZ(6),

  CONSTRAINT driver_settlements_pkey   PRIMARY KEY (id),
  CONSTRAINT ds_unique_period          UNIQUE (driver_id, period_start, period_end),
  CONSTRAINT ds_tenant_fk FOREIGN KEY (tenant_id) REFERENCES "Tenant"(id)       ON DELETE RESTRICT,
  CONSTRAINT ds_driver_fk FOREIGN KEY (driver_id) REFERENCES carrier_drivers(id) ON DELETE RESTRICT
);


-- ─── 3.3 load_driver_assignments ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS load_driver_assignments (
  id                       UUID                     NOT NULL DEFAULT gen_random_uuid(),
  tenant_id                UUID                     NOT NULL,
  load_id                  UUID                     NOT NULL,
  driver_id                UUID                     NOT NULL,
  driver_role              "DriverRole"              NOT NULL,
  template_id              UUID,
  pay_type                 "DriverPayType"           NOT NULL,
  base_rate                DECIMAL(10, 4)           NOT NULL,
  rate_unit                "RateUnit"                NOT NULL,
  loaded_miles_only        BOOLEAN                  NOT NULL,
  fuel_surcharge_rate      DECIMAL(10, 4),
  split_percentage         DECIMAL(5, 2),
  per_diem_enabled         BOOLEAN                  NOT NULL,
  per_diem_rate            DECIMAL(8, 2),
  override_reason          TEXT,
  estimated_miles          DECIMAL(10, 2),
  actual_miles             DECIMAL(10, 2),
  mileage_source           "MileageSource",
  mileage_source_reference VARCHAR(255),
  estimated_hours          DECIMAL(8, 2),
  actual_hours             DECIMAL(8, 2),
  load_revenue             DECIMAL(12, 2),
  pay_status               "DriverAssignmentStatus" NOT NULL DEFAULT 'DRAFT',
  settlement_id            UUID,
  approved_by              UUID,
  approved_at              TIMESTAMPTZ(6),
  paid_at                  TIMESTAMPTZ(6),
  currency                 VARCHAR(3)               NOT NULL DEFAULT 'USD',
  created_at               TIMESTAMPTZ(6)           NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ(6)           NOT NULL DEFAULT NOW(),
  created_by               UUID                     NOT NULL,
  deleted_at               TIMESTAMPTZ(6),

  CONSTRAINT load_driver_assignments_pkey     PRIMARY KEY (id),
  CONSTRAINT lda_unique_load_driver           UNIQUE (load_id, driver_id),
  CONSTRAINT lda_tenant_fk     FOREIGN KEY (tenant_id)     REFERENCES "Tenant"(id)                      ON DELETE RESTRICT,
  CONSTRAINT lda_load_fk       FOREIGN KEY (load_id)       REFERENCES loads(id)                         ON DELETE RESTRICT,
  CONSTRAINT lda_driver_fk     FOREIGN KEY (driver_id)     REFERENCES carrier_drivers(id)               ON DELETE RESTRICT,
  CONSTRAINT lda_template_fk   FOREIGN KEY (template_id)   REFERENCES driver_compensation_templates(id) ON DELETE RESTRICT,
  CONSTRAINT lda_settlement_fk FOREIGN KEY (settlement_id) REFERENCES driver_settlements(id)            ON DELETE RESTRICT
);

-- Only one non-deleted MAIN_DRIVER assignment per load
CREATE UNIQUE INDEX IF NOT EXISTS lda_one_main_driver_per_load
  ON load_driver_assignments (load_id)
  WHERE driver_role = 'MAIN_DRIVER' AND deleted_at IS NULL;


-- ─── 3.4 load_pay_components ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS load_pay_components (
  id                    UUID                     NOT NULL DEFAULT gen_random_uuid(),
  tenant_id             UUID                     NOT NULL,
  assignment_id         UUID                     NOT NULL,
  load_id               UUID                     NOT NULL,
  driver_id             UUID                     NOT NULL,
  stop_id               UUID,
  component_type        "PayComponentType"        NOT NULL,
  category              "PayComponentCategory"    NOT NULL,
  description           VARCHAR(255)             NOT NULL,
  quantity              DECIMAL(10, 4)           NOT NULL,
  unit                  "PayComponentUnit"        NOT NULL,
  rate                  DECIMAL(10, 4)           NOT NULL,
  multiplier            DECIMAL(5, 2)            NOT NULL DEFAULT 1.0,
  gross_amount          DECIMAL(12, 2)           NOT NULL,
  is_taxable            BOOLEAN                  NOT NULL,
  is_reimbursement      BOOLEAN                  NOT NULL,
  original_component_id UUID,
  visible_to_driver     BOOLEAN                  NOT NULL DEFAULT TRUE,
  notes                 TEXT,
  entered_by            UUID                     NOT NULL,
  created_at            TIMESTAMPTZ(6)           NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ(6)           NOT NULL DEFAULT NOW(),
  created_by            UUID                     NOT NULL,
  deleted_at            TIMESTAMPTZ(6),

  CONSTRAINT load_pay_components_pkey              PRIMARY KEY (id),
  CONSTRAINT lpc_non_deduction_non_negative CHECK (category IN ('DEDUCTION', 'ADJUSTMENT') OR gross_amount >= 0),
  CONSTRAINT lpc_deduction_non_positive     CHECK (category != 'DEDUCTION' OR gross_amount <= 0),
  CONSTRAINT lpc_tenant_fk     FOREIGN KEY (tenant_id)              REFERENCES "Tenant"(id)              ON DELETE RESTRICT,
  CONSTRAINT lpc_assignment_fk FOREIGN KEY (assignment_id)          REFERENCES load_driver_assignments(id) ON DELETE RESTRICT,
  CONSTRAINT lpc_load_fk       FOREIGN KEY (load_id)                REFERENCES loads(id)                  ON DELETE RESTRICT,
  CONSTRAINT lpc_original_fk   FOREIGN KEY (original_component_id)  REFERENCES load_pay_components(id)    ON DELETE RESTRICT
);


-- ─── 3.5 driver_bonuses ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS driver_bonuses (
  id                 UUID           NOT NULL DEFAULT gen_random_uuid(),
  tenant_id          UUID           NOT NULL,
  driver_id          UUID           NOT NULL,
  bonus_type         "BonusType"     NOT NULL,
  amount             DECIMAL(12, 2) NOT NULL,
  description        VARCHAR(255)   NOT NULL,
  trigger_date       DATE           NOT NULL,
  scheduled_pay_date DATE,
  paid_at            TIMESTAMPTZ(6),
  installment_number INTEGER,
  total_installments INTEGER,
  parent_bonus_id    UUID,
  referred_driver_id UUID,
  settlement_id      UUID,
  is_taxable         BOOLEAN        NOT NULL,
  visible_to_driver  BOOLEAN        NOT NULL DEFAULT TRUE,
  notes              TEXT,
  created_at         TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  created_by         UUID           NOT NULL,
  deleted_at         TIMESTAMPTZ(6),

  CONSTRAINT driver_bonuses_pkey          PRIMARY KEY (id),
  CONSTRAINT db_tenant_fk          FOREIGN KEY (tenant_id)          REFERENCES "Tenant"(id)        ON DELETE RESTRICT,
  CONSTRAINT db_driver_fk          FOREIGN KEY (driver_id)          REFERENCES carrier_drivers(id)  ON DELETE RESTRICT,
  CONSTRAINT db_referred_driver_fk FOREIGN KEY (referred_driver_id) REFERENCES carrier_drivers(id)  ON DELETE RESTRICT,
  CONSTRAINT db_settlement_fk      FOREIGN KEY (settlement_id)      REFERENCES driver_settlements(id) ON DELETE RESTRICT,
  CONSTRAINT db_parent_bonus_fk    FOREIGN KEY (parent_bonus_id)    REFERENCES driver_bonuses(id)   ON DELETE RESTRICT
);


-- ─── 3.6 driver_deductions ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS driver_deductions (
  id                    UUID                  NOT NULL DEFAULT gen_random_uuid(),
  tenant_id             UUID                  NOT NULL,
  driver_id             UUID                  NOT NULL,
  deduction_type        "DeductionType"        NOT NULL,
  schedule              "DeductionSchedule"    NOT NULL,
  amount_per_period     DECIMAL(12, 2)        NOT NULL,
  total_amount          DECIMAL(12, 2),
  amount_collected      DECIMAL(12, 2)        NOT NULL DEFAULT 0,
  max_percentage_of_net DECIMAL(5, 2),
  starts_on             DATE                  NOT NULL,
  ends_on               DATE,
  paused                BOOLEAN               NOT NULL DEFAULT FALSE,
  visible_to_driver     BOOLEAN               NOT NULL DEFAULT TRUE,
  notes                 TEXT,
  created_at            TIMESTAMPTZ(6)        NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ(6)        NOT NULL DEFAULT NOW(),
  created_by            UUID                  NOT NULL,
  deleted_at            TIMESTAMPTZ(6),

  CONSTRAINT driver_deductions_pkey PRIMARY KEY (id),
  CONSTRAINT dd_tenant_fk FOREIGN KEY (tenant_id) REFERENCES "Tenant"(id)        ON DELETE RESTRICT,
  CONSTRAINT dd_driver_fk FOREIGN KEY (driver_id) REFERENCES carrier_drivers(id)  ON DELETE RESTRICT
);


-- ─── 3.7 pay_component_attachments ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pay_component_attachments (
  id            UUID           NOT NULL DEFAULT gen_random_uuid(),
  tenant_id     UUID           NOT NULL,
  component_id  UUID           NOT NULL,
  assignment_id UUID           NOT NULL,
  storage_key   TEXT           NOT NULL,
  filename      VARCHAR(255)   NOT NULL,
  content_type  VARCHAR(100),
  size_bytes    INTEGER,
  uploaded_by   UUID           NOT NULL,
  created_at    TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  created_by    UUID           NOT NULL,
  deleted_at    TIMESTAMPTZ(6),

  CONSTRAINT pay_component_attachments_pkey PRIMARY KEY (id),
  CONSTRAINT pca_tenant_fk     FOREIGN KEY (tenant_id)    REFERENCES "Tenant"(id)               ON DELETE RESTRICT,
  CONSTRAINT pca_component_fk  FOREIGN KEY (component_id) REFERENCES load_pay_components(id)    ON DELETE RESTRICT,
  CONSTRAINT pca_assignment_fk FOREIGN KEY (assignment_id) REFERENCES load_driver_assignments(id) ON DELETE RESTRICT
);


-- ─── 3.8 driver_disputes ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS driver_disputes (
  id                   UUID                    NOT NULL DEFAULT gen_random_uuid(),
  tenant_id            UUID                    NOT NULL,
  driver_id            UUID                    NOT NULL,
  target_type          "DisputeTargetType"      NOT NULL,
  target_id            UUID                    NOT NULL,
  issue_category       "DisputeIssueCategory"   NOT NULL,
  driver_message       TEXT                    NOT NULL,
  status               "DisputeStatus"          NOT NULL DEFAULT 'OPEN',
  assigned_to          UUID,
  resolution_message   TEXT,
  resolved_at          TIMESTAMPTZ(6),
  linked_correction_id UUID,
  created_at           TIMESTAMPTZ(6)          NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ(6)          NOT NULL DEFAULT NOW(),
  created_by           UUID                    NOT NULL,
  deleted_at           TIMESTAMPTZ(6),

  CONSTRAINT driver_disputes_pkey          PRIMARY KEY (id),
  CONSTRAINT ddispute_tenant_fk     FOREIGN KEY (tenant_id)            REFERENCES "Tenant"(id)           ON DELETE RESTRICT,
  CONSTRAINT ddispute_driver_fk     FOREIGN KEY (driver_id)            REFERENCES carrier_drivers(id)    ON DELETE RESTRICT,
  CONSTRAINT ddispute_correction_fk FOREIGN KEY (linked_correction_id) REFERENCES load_pay_components(id) ON DELETE RESTRICT
);


-- ─── 3.9 driver_pay_audit_logs ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS driver_pay_audit_logs (
  id             UUID           NOT NULL DEFAULT gen_random_uuid(),
  tenant_id      UUID           NOT NULL,
  entity_type    VARCHAR(100)   NOT NULL,
  entity_id      UUID           NOT NULL,
  action         VARCHAR(100)   NOT NULL,
  previous_value JSONB,
  new_value      JSONB,
  actor_id       UUID,
  ip_address     VARCHAR(45),
  created_at     TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  created_by     UUID           NOT NULL,

  CONSTRAINT driver_pay_audit_logs_pkey PRIMARY KEY (id),
  CONSTRAINT dpal_tenant_fk FOREIGN KEY (tenant_id) REFERENCES "Tenant"(id) ON DELETE RESTRICT
);


-- ---------------------------------------------------------------------------
-- 4. Indexes
-- ---------------------------------------------------------------------------

-- driver_compensation_templates
CREATE INDEX IF NOT EXISTS idx_dct_tenant_id      ON driver_compensation_templates (tenant_id);
CREATE INDEX IF NOT EXISTS idx_dct_driver_id      ON driver_compensation_templates (driver_id);
CREATE INDEX IF NOT EXISTS idx_dct_tenant_driver  ON driver_compensation_templates (tenant_id, driver_id);

-- driver_settlements
CREATE INDEX IF NOT EXISTS idx_ds_tenant_id          ON driver_settlements (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ds_driver_id          ON driver_settlements (driver_id);
CREATE INDEX IF NOT EXISTS idx_ds_tenant_driver      ON driver_settlements (tenant_id, driver_id);
CREATE INDEX IF NOT EXISTS idx_ds_tenant_period_start ON driver_settlements (tenant_id, period_start);

-- load_driver_assignments
CREATE INDEX IF NOT EXISTS idx_lda_tenant_id      ON load_driver_assignments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_lda_load_id        ON load_driver_assignments (load_id);
CREATE INDEX IF NOT EXISTS idx_lda_driver_id      ON load_driver_assignments (driver_id);
CREATE INDEX IF NOT EXISTS idx_lda_tenant_driver  ON load_driver_assignments (tenant_id, driver_id);
CREATE INDEX IF NOT EXISTS idx_lda_settlement_id  ON load_driver_assignments (settlement_id);

-- load_pay_components
CREATE INDEX IF NOT EXISTS idx_lpc_tenant_id      ON load_pay_components (tenant_id);
CREATE INDEX IF NOT EXISTS idx_lpc_assignment_id  ON load_pay_components (assignment_id);
CREATE INDEX IF NOT EXISTS idx_lpc_load_id        ON load_pay_components (load_id);
CREATE INDEX IF NOT EXISTS idx_lpc_driver_id      ON load_pay_components (driver_id);
CREATE INDEX IF NOT EXISTS idx_lpc_tenant_driver  ON load_pay_components (tenant_id, driver_id);

-- driver_bonuses
CREATE INDEX IF NOT EXISTS idx_db_tenant_id      ON driver_bonuses (tenant_id);
CREATE INDEX IF NOT EXISTS idx_db_driver_id      ON driver_bonuses (driver_id);
CREATE INDEX IF NOT EXISTS idx_db_tenant_driver  ON driver_bonuses (tenant_id, driver_id);
CREATE INDEX IF NOT EXISTS idx_db_settlement_id  ON driver_bonuses (settlement_id);

-- driver_deductions
CREATE INDEX IF NOT EXISTS idx_dd_tenant_id      ON driver_deductions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_dd_driver_id      ON driver_deductions (driver_id);
CREATE INDEX IF NOT EXISTS idx_dd_tenant_driver  ON driver_deductions (tenant_id, driver_id);

-- pay_component_attachments
CREATE INDEX IF NOT EXISTS idx_pca_tenant_id      ON pay_component_attachments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pca_component_id   ON pay_component_attachments (component_id);
CREATE INDEX IF NOT EXISTS idx_pca_assignment_id  ON pay_component_attachments (assignment_id);

-- driver_disputes
CREATE INDEX IF NOT EXISTS idx_ddispute_tenant_id     ON driver_disputes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ddispute_driver_id     ON driver_disputes (driver_id);
CREATE INDEX IF NOT EXISTS idx_ddispute_tenant_driver ON driver_disputes (tenant_id, driver_id);
CREATE INDEX IF NOT EXISTS idx_ddispute_target_id     ON driver_disputes (target_id);

-- driver_pay_audit_logs
CREATE INDEX IF NOT EXISTS idx_dpal_tenant_id        ON driver_pay_audit_logs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_dpal_entity           ON driver_pay_audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_dpal_tenant_entity    ON driver_pay_audit_logs (tenant_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_dpal_tenant_created   ON driver_pay_audit_logs (tenant_id, created_at);


-- ---------------------------------------------------------------------------
-- 5. Row Level Security
-- ---------------------------------------------------------------------------
-- Pattern: two policies per table
--   tenant_isolation_policy  — enforces tenantId scoping via current_tenant_id()
--   bypass_rls_policy        — allows seed/migration scripts to bypass via app.bypass_rls

-- ─── driver_compensation_templates ───────────────────────────────────────────
ALTER TABLE driver_compensation_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_compensation_templates FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_policy ON driver_compensation_templates
    FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY bypass_rls_policy ON driver_compensation_templates
    FOR ALL
    USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── driver_settlements ───────────────────────────────────────────────────────
ALTER TABLE driver_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_settlements FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_policy ON driver_settlements
    FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY bypass_rls_policy ON driver_settlements
    FOR ALL
    USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── load_driver_assignments ──────────────────────────────────────────────────
ALTER TABLE load_driver_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE load_driver_assignments FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_policy ON load_driver_assignments
    FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY bypass_rls_policy ON load_driver_assignments
    FOR ALL
    USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── load_pay_components ──────────────────────────────────────────────────────
ALTER TABLE load_pay_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE load_pay_components FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_policy ON load_pay_components
    FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY bypass_rls_policy ON load_pay_components
    FOR ALL
    USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── driver_bonuses ───────────────────────────────────────────────────────────
ALTER TABLE driver_bonuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_bonuses FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_policy ON driver_bonuses
    FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY bypass_rls_policy ON driver_bonuses
    FOR ALL
    USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── driver_deductions ────────────────────────────────────────────────────────
ALTER TABLE driver_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_deductions FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_policy ON driver_deductions
    FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY bypass_rls_policy ON driver_deductions
    FOR ALL
    USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── pay_component_attachments ────────────────────────────────────────────────
ALTER TABLE pay_component_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pay_component_attachments FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_policy ON pay_component_attachments
    FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY bypass_rls_policy ON pay_component_attachments
    FOR ALL
    USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── driver_disputes ──────────────────────────────────────────────────────────
ALTER TABLE driver_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_disputes FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_policy ON driver_disputes
    FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY bypass_rls_policy ON driver_disputes
    FOR ALL
    USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── driver_pay_audit_logs ────────────────────────────────────────────────────
ALTER TABLE driver_pay_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_pay_audit_logs FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_policy ON driver_pay_audit_logs
    FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY bypass_rls_policy ON driver_pay_audit_logs
    FOR ALL
    USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- TKT-0015 Prompt 2a: Pre-flight schema cleanup — audit FK upgrade
-- Flags: 4 (Driver Pay created_by NOT NULL → nullable FK), 8 (bare UUID → FK)
-- Flag 5 (SysAdminInvoiceItem timestamp drift) is Prisma-side only — no DB ALTER here.
--
-- Order: all DROP NOT NULL first, then all FK ADD CONSTRAINT blocks.

-- ─── DROP NOT NULL (Flag 4: 8 Driver Pay snake_case tables) ──────────────────

ALTER TABLE "driver_compensation_templates" ALTER COLUMN "created_by" DROP NOT NULL;
ALTER TABLE "load_driver_assignments" ALTER COLUMN "created_by" DROP NOT NULL;
ALTER TABLE "load_pay_components" ALTER COLUMN "created_by" DROP NOT NULL;
ALTER TABLE "driver_bonuses" ALTER COLUMN "created_by" DROP NOT NULL;
ALTER TABLE "driver_deductions" ALTER COLUMN "created_by" DROP NOT NULL;
ALTER TABLE "driver_settlements" ALTER COLUMN "created_by" DROP NOT NULL;
ALTER TABLE "driver_disputes" ALTER COLUMN "created_by" DROP NOT NULL;
ALTER TABLE "pay_component_attachments" ALTER COLUMN "created_by" DROP NOT NULL;

-- ─── DROP NOT NULL (Flag 8: 7 camelCase tables — already nullable, idempotent) ─

ALTER TABLE "PlaybookStep" ALTER COLUMN "createdBy" DROP NOT NULL;
ALTER TABLE "StepInstance" ALTER COLUMN "createdBy" DROP NOT NULL;
ALTER TABLE "RouteDriver" ALTER COLUMN "createdBy" DROP NOT NULL;
ALTER TABLE "PushToken" ALTER COLUMN "createdBy" DROP NOT NULL;
ALTER TABLE "UserNotificationPreference" ALTER COLUMN "createdBy" DROP NOT NULL;
ALTER TABLE "SysAdminInvoiceItem" ALTER COLUMN "createdBy" DROP NOT NULL;
ALTER TABLE "SysAdminInvoiceItem" ALTER COLUMN "updatedBy" DROP NOT NULL;

-- ─── ADD CONSTRAINT (Flag 4: 8 Driver Pay snake_case tables) ─────────────────

DO $$ BEGIN
  ALTER TABLE "driver_compensation_templates"
    ADD CONSTRAINT "driver_compensation_templates_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "load_driver_assignments"
    ADD CONSTRAINT "load_driver_assignments_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "load_pay_components"
    ADD CONSTRAINT "load_pay_components_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "driver_bonuses"
    ADD CONSTRAINT "driver_bonuses_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "driver_deductions"
    ADD CONSTRAINT "driver_deductions_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "driver_settlements"
    ADD CONSTRAINT "driver_settlements_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "driver_disputes"
    ADD CONSTRAINT "driver_disputes_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "pay_component_attachments"
    ADD CONSTRAINT "pay_component_attachments_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── ADD CONSTRAINT (Flag 8: 7 camelCase tables) ─────────────────────────────

DO $$ BEGIN
  ALTER TABLE "PlaybookStep"
    ADD CONSTRAINT "PlaybookStep_createdBy_fkey"
    FOREIGN KEY ("createdBy") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StepInstance"
    ADD CONSTRAINT "StepInstance_createdBy_fkey"
    FOREIGN KEY ("createdBy") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "RouteDriver"
    ADD CONSTRAINT "RouteDriver_createdBy_fkey"
    FOREIGN KEY ("createdBy") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PushToken"
    ADD CONSTRAINT "PushToken_createdBy_fkey"
    FOREIGN KEY ("createdBy") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "UserNotificationPreference"
    ADD CONSTRAINT "UserNotificationPreference_createdBy_fkey"
    FOREIGN KEY ("createdBy") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SysAdminInvoiceItem"
    ADD CONSTRAINT "SysAdminInvoiceItem_createdBy_fkey"
    FOREIGN KEY ("createdBy") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SysAdminInvoiceItem"
    ADD CONSTRAINT "SysAdminInvoiceItem_updatedBy_fkey"
    FOREIGN KEY ("updatedBy") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

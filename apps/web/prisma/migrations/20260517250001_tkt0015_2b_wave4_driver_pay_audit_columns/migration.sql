-- TKT-0015 Prompt 2b — Wave 4: Driver Pay + Workflow + Template audit columns
-- Group A (camelCase, both cols): SupportTicket, PlaybookInstance, StepTemplate,
--   Playbook, DriverInvitation, PlaybookTrigger
-- Group B (snake_case, both cols): route_templates
-- Group C (snake_case, CREATE_ONLY): route_template_stops (no updatedAt → no updated_by_id)
-- Group D (Driver Pay, updated_by only): driver_compensation_templates,
--   load_driver_assignments, load_pay_components, pay_component_attachments,
--   driver_bonuses, driver_deductions, driver_settlements, driver_disputes
-- All FKs: ON DELETE SET NULL. All columns nullable.

-- ─── SupportTicket ─────────────────────────────────────────────────────────
ALTER TABLE "SupportTicket" ADD COLUMN IF NOT EXISTS "createdById" UUID;
ALTER TABLE "SupportTicket" ADD COLUMN IF NOT EXISTS "updatedById" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'SupportTicket_createdById_fkey' AND table_name = 'SupportTicket'
  ) THEN
    ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'SupportTicket_updatedById_fkey' AND table_name = 'SupportTicket'
  ) THEN
    ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── PlaybookInstance ──────────────────────────────────────────────────────
ALTER TABLE "PlaybookInstance" ADD COLUMN IF NOT EXISTS "createdById" UUID;
ALTER TABLE "PlaybookInstance" ADD COLUMN IF NOT EXISTS "updatedById" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'PlaybookInstance_createdById_fkey' AND table_name = 'PlaybookInstance'
  ) THEN
    ALTER TABLE "PlaybookInstance" ADD CONSTRAINT "PlaybookInstance_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'PlaybookInstance_updatedById_fkey' AND table_name = 'PlaybookInstance'
  ) THEN
    ALTER TABLE "PlaybookInstance" ADD CONSTRAINT "PlaybookInstance_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── StepTemplate ──────────────────────────────────────────────────────────
ALTER TABLE "StepTemplate" ADD COLUMN IF NOT EXISTS "createdById" UUID;
ALTER TABLE "StepTemplate" ADD COLUMN IF NOT EXISTS "updatedById" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'StepTemplate_createdById_fkey' AND table_name = 'StepTemplate'
  ) THEN
    ALTER TABLE "StepTemplate" ADD CONSTRAINT "StepTemplate_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'StepTemplate_updatedById_fkey' AND table_name = 'StepTemplate'
  ) THEN
    ALTER TABLE "StepTemplate" ADD CONSTRAINT "StepTemplate_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── Playbook ──────────────────────────────────────────────────────────────
ALTER TABLE "Playbook" ADD COLUMN IF NOT EXISTS "createdById" UUID;
ALTER TABLE "Playbook" ADD COLUMN IF NOT EXISTS "updatedById" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Playbook_createdById_fkey' AND table_name = 'Playbook'
  ) THEN
    ALTER TABLE "Playbook" ADD CONSTRAINT "Playbook_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Playbook_updatedById_fkey' AND table_name = 'Playbook'
  ) THEN
    ALTER TABLE "Playbook" ADD CONSTRAINT "Playbook_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── DriverInvitation ──────────────────────────────────────────────────────
ALTER TABLE "DriverInvitation" ADD COLUMN IF NOT EXISTS "createdById" UUID;
ALTER TABLE "DriverInvitation" ADD COLUMN IF NOT EXISTS "updatedById" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'DriverInvitation_createdById_fkey' AND table_name = 'DriverInvitation'
  ) THEN
    ALTER TABLE "DriverInvitation" ADD CONSTRAINT "DriverInvitation_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'DriverInvitation_updatedById_fkey' AND table_name = 'DriverInvitation'
  ) THEN
    ALTER TABLE "DriverInvitation" ADD CONSTRAINT "DriverInvitation_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── PlaybookTrigger ───────────────────────────────────────────────────────
ALTER TABLE "PlaybookTrigger" ADD COLUMN IF NOT EXISTS "createdById" UUID;
ALTER TABLE "PlaybookTrigger" ADD COLUMN IF NOT EXISTS "updatedById" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'PlaybookTrigger_createdById_fkey' AND table_name = 'PlaybookTrigger'
  ) THEN
    ALTER TABLE "PlaybookTrigger" ADD CONSTRAINT "PlaybookTrigger_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'PlaybookTrigger_updatedById_fkey' AND table_name = 'PlaybookTrigger'
  ) THEN
    ALTER TABLE "PlaybookTrigger" ADD CONSTRAINT "PlaybookTrigger_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── route_templates (RouteTemplate — snake_case, both cols) ───────────────
ALTER TABLE "route_templates" ADD COLUMN IF NOT EXISTS "created_by_id" UUID;
ALTER TABLE "route_templates" ADD COLUMN IF NOT EXISTS "updated_by_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'route_templates_created_by_id_fkey' AND table_name = 'route_templates'
  ) THEN
    ALTER TABLE "route_templates" ADD CONSTRAINT "route_templates_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'route_templates_updated_by_id_fkey' AND table_name = 'route_templates'
  ) THEN
    ALTER TABLE "route_templates" ADD CONSTRAINT "route_templates_updated_by_id_fkey"
      FOREIGN KEY ("updated_by_id") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── route_template_stops (RouteTemplateStop — snake_case, CREATE_ONLY) ────
-- No updatedAt on this table → add created_by_id only.
ALTER TABLE "route_template_stops" ADD COLUMN IF NOT EXISTS "created_by_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'route_template_stops_created_by_id_fkey' AND table_name = 'route_template_stops'
  ) THEN
    ALTER TABLE "route_template_stops" ADD CONSTRAINT "route_template_stops_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── Driver Pay: add updated_by to all 8 tables ────────────────────────────
-- These models already have created_by (with proper FK relation, from Prompt 2a).
-- Wave 4 adds the missing updated_by column and constraint.

ALTER TABLE "driver_compensation_templates" ADD COLUMN IF NOT EXISTS "updated_by" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'driver_compensation_templates_updated_by_fkey'
      AND table_name = 'driver_compensation_templates'
  ) THEN
    ALTER TABLE "driver_compensation_templates" ADD CONSTRAINT "driver_compensation_templates_updated_by_fkey"
      FOREIGN KEY ("updated_by") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE "load_driver_assignments" ADD COLUMN IF NOT EXISTS "updated_by" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'load_driver_assignments_updated_by_fkey'
      AND table_name = 'load_driver_assignments'
  ) THEN
    ALTER TABLE "load_driver_assignments" ADD CONSTRAINT "load_driver_assignments_updated_by_fkey"
      FOREIGN KEY ("updated_by") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE "load_pay_components" ADD COLUMN IF NOT EXISTS "updated_by" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'load_pay_components_updated_by_fkey'
      AND table_name = 'load_pay_components'
  ) THEN
    ALTER TABLE "load_pay_components" ADD CONSTRAINT "load_pay_components_updated_by_fkey"
      FOREIGN KEY ("updated_by") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE "pay_component_attachments" ADD COLUMN IF NOT EXISTS "updated_by" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'pay_component_attachments_updated_by_fkey'
      AND table_name = 'pay_component_attachments'
  ) THEN
    ALTER TABLE "pay_component_attachments" ADD CONSTRAINT "pay_component_attachments_updated_by_fkey"
      FOREIGN KEY ("updated_by") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE "driver_bonuses" ADD COLUMN IF NOT EXISTS "updated_by" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'driver_bonuses_updated_by_fkey'
      AND table_name = 'driver_bonuses'
  ) THEN
    ALTER TABLE "driver_bonuses" ADD CONSTRAINT "driver_bonuses_updated_by_fkey"
      FOREIGN KEY ("updated_by") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE "driver_deductions" ADD COLUMN IF NOT EXISTS "updated_by" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'driver_deductions_updated_by_fkey'
      AND table_name = 'driver_deductions'
  ) THEN
    ALTER TABLE "driver_deductions" ADD CONSTRAINT "driver_deductions_updated_by_fkey"
      FOREIGN KEY ("updated_by") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE "driver_settlements" ADD COLUMN IF NOT EXISTS "updated_by" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'driver_settlements_updated_by_fkey'
      AND table_name = 'driver_settlements'
  ) THEN
    ALTER TABLE "driver_settlements" ADD CONSTRAINT "driver_settlements_updated_by_fkey"
      FOREIGN KEY ("updated_by") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE "driver_disputes" ADD COLUMN IF NOT EXISTS "updated_by" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'driver_disputes_updated_by_fkey'
      AND table_name = 'driver_disputes'
  ) THEN
    ALTER TABLE "driver_disputes" ADD CONSTRAINT "driver_disputes_updated_by_fkey"
      FOREIGN KEY ("updated_by") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Phase 52 postscript: add delaySeconds to AutomationRule
--
-- The evaluator uses rule.delaySeconds to compute scheduledAt:
--   scheduledAt = event.createdAt + rule.delaySeconds seconds
-- The column was missing from the schema; evaluator was reading undefined,
-- coercing to 0, and scheduling all runs immediately.
--
-- welcome_owner and activation_celebration get 60s so the run is
-- scheduled slightly after the event (avoids race with the signup flow).
-- All other rules default to 0.

ALTER TABLE "AutomationRule"
  ADD COLUMN IF NOT EXISTS "delaySeconds" INTEGER NOT NULL DEFAULT 0;

UPDATE "AutomationRule"
  SET "delaySeconds" = 60
  WHERE "key" IN ('welcome_owner', 'activation_celebration');

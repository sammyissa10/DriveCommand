-- AlterTable: per-user first-run navigational tour flag (owner/dispatcher portal).
-- Idempotent so re-runs are safe. No per-column grants needed — "User" table
-- grants already cover app_user.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "onboardingTourSeen" BOOLEAN NOT NULL DEFAULT FALSE;

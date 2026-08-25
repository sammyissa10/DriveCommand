-- Document Import Phase 10 — notification triggers (spec Section 13).
--
-- APPLIED TO PRODUCTION VIA SUPABASE MCP on 2026-08-25, then mirrored here and
-- marked resolved-not-run, per DEC-3: there is no local database, so a migration
-- file is a record of a change already made, never the thing that makes it.
-- `pg_constraint` was read first (DEC-14) — none of the four notification tables
-- carries a CHECK, so these are plain additive changes.

-- ---------------------------------------------------------------------------
-- 1. Two new NotificationCategory values.
--
-- DEC-16 says adding an enum value is THREE changes. Recording all three here so
-- the omission that produced the sixteen-month PlaybookCategory gap cannot
-- repeat silently:
--
--   (1) The type            — these two statements.
--   (2) The existing rows   — VACUOUS, and stated rather than omitted. All ten
--                             Phase 10 trigger keys are NEW rows seeded after
--                             this migration; there is no pre-existing row that
--                             "would have used" TRIP or IMPORT and had to settle
--                             for something else. Nothing to backfill. A
--                             deferred backfill nobody records is
--                             indistinguishable from one nobody thought of, so
--                             this sentence is the record.
--   (3) Every place a user picks from it — the two hand-written arrays,
--                             src/app/(shared)/settings/my-notifications/preferences-form.tsx
--                             and src/app/(owner)/settings/notifications/notifications-tab.tsx,
--                             each with its sibling label map (and colour map on
--                             the second). Both edited in this same commit.
--
-- A Trip is deliberately NOT filed under ROUTE. This repo has two parallel route
-- systems (legacy `Route` vs carrier `route_templates`) and conflating them has
-- already cost one production incident.
ALTER TYPE "NotificationCategory" ADD VALUE IF NOT EXISTS 'TRIP';
ALTER TYPE "NotificationCategory" ADD VALUE IF NOT EXISTS 'IMPORT';

-- ---------------------------------------------------------------------------
-- 2. The PUSH channel gets a switch, at the template and at the user.
--
-- `NotificationChannel.PUSH` has existed since DEC-2 with nothing sending on it;
-- Phase 10 is where the dispatcher grows a PUSH branch. Two columns rather than
-- one because they answer different questions:
--
--   NotificationTemplate.pushEnabled       — "does this trigger push at all?"
--     DEFAULT FALSE. This is what guarantees no existing trigger changes
--     behaviour when the dispatcher's new PUSH branch ships: all 37 pre-existing
--     templates take the default and push for none of them. Verified after
--     apply: 0 rows with pushEnabled = true.
--
--   UserNotificationPreference.pushEnabled — "does THIS user want it?"
--     DEFAULT TRUE, matching its emailEnabled/inAppEnabled siblings on the same
--     table. Default-allow is right here because the template flag is the real
--     gate; a user preference defaulting to false would mean nobody ever
--     receives a push until they opt in twice.
ALTER TABLE "NotificationTemplate"
  ADD COLUMN IF NOT EXISTS "pushEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "UserNotificationPreference"
  ADD COLUMN IF NOT EXISTS "pushEnabled" BOOLEAN NOT NULL DEFAULT true;

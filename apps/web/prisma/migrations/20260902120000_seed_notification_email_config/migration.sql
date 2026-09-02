-- quick-581 — seed the NotificationEmailConfig singleton.
--
-- APPLIED TO PRODUCTION VIA SUPABASE MCP on 2026-09-02, then mirrored here and
-- marked resolved-not-run, per DEC-3: there is no local database, so a migration
-- file is a record of a change already made, never the thing that makes it.
--
-- WHY THESE EXACT VALUES
-- They are byte-identical to sender-config.ts's FALLBACK_FROM_NAME /
-- FALLBACK_FROM_EMAIL / FALLBACK_REPLY_TO. quick-580 verified the env path in
-- production and could not verify the database path, because the table was
-- empty. Choosing values that match the fallback makes the flip observable in
-- exactly one field -- `source` -- and in nothing a recipient sees. Any other
-- value would change the delivered message and the test would prove less.
--
-- team@drivecommand.app is the only Resend-VERIFIED sending domain.
-- drivecommand.io is NOT verified (its DNS sits on an inaccessible Vercel
-- account), so it may appear as Reply-To and must never appear as From.
--
-- IDEMPOTENT BY `WHERE NOT EXISTS`, deliberately not by ON CONFLICT.
-- The singleton guard is a PARTIAL unique index
-- (`NotificationEmailConfig_singleton_idx ... WHERE "singletonKey" = 'singleton'`),
-- and Postgres cannot infer a partial index as an ON CONFLICT arbiter without
-- restating its predicate. Verified against pg_constraint AND pg_indexes before
-- writing (DEC-14): pg_constraint carries ONLY the primary key, so a
-- constraint-only query reports no unique guard and is wrong. NOT EXISTS is
-- correct whichever guard is present, and DEC-17 names an unguarded seed INSERT
-- as one of the shapes that duplicates data when scripts/migrate.mjs re-runs a
-- migration whose _prisma_migrations row is missing.
--
-- The table is a GLOBAL singleton: no tenantId/org_id column, RLS disabled, zero
-- policies. That is why sender-config.ts reads it outside any tenant context.
--
-- `updatedAt` is NOT NULL with no DEFAULT (Prisma manages it in app code), so a
-- raw INSERT must supply it.
INSERT INTO "NotificationEmailConfig"
  ("singletonKey", "fromName", "fromEmail", "replyTo", "createdAt", "updatedAt")
SELECT 'singleton', 'DriveCommand', 'team@drivecommand.app', 'team@drivecommand.io',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "NotificationEmailConfig");

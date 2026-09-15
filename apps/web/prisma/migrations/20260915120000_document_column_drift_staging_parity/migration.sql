-- quick-606 — close the `Document` column drift that makes the repository unable
-- to rebuild its own database from scratch.
--
-- ─── THIS FILE WILL REACH PRODUCTION, AND THAT IS ACCOUNTED FOR ─────────────
--
-- `apps/web/vercel.json` runs `scripts/migrate.mjs` as its `buildCommand`, so a
-- migration committed to this repo IS applied to production on the next
-- `vercel --prod`. This one is a deliberate, proven NO-OP there: every column,
-- index and constraint below was read off PRODUCTION's own
-- `information_schema.columns` / `pg_indexes` / `pg_constraint` first
-- (`.planning/quick/606-…/evidence/06-document-drift.json`), and every statement
-- is `IF NOT EXISTS` or guarded on `pg_constraint`. Applied by hand to STAGING
-- only; the `_prisma_migrations` row there was written by hand per DEC-17 and
-- read back on the privileged connection.
--
-- ─── WHAT THE DRIFT IS ─────────────────────────────────────────────────────
--
-- `staging-environment.md` §2 recorded ONE missing column, `Document.driverId`.
-- quick-604 §7e found five more, two of which (`expiryDate`, `externalUrl`)
-- appear in ZERO migration files anywhere in this repo. Production carries 21
-- columns on `"Document"`, staging 20, and the five below are the difference.
-- Measured, not inferred — the types, nullability and defaults here are
-- production's verbatim, and the plan's condition was to write NOTHING if any
-- one of them were ambiguous. None was: all five are nullable with no default.
--
--   column        production type              nullable   default
--   description   text                         YES        NULL
--   expiryDate    timestamp with time zone     YES        NULL
--   externalUrl   text                         YES        NULL
--   loadId        uuid                         YES        NULL
--   notes         text                         YES        NULL
--
-- Consequences on staging, both measured as HTTP 500s under `app_user`:
--   `/documents`                     — P2022, the page orders by `expiryDate`
--   `/api/cron/send-reminders`       — 42703 `column Document.loadId does not exist`
--   `/api/cron/digest-compliance-30day` — 42703 `column Document.expiryDate does not exist`
--
-- ─── WHAT THIS DELIBERATELY DOES NOT DO ────────────────────────────────────
--
-- Staging ALSO carries four columns production does not (`createdBy`,
-- `deletedBy`, `deletedAt`, `updatedBy`) and is missing `Document_driverId_idx`,
-- whose column exists on both. Drift in the other direction, on columns no
-- Prisma model declares. Reported in `docs/audits/app-user-failure-remediation.md`
-- §8, NOT dropped here: dropping a column is irreversible and nothing measured
-- requires it.
--
-- Column names are camelCase and MUST be quoted — the same class as
-- `stops."bolRequired"` (DEC-14): the convention around a name is not evidence
-- about the name.

ALTER TABLE public."Document" ADD COLUMN IF NOT EXISTS "description"  text;
ALTER TABLE public."Document" ADD COLUMN IF NOT EXISTS "expiryDate"   timestamptz;
ALTER TABLE public."Document" ADD COLUMN IF NOT EXISTS "externalUrl"  text;
ALTER TABLE public."Document" ADD COLUMN IF NOT EXISTS "loadId"       uuid;
ALTER TABLE public."Document" ADD COLUMN IF NOT EXISTS "notes"        text;

-- The two indexes that cannot exist without the columns above. Both are present
-- on production verbatim (`pg_indexes`), so both are no-ops there.
CREATE INDEX IF NOT EXISTS "Document_expiryDate_idx" ON public."Document" USING btree ("expiryDate");
CREATE INDEX IF NOT EXISTS "Document_loadId_idx"     ON public."Document" USING btree ("loadId");

-- The FK the schema declares for `loadId`. `ADD CONSTRAINT` has no
-- `IF NOT EXISTS`, so it is guarded on `pg_constraint` — and on the existence of
-- `"Load"`, because a database without the legacy table must not fail here.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public."Document"'::regclass
       AND conname = 'Document_loadId_fkey'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'Load'
  ) THEN
    ALTER TABLE public."Document"
      ADD CONSTRAINT "Document_loadId_fkey"
      FOREIGN KEY ("loadId") REFERENCES public."Load"(id)
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END
$$;

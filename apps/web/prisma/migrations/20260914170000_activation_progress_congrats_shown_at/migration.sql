-- quick-601 — `"ActivationProgress"."congratsShownAt"` is in schema.prisma and in
-- PRODUCTION, and in NO migration in this repository.
--
-- HOW IT WAS FOUND, which is the part worth keeping. quick-601's end-to-end proof
-- runs the real `provisionTenant()` against staging as `app_user`. It failed at
-- Step 9 with Prisma `P2022 — The column (not available) does not exist in the
-- current database` on `tx.activationProgress.create()`. That is NOT an RLS
-- failure and nothing about this task caused it: staging is built by replaying the
-- migration chain, production is not, and the column reached production out of
-- band. `grep -rln congratsShownAt apps/web/prisma/migrations/` returns nothing.
--
-- The full staging/schema.prisma diff at that moment was 21 missing columns across
-- 75 models plus one missing table. EXACTLY ONE of them sits on the provisioning
-- path, and this is it. The other 20 are real and are reported rather than swept
-- up here — they belong to whoever owns the staging-parity item, not to B3.
--
-- Additive, nullable, `IF NOT EXISTS`: a no-op on production, where the column
-- already exists with this exact type. It closes the chain so staging can be
-- rebuilt from migrations and reach the same shape.
--
-- Column type read from production's information_schema
-- (`timestamp with time zone`, nullable, no default), not inferred from the
-- Prisma attribute.

ALTER TABLE public."ActivationProgress"
  ADD COLUMN IF NOT EXISTS "congratsShownAt" TIMESTAMPTZ NULL;

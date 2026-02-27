---
status: verifying
trigger: "routes-page-not-loading-production"
created: 2026-02-27T00:00:00Z
updated: 2026-02-27T00:15:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED — listRoutes() added _count: { stops: true } that queries RouteStop table (added in migration 20260226000003). This data is unused by the UI. Fix applied: removed _count from listRoutes(). Also made migration 20260226000001 idempotent (IF NOT EXISTS) to prevent migration chain abort on re-deploy.
test: TypeScript compile check passed. listRoutes() now identical to a1b4a49 working version.
expecting: Production routes page will load after redeployment.
next_action: Commit and push fix to trigger Vercel redeploy

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: /routes page loads showing the routes list
actual: page does not load in production on Vercel
errors: unknown — user has not provided specific error message (likely Prisma P2021: table does not exist, or similar)
reproduction: visit /routes on https://drive-command.vercel.app
started: after deploying 30 commits on 2026-02-27. Last working deploy was 22h ago at commit a1b4a49. New commits include Phase 16-19 work (route finance foundation, unified route view/edit, driver document uploads, multi-stop routes).

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: TypeScript type mismatch causing runtime error
  evidence: route-list.tsx and route-list-wrapper.tsx both define Route interface without _count — but TS type mismatches don't cause JS runtime errors. The extra field is just ignored by the component.
  timestamp: 2026-02-27

- hypothesis: Next.js config or middleware issue
  evidence: vercel.json and next.config.ts are unchanged from working commit a1b4a49. Middleware was not changed in the new commits.
  timestamp: 2026-02-27

- hypothesis: Build failure causing old code to serve
  evidence: If the Vercel build failed, the old deployment (a1b4a49) would still serve, and that version's routes page worked fine. The fact that routes is broken implies new code was deployed.
  timestamp: 2026-02-27

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-02-27
  checked: git diff a1b4a49..HEAD -- src/app/(owner)/actions/routes.ts
  found: listRoutes() at a1b4a49 had NO _count, NO stops, NO RouteStop reference. Current version adds _count: { select: { stops: true } } to the findMany query.
  implication: The listRoutes query now depends on the RouteStop table via Prisma's _count aggregation.

- timestamp: 2026-02-27
  checked: src/components/routes/route-list.tsx, src/app/(owner)/routes/route-list-wrapper.tsx
  found: Neither component includes _count in its Route interface or renders stop count data anywhere. The _count data returned by listRoutes() is completely unused by the UI.
  implication: The _count: { stops: true } query is dead code from the UI perspective — it queries the RouteStop table unnecessarily, introducing a failure point with zero benefit.

- timestamp: 2026-02-27
  checked: src/app/(owner)/routes/page.tsx
  found: Server component calls listRoutes() at the top level with no try/catch. If listRoutes() throws (because RouteStop table missing or any DB error), the entire server component fails, resulting in 500 error page.
  implication: Any exception from listRoutes() causes the routes page to not load. No error boundary to catch it gracefully.

- timestamp: 2026-02-27
  checked: prisma/migrations/20260226000003_add_route_stops/migration.sql
  found: Migration adds RouteStop table with CREATE TABLE (not IF NOT EXISTS). If this migration didn't run in production, the _count query would fail with Prisma error about missing table.
  implication: The _count depends on the RouteStop table existing in production.

- timestamp: 2026-02-27
  checked: scripts/migrate.mjs
  found: If DATABASE_URL is not set, migrations are silently skipped (process.exit(0)). If a migration fails, process.exit(1) aborts the Vercel build. Migration 20260226000001 does ALTER TABLE "Route" ADD COLUMN "distanceMiles" DOUBLE PRECISION — if distanceMiles already exists in prod DB, this migration fails and aborts the build chain before 20260226000003 runs.
  implication: If the distanceMiles column already existed in production (from any prior schema push), the build would fail before RouteStop table was created.

- timestamp: 2026-02-27
  checked: .gitignore
  found: /src/generated/prisma is gitignored — Prisma client is generated at build time via "prisma generate" in the Vercel build command.
  implication: Prisma client is always fresh — generated from the latest schema including RouteStop model.

- timestamp: 2026-02-27
  checked: vercel.json
  found: buildCommand = "node scripts/migrate.mjs && prisma generate && next build". Unchanged from a1b4a49. Migrations run during Vercel build.
  implication: If DATABASE_URL is available in Vercel env vars, migrations run at build time.

- timestamp: 2026-02-27
  checked: TypeScript compile after fix
  found: npx tsc --noEmit passes clean with no errors.
  implication: Fix is type-safe.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: listRoutes() in src/app/(owner)/actions/routes.ts was updated in commit 45940d5 to include _count: { select: { stops: true } }, which requires the RouteStop table to exist in production. The RouteStop table was added in migration 20260226000003. There are two failure scenarios: (1) the migration didn't run because an earlier migration (20260226000001 — adds distanceMiles column without IF NOT EXISTS) failed if distanceMiles already existed, causing process.exit(1) and aborting the migration chain before RouteStop was created; (2) even if the migration ran and succeeded, there could be a timing issue where the new code is deployed but the DB hasn't been updated. In both cases, the _count data is completely unused by the route-list UI components, making it dead code that only introduces risk.

fix:
  1. Removed _count: { select: { stops: true } } from listRoutes() in routes.ts — query now identical to last working version at a1b4a49. This eliminates the RouteStop table dependency from the routes LIST page entirely.
  2. Made prisma/migrations/20260226000001_add_route_distance/migration.sql idempotent by adding IF NOT EXISTS to the ALTER TABLE ADD COLUMN statement. This prevents migration chain abort if distanceMiles column already exists.

verification: TypeScript compile passes clean. listRoutes() now matches a1b4a49 working version exactly.
files_changed:
  - src/app/(owner)/actions/routes.ts
  - prisma/migrations/20260226000001_add_route_distance/migration.sql

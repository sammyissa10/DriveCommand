---
phase: quick-416
plan: "01"
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/migrations/20260530000001_add_trip_deleted_at_deleted_by_id/migration.sql
  - apps/web/prisma/migrations/20260530000001_add_trip_deleted_at_deleted_by_id/rollback.sql
autonomous: true

must_haves:
  truths:
    - "Live `dispatches` table has the `deleted_at` column (TIMESTAMPTZ NULL) after this plan completes"
    - "Live `dispatches` table has the `deleted_by_id` column (UUID NULL) after this plan completes"
    - "Re-running the Quick-415 diagnostic script reports `deleted_at` + `deleted_by_id` are no longer in MISSING_IN_DB"
    - "Production GET /api/v1/carrier/dispatches?needs_assignment=true&status=planned returns HTTP 200 (P2022 cleared)"
    - "schema.prisma is unchanged from its current state — no prisma migrate dev/deploy was run"
    - "No table other than `public.dispatches` was modified"
    - "The migration is reversible via the committed rollback.sql"
  artifacts:
    - path: "apps/web/prisma/migrations/20260530000001_add_trip_deleted_at_deleted_by_id/migration.sql"
      provides: "Forward SQL adding deleted_at (TIMESTAMPTZ NULL) and deleted_by_id (UUID NULL) to public.dispatches with self-validation"
      min_lines: 25
    - path: "apps/web/prisma/migrations/20260530000001_add_trip_deleted_at_deleted_by_id/rollback.sql"
      provides: "Reverse SQL dropping the two columns (with data-loss warning comment)"
      min_lines: 8
  key_links:
    - from: "apps/web/prisma/schema.prisma (model Trip lines 2214-2215)"
      to: "public.dispatches.deleted_at + public.dispatches.deleted_by_id"
      via: "Supabase MCP apply_migration / execute_sql"
      pattern: "ADD COLUMN IF NOT EXISTS deleted_(at|by_id)"
    - from: "apps/web/src/app/api/v1/carrier/dispatches/route.ts"
      to: "Prisma Trip.findMany including deletedAt + deletedById"
      via: "P2022 resolution — columns now present in live DB"
      pattern: "deleted_at|deleted_by_id"
---

<objective>
Apply the minimal database fix for the production P2022 error on the Trip model: add the two missing columns (`deleted_at` TIMESTAMPTZ NULL, `deleted_by_id` UUID NULL) to `public.dispatches`. Quick-415 already diagnosed the drift; this plan executes the remediation via Supabase MCP only.

Purpose: Unblock production `/api/v1/carrier/dispatches` which currently returns 500 with `Prisma.PrismaClientKnownRequestError P2022: column dispatches.deleted_at does not exist`. The columns are already declared in schema.prisma (Trip model, lines 2214-2215) — only the DB needs to catch up.

Output: A committed migration.sql + rollback.sql pair under `apps/web/prisma/migrations/20260530000001_add_trip_deleted_at_deleted_by_id/`, applied to the live DB via Supabase MCP, with the Quick-415 diagnostic re-run confirming zero drift and a 200 response from the previously-failing endpoint.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md

# Quick-415 diagnostic findings (drift confirmed: deleted_at + deleted_by_id missing on dispatches)
@.planning/quick/415-diagnose-trip-model-column-drift-causing/415-SUMMARY.md

# Existing diagnostic script — re-run in Task 3 to verify the fix
@apps/web/scripts/audit/diagnose-trip-column-drift.ts

# Source of truth for the Trip model column types (do NOT edit)
@apps/web/prisma/schema.prisma

# The migration that intended to add deleted_at to dispatches (block at lines 63-67) but apparently never applied in production — establishes column type (TIMESTAMPTZ(6)) and the existing index idx_dispatches_org_id_deleted_at (line 191) which we MUST NOT recreate
@apps/web/prisma/migrations/20260515000001_db_security_standardization/migration.sql
</context>

<tasks>

<task type="auto">
  <name>Task 1: Author forward + rollback migration SQL files</name>
  <files>
apps/web/prisma/migrations/20260530000001_add_trip_deleted_at_deleted_by_id/migration.sql
apps/web/prisma/migrations/20260530000001_add_trip_deleted_at_deleted_by_id/rollback.sql
  </files>
  <action>
Create a new migration directory under `apps/web/prisma/migrations/` named `20260530000001_add_trip_deleted_at_deleted_by_id/` and write two SQL files inside it.

**File 1: `migration.sql`** — forward migration.

Required structure (in this exact order):

```sql
-- Migration: Quick-416 — Add missing Trip soft-delete columns to public.dispatches
-- Reason: schema.prisma (model Trip, lines 2214-2215) declares deletedAt + deletedById,
--         but the live DB is missing both columns, causing Prisma P2022 in
--         /api/v1/carrier/dispatches. Quick-415 diagnostic confirmed the drift.
-- Scope:  TWO columns on ONE table (public.dispatches). No other table touched.
-- Types:  deleted_at  = TIMESTAMPTZ(6) NULL   — matches existing pattern in
--                                              20260515000001_db_security_standardization
--                                              (e.g. loads.deleted_at, clients.deleted_at)
--         deleted_by_id = UUID NULL           — matches schema.prisma `String? @db.Uuid`
-- Index:  idx_dispatches_org_id_deleted_at ALREADY EXISTS (created by 20260515000001 line 191).
--         No new index is created here.
-- Nullable: Both columns are NULL — 267+ existing dispatch rows must back-fill cleanly.

BEGIN;

-- 1. Add columns (idempotent — safe to re-run)
ALTER TABLE public.dispatches
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ(6) NULL;

ALTER TABLE public.dispatches
  ADD COLUMN IF NOT EXISTS deleted_by_id UUID NULL;

-- 2. Self-validation block — abort the transaction if the columns are not present after the ALTERs.
DO $$
DECLARE
  has_deleted_at  BOOLEAN;
  has_deleted_by  BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'dispatches'
      AND column_name  = 'deleted_at'
  ) INTO has_deleted_at;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'dispatches'
      AND column_name  = 'deleted_by_id'
  ) INTO has_deleted_by;

  IF NOT has_deleted_at THEN
    RAISE EXCEPTION 'Quick-416: public.dispatches.deleted_at is still missing after ALTER — aborting';
  END IF;

  IF NOT has_deleted_by THEN
    RAISE EXCEPTION 'Quick-416: public.dispatches.deleted_by_id is still missing after ALTER — aborting';
  END IF;
END $$;

COMMIT;
```

**File 2: `rollback.sql`** — reverse migration (manual-use only, not auto-applied).

```sql
-- Rollback for Quick-416 — Remove deleted_at + deleted_by_id from public.dispatches.
--
-- WARNING: This rollback PERMANENTLY DROPS the two columns and any data they
-- contain. If any rows were soft-deleted (deleted_at IS NOT NULL) between the
-- forward migration and this rollback, that data will be lost. Verify with:
--   SELECT count(*) FROM public.dispatches WHERE deleted_at IS NOT NULL;
-- before running.
--
-- This file is NOT applied automatically — invoke manually via Supabase MCP if
-- a rollback is required.

BEGIN;

ALTER TABLE public.dispatches DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE public.dispatches DROP COLUMN IF EXISTS deleted_by_id;

COMMIT;
```

**Constraints (enforce in the SQL + file contents):**
- DO NOT edit `apps/web/prisma/schema.prisma`. The schema is already correct.
- DO NOT run `prisma migrate dev` or `prisma migrate deploy`. These files are hand-authored only; Supabase MCP applies them in Task 2.
- DO NOT touch any table other than `public.dispatches`. No CASCADE, no related FK additions, no triggers.
- DO NOT add a new index. `idx_dispatches_org_id_deleted_at` was already created by migration `20260515000001_db_security_standardization` at line 191 and CREATE INDEX uses IF NOT EXISTS, so it survives independent of column existence (it would have errored otherwise — confirm by re-reading line 191 if uncertain).
- DO NOT add a foreign key on `deleted_by_id` in this plan. schema.prisma already declares `User?` via `@relation(name: "TripDeletedBy", ...)` but the FK constraint at the DB level is out of scope for this minimal-fix quick task. Adding it would require validating no orphan UUIDs exist and is a separate concern.
- The forward migration MUST be wrapped in `BEGIN/COMMIT` so the self-validation can abort cleanly.
- The forward migration's `DO $$ ... END $$` block MUST `RAISE EXCEPTION` (not just `RAISE NOTICE`) when either column is missing — this is what makes the self-validation actually block a bad commit.

**Verify file shape before declaring done:**
- Both files exist in `apps/web/prisma/migrations/20260530000001_add_trip_deleted_at_deleted_by_id/`
- `migration.sql` contains: `BEGIN;`, `ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ(6) NULL`, `ADD COLUMN IF NOT EXISTS deleted_by_id UUID NULL`, a `DO $$ ... RAISE EXCEPTION ... END $$;` validation block, `COMMIT;`
- `rollback.sql` contains: `BEGIN;`, `DROP COLUMN IF EXISTS deleted_at`, `DROP COLUMN IF EXISTS deleted_by_id`, `COMMIT;`, and the explicit data-loss warning comment.
- Neither file references any table other than `public.dispatches`.
  </action>
  <verify>
1. `git status` must show exactly two new files, both under `apps/web/prisma/migrations/20260530000001_add_trip_deleted_at_deleted_by_id/`. No other tracked file modified.
2. Grep the new `migration.sql` for `ALTER TABLE` — must return exactly two lines, both targeting `public.dispatches`.
3. Grep the new `migration.sql` for `RAISE EXCEPTION` — must return at least two hits (one per column).
4. `grep -E '(loads|clients|facilities|carrier_drivers|carrier_trucks|route_templates|contracts|trips|users)' migration.sql rollback.sql` must return zero hits — confirms no other table touched.
5. `schema.prisma` diff against HEAD: zero changes.
  </verify>
  <done>
- Two new SQL files committed to `apps/web/prisma/migrations/20260530000001_add_trip_deleted_at_deleted_by_id/`.
- Forward migration is BEGIN/COMMIT-wrapped, adds both columns with `IF NOT EXISTS`, and contains a `RAISE EXCEPTION` self-validation block for each column.
- Rollback is BEGIN/COMMIT-wrapped with a clear data-loss warning comment.
- `schema.prisma`, all other migration files, and all application source remain untouched.
  </done>
</task>

<task type="auto">
  <name>Task 2: Apply forward migration to live DB via Supabase MCP</name>
  <files>(no source files — DB-only operation)</files>
  <action>
Apply the forward `migration.sql` from Task 1 to the live Supabase database via the Supabase MCP server. Do NOT use `prisma migrate deploy` — direct MCP only, per task constraints.

**Step A — Pre-flight baseline query** (via `mcp__claude_ai_Supabase__execute_sql`):

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'dispatches'
  AND column_name IN ('deleted_at', 'deleted_by_id')
ORDER BY column_name;
```

Expected result BEFORE the migration: **0 rows** (this is what Quick-415 confirmed). If 1 or 2 rows come back, the columns already exist — stop and report that the migration is a no-op, then proceed to verification in Task 3 anyway to confirm the endpoint works.

**Step B — Apply the migration** (via `mcp__claude_ai_Supabase__apply_migration`):

- `name`: `add_trip_deleted_at_deleted_by_id`
- `query`: the full contents of the `migration.sql` file authored in Task 1 (BEGIN/COMMIT block included — the MCP tool wraps in its own transaction, but the inner BEGIN/COMMIT is still required so the file can also be applied manually via `psql` if needed). If the MCP rejects nested transactions, fall back to `execute_sql` with the file contents and observe the same self-validation behavior.

If the apply call returns an error from the `RAISE EXCEPTION` block, STOP immediately and surface the error — this means one of the columns failed to add and the migration is not safe to retry without diagnosis.

**Step C — Post-apply confirmation query** (via `mcp__claude_ai_Supabase__execute_sql`):

```sql
SELECT column_name, data_type, udt_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'dispatches'
  AND column_name IN ('deleted_at', 'deleted_by_id')
ORDER BY column_name;
```

Expected result AFTER the migration: **exactly 2 rows**:

| column_name | data_type | udt_name | is_nullable |
|---|---|---|---|
| `deleted_at` | `timestamp with time zone` | `timestamptz` | `YES` |
| `deleted_by_id` | `uuid` | `uuid` | `YES` |

**Step D — Sanity check (no row-count regression):**

```sql
SELECT count(*) AS total_dispatches,
       count(*) FILTER (WHERE deleted_at IS NULL) AS active_dispatches
FROM public.dispatches;
```

`total_dispatches` must match the pre-migration count (267+ per task description). `active_dispatches` should equal `total_dispatches` because no row was soft-deleted yet.

**STOP-AND-SURFACE condition:** If `total_dispatches` dropped, the index existence query fails, or either column is missing after Step C, STOP. Do NOT proceed to Task 3. Surface the diagnostic finding and recommend running the rollback.

**Constraints:**
- DO NOT run `prisma migrate deploy` or `prisma migrate dev`.
- DO NOT modify any other table.
- DO NOT touch any RLS policy, role grant, or trigger.
- If the project has multiple Supabase environments, target the production project ID consistent with prior quick tasks (Quick-413, Quick-414 used the same project — re-use that ID).
  </action>
  <verify>
1. Step A returned 0 rows pre-apply (or already-applied — handled).
2. The `apply_migration` call returned success (no `RAISE EXCEPTION` thrown).
3. Step C returned exactly 2 rows with `is_nullable = YES`, `udt_name = timestamptz` for `deleted_at`, `udt_name = uuid` for `deleted_by_id`.
4. Step D shows `total_dispatches` unchanged vs the pre-migration count and `active_dispatches = total_dispatches`.
  </verify>
  <done>
- Live `public.dispatches` table has both `deleted_at` (TIMESTAMPTZ NULL) and `deleted_by_id` (UUID NULL).
- All existing 267+ dispatch rows are still present with NULL in both new columns.
- No `RAISE EXCEPTION` was thrown.
- No other table or DB object was modified.
  </done>
</task>

<task type="auto">
  <name>Task 3: Re-run drift diagnostic + smoke check the failing endpoint</name>
  <files>(no source files modified — verification only; may create `.planning/quick/416-add-deleted-at-deleted-by-id-to-disp/416-SUMMARY.md` as the final write)</files>
  <action>
Verify the Task 2 DB change cleared the production P2022 by re-running the Quick-415 diagnostic and hitting the previously-failing API endpoint. This task writes NO source code — it only runs scripts, captures output, and produces the SUMMARY.

**Step 1 — Re-run the Quick-415 diagnostic script.**

From `apps/web` (use the Bash tool with this exact command):
```bash
cd apps/web && npx tsx --env-file=.env.local scripts/audit/diagnose-trip-column-drift.ts
```

Capture the full SECTION 3 (Diff) output. Required signal:
- `MISSING_IN_DB` MUST NOT contain `deleted_at` or `deleted_by_id`.
- Ideal signal: SECTION 3 prints "NO DRIFT — schema matches DB" — confirms the entire Trip model is now aligned.
- If `MISSING_IN_DB` still contains OTHER columns (e.g. `created_by_id`, `updated_by_id` — also marked Wave 2 in schema.prisma but explicitly out of scope per the task constraints), record those names in the SUMMARY as a follow-up Quick task candidate and continue — do NOT extend this task to fix them.
- If `MISSING_IN_DB` still contains `deleted_at` or `deleted_by_id`, STOP. The MCP apply in Task 2 went to the wrong environment or silently rolled back. Re-check the Supabase project ID against Quick-413/Quick-414 and re-run Task 2 Step C.

**Step 2 — Production endpoint smoke check.**

Confirm the endpoint that was returning 500 now returns 200. Two approaches — use whichever is available:

(a) If a production base URL + auth token are available in `.env.local` or a known sysadmin credential, run a curl against production:
```bash
curl -i -H "Authorization: Bearer ${AUTH_TOKEN}" \
  "${BASE_URL}/api/v1/carrier/dispatches?needs_assignment=true&status=planned"
```

(b) If credentials are not available to the executor, run against `localhost:3000` instead with an authenticated browser session token — same endpoint path. The signal is identical: status 200, body is valid JSON, no Prisma error in the response.

Capture the response status line. Required signal: **HTTP/1.1 200 OK** (or HTTP/2 200) and a JSON body. If 500 persists with a P2022 mentioning `deleted_at` or `deleted_by_id`, STOP and surface — the DB change may not have propagated to the runtime's Prisma client cache (Vercel may need a redeploy or a runtime restart). If 500 persists with P2022 on a DIFFERENT column, record it in the SUMMARY as out-of-scope follow-up.

If neither (a) nor (b) is possible from the executor's environment (no token, no running dev server, no curl reachability), explicitly note this in the SUMMARY with the exact curl command for the user to run manually, and capture the post-apply DB verification output (Task 2 Step C result) as the primary evidence that the columns now exist.

**Step 3 — Zero side-effect confirmation.**

Run `git status` and confirm only the two new SQL files under `apps/web/prisma/migrations/20260530000001_add_trip_deleted_at_deleted_by_id/` are present as new files. No modifications to tracked files. No edits to `schema.prisma`, `apps/web/src/`, or other migrations.

**Step 4 — Write `.planning/quick/416-add-deleted-at-deleted-by-id-to-disp/416-SUMMARY.md`.**

The SUMMARY must include:
- Frontmatter (phase, plan, subsystem, tags, dependency_graph, tech_stack, key_files, decisions, metrics) — match the shape of `415-SUMMARY.md`.
- The exact SQL applied (paste from `migration.sql`).
- Pre-apply baseline query result (rows = 0) and post-apply confirmation result (rows = 2 with column types).
- The full SECTION 3 (Diff) output from the Quick-415 diagnostic re-run.
- The HTTP status returned by `/api/v1/carrier/dispatches?needs_assignment=true&status=planned` (before vs after — "before" sourced from the task description, "after" from Step 2).
- Any out-of-scope drift surfaced in Step 1 (e.g. `created_by_id` / `updated_by_id` if also missing) — log as follow-up Quick task candidates with a one-line description each. Do NOT include fix recommendations beyond column names.
- Explicit confirmation that no other table was modified and `schema.prisma` is unchanged.
- Self-Check section listing the two new SQL files + the git commit hash.

**Constraints:**
- DO NOT edit `schema.prisma`, application source, or any other migration in this task.
- DO NOT run `prisma migrate deploy` or `prisma migrate dev`.
- DO NOT widen scope to fix any out-of-scope drift surfaced during Step 1 — record only.
- The SUMMARY is a write-only artifact under `.planning/`; nothing under `apps/` may be modified.
  </action>
  <verify>
1. Diagnostic re-run output captured. `MISSING_IN_DB` does NOT list `deleted_at` or `deleted_by_id`.
2. Endpoint smoke check returned HTTP 200 (or the executor explicitly documented inability to reach the endpoint with the exact curl command for the user to run, alongside the DB-level evidence from Task 2 Step C).
3. `git status` shows only the two new SQL files (Task 1) plus the new SUMMARY under `.planning/quick/416-.../416-SUMMARY.md`. No other change.
4. `.planning/quick/416-add-deleted-at-deleted-by-id-to-disp/416-SUMMARY.md` exists with all required sections.
5. `schema.prisma` is byte-identical to HEAD.
  </verify>
  <done>
- Quick-415 diagnostic confirms the two scoped columns are no longer drifted.
- Endpoint smoke check returned 200 (or DB-level evidence + explicit user-runnable curl command documented).
- SUMMARY.md is written and committed.
- Zero changes to `apps/web/src/`, `schema.prisma`, or any unrelated migration directory.
  </done>
</task>

</tasks>

<verification>
- Two new files committed under `apps/web/prisma/migrations/20260530000001_add_trip_deleted_at_deleted_by_id/`.
- Quick-415 diagnostic re-run confirms `deleted_at` + `deleted_by_id` are no longer in `MISSING_IN_DB`.
- `/api/v1/carrier/dispatches?needs_assignment=true&status=planned` returns HTTP 200 in production (or DB-level evidence captured if endpoint reachability is blocked from the executor's environment).
- `schema.prisma` and all source code under `apps/web/src/` remain unchanged.
- No other DB table was modified.
- `.planning/quick/416-add-deleted-at-deleted-by-id-to-disp/416-SUMMARY.md` exists with all required sections.
</verification>

<success_criteria>
- Production P2022 on `dispatches.deleted_at` is cleared.
- Trip column drift is zero (for the two scoped columns).
- Migration is fully reversible via the committed rollback.sql.
- The fix touched zero application code — DB-only change applied via Supabase MCP.
- Any additional drift surfaced (e.g. `created_by_id`, `updated_by_id`) is recorded as a follow-up Quick task candidate, NOT fixed in this task.
</success_criteria>

<output>
After completion, create `.planning/quick/416-add-deleted-at-deleted-by-id-to-disp/416-SUMMARY.md` (this is performed by Task 3) documenting:
- The exact SQL applied (paste from `migration.sql`).
- The pre-apply baseline query result (rows = 0) and the post-apply confirmation result (rows = 2 with column types).
- The Quick-415 diagnostic re-run output — confirming zero drift for the two scoped columns.
- The HTTP status returned by `/api/v1/carrier/dispatches?needs_assignment=true&status=planned` (before vs after).
- Any out-of-scope drift surfaced during Task 3 Step 1 (e.g. `created_by_id` / `updated_by_id` if also missing) — log as a follow-up Quick task candidate, do NOT fix in this task.
- Confirmation that no other table was modified and `schema.prisma` is unchanged.
</output>

---
phase: quick-419
plan: 419
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/migrations/[timestamp]_phase1_grant_app_user_dml/migration.sql
  - apps/web/prisma/migrations/[timestamp]_phase1_grant_app_user_dml/rollback.sql
  - apps/web/scripts/audit/verify-phase1-grants.ts
autonomous: true

must_haves:
  truths:
    - "app_user has SELECT, INSERT, UPDATE, DELETE on every tenant-scoped FORCE-RLS table in public schema (excluding Section 4.12 allowlist)"
    - "Tenant has SELECT, INSERT, UPDATE, DELETE granted to app_user (was SELECT only)"
    - "audit_log has SELECT, INSERT, UPDATE, DELETE granted to app_user (was SELECT+INSERT only)"
    - "Production behavior is unchanged — postgres still connects, still BYPASSRLS"
    - "Section 4.12 allowlist tables receive ZERO new grants"
    - "Migration is single transaction with DO $$ self-validation block"
    - "Rollback file restores pre-migration grant state exactly"
    - "verify-phase1-grants.ts confirms zero remaining gaps and runs read-only"
    - "test-advisor-fix-isolation.ts still passes at 14/15+ (no regression)"
    - "tsc --noEmit shows ≤35 errors (no new TS regressions)"
  artifacts:
    - path: "apps/web/prisma/migrations/[timestamp]_phase1_grant_app_user_dml/migration.sql"
      provides: "Single-transaction GRANT migration with self-validation"
      contains: "BEGIN; ... GRANT SELECT, INSERT, UPDATE, DELETE ... DO $$ ... COMMIT;"
    - path: "apps/web/prisma/migrations/[timestamp]_phase1_grant_app_user_dml/rollback.sql"
      provides: "Inverse REVOKE statements restoring pre-migration state"
      contains: "BEGIN; REVOKE ... COMMIT;"
    - path: "apps/web/scripts/audit/verify-phase1-grants.ts"
      provides: "Read-only verification of post-migration grant state"
      contains: "information_schema.role_table_grants"
  key_links:
    - from: "app-user-grant-audit.ts query (49 tables + 2 partials)"
      to: "migration.sql GRANT statements"
      via: "live DB re-run before writing migration"
      pattern: "GRANT SELECT, INSERT, UPDATE, DELETE ON .* TO app_user"
    - from: "migration.sql"
      to: "Supabase production DB"
      via: "Supabase MCP apply_migration"
      pattern: "phase1_grant_app_user_dml"
    - from: "verify-phase1-grants.ts"
      to: "post-migration state"
      via: "npx tsx --env-file=.env.local"
      pattern: "ALL GRANTS PRESENT"
---

<objective>
Quick-419 — Phase 1: Grant app_user the four DML privileges (SELECT, INSERT, UPDATE, DELETE) on every tenant-scoped FORCE-RLS table in the public schema, closing the grant gap surfaced by Quick-414. This is purely additive: production continues to connect as the postgres superuser (BYPASSRLS=true), so RLS is not yet enforced — but the database becomes ready for a future Phase 2 cutover to app_user.

Purpose: Section 2.4 of the DatabaseSecurity_MultiTenant_Spec mandates that the app connect as app_user with DML on tenant-scoped tables and never BYPASSRLS. Quick-414 found 49 tables with zero grants plus 2 with partial grants. Phase 1 closes that gap without changing application behavior, so Phase 2 (the DATABASE_URL cutover) can be flipped safely.

Output: One Prisma migration directory containing migration.sql + rollback.sql, one verify script, applied state in production DB.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Spec — Section 2.4 (app_user DML, never BYPASSRLS) and Section 4.12 (allowlist)
@docs/specs/DatabaseSecurity_MultiTenant_Spec_v1.md

# Quick-414 audit — defines the 49+2 target set
@apps/web/scripts/audit/app-user-grant-audit.ts

# Pattern reference — Quick-410 migration (single tx, DO $$ self-validation, app_user GRANTS)
@apps/web/prisma/migrations/20260527000001_quick410_advisor_rls_fix/migration.sql
@apps/web/prisma/migrations/20260527000001_quick410_advisor_rls_fix/rollback.sql

# Pattern reference — Quick-410 verify script (read-only, pg_catalog + information_schema)
@apps/web/scripts/audit/verify-advisor-fix.ts

# Regression gates
@apps/web/scripts/audit/test-advisor-fix-isolation.ts

# Schema (read-only — DO NOT modify)
@apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Re-run grant audit live + write migration + rollback</name>
  <files>
    apps/web/prisma/migrations/[timestamp]_phase1_grant_app_user_dml/migration.sql
    apps/web/prisma/migrations/[timestamp]_phase1_grant_app_user_dml/rollback.sql
  </files>
  <action>
    1. Pick the migration timestamp using the next sequential number AFTER the latest existing migration. Latest is 20260530000002_add_soft_delete_columns_drift_fix, so use 20260602000001_phase1_grant_app_user_dml (today's date, sequence 001). Create the directory at apps/web/prisma/migrations/20260602000001_phase1_grant_app_user_dml/.

    2. RE-RUN the grant audit LIVE against the production DB to get the authoritative current state. Run from apps/web/:
         npx tsx --env-file=.env.local scripts/audit/app-user-grant-audit.ts > /tmp/quick419-audit-live.txt 2>&1
       Read /tmp/quick419-audit-live.txt and extract:
         (a) the table list with missing_count > 0 — these are the targets
         (b) the exact privileges missing per table (e.g., Tenant: missing INSERT, UPDATE, DELETE; audit_log: missing UPDATE, DELETE)
       Do NOT trust the 49+2 number from the original Quick-414 doc — use the LIVE number. Quick-417/418 may have added new tables since Quick-414 ran.

    3. Verify NONE of the live target tables overlap with the Section 4.12 allowlist. The allowlist is:
         _prisma_migrations, Plan, Promo, carrier_catalog_meta,
         NotificationTemplate, NotificationEmailConfig, grid_preference, grid_view
       Note: app-user-grant-audit.ts already excludes _prisma_migrations from its query, but the other 7 allowlist tables MAY appear in the audit results (they have RLS on for other reasons). For ANY allowlist table appearing in the audit, EXCLUDE it from the migration. Document the exclusions in a comment at the top of migration.sql.

    4. Write apps/web/prisma/migrations/20260602000001_phase1_grant_app_user_dml/migration.sql following the EXACT Quick-410 pattern:
         - Header comment block citing: Quick-419 Phase 1, Spec Section 2.4, audit script path, allowlist exclusions, and the additive/no-behavior-change statement
         - Single BEGIN; ... COMMIT; transaction
         - For tables COMPLETELY missing all 4 grants: a single line
             GRANT SELECT, INSERT, UPDATE, DELETE ON "{table}" TO app_user;
         - For tables with PARTIAL grants (Tenant, audit_log, etc.): grant ONLY the missing ones (e.g., GRANT INSERT, UPDATE, DELETE ON "Tenant" TO app_user; — NOT SELECT, which already exists). This keeps the migration minimal and surgical.
         - QUOTING RULE: Mixed-case table names (Tenant, TicketMessage, User, etc.) MUST be double-quoted. snake_case names (carrier_documents, audit_log, etc.) are unquoted. Match the audit output exactly — pg_class.relname returns names in their actual stored case.
         - Order tables alphabetically within the GRANT block for diffability
         - DO $$ self-validation block at the end that:
             (a) counts tables in the public schema with FORCE RLS = true that are missing ANY of SELECT, INSERT, UPDATE, DELETE for app_user (excluding the 4.12 allowlist) — assert count = 0
             (b) RAISE EXCEPTION 'quick-419: % tenant-scoped table(s) still missing app_user grants', missing_count IF count > 0
           Reuse the same query shape from app-user-grant-audit.ts — JOIN pg_class with information_schema.role_table_grants on grantee='app_user', GROUP BY relname, HAVING bool_or() checks. Wrap in an outer aggregate that returns one COUNT(*) of incomplete tables.
         - End with COMMIT;

    5. Write apps/web/prisma/migrations/20260602000001_phase1_grant_app_user_dml/rollback.sql:
         - Header comment block: inverse of migration.sql; restores exact pre-migration grant state
         - Single BEGIN; ... COMMIT; transaction
         - For each table COMPLETELY missing all 4 grants (now granted): REVOKE SELECT, INSERT, UPDATE, DELETE ON "{table}" FROM app_user;
         - For partial-grant tables: REVOKE ONLY the privileges this migration ADDED (e.g., REVOKE INSERT, UPDATE, DELETE ON "Tenant" FROM app_user; — keep SELECT)
         - No DO $$ validation block needed in rollback (best-effort restoration)
         - Same alphabetical ordering, same quoting rules
         - End with COMMIT;

    6. DO NOT apply the migration yet. Task 2 applies it.

    Files NOT to touch in this task:
      - apps/web/prisma/schema.prisma (zero changes — grants are not in the Prisma schema)
      - apps/web/src/lib/db/prisma.ts (Phase 2 problem)
      - any application code, environment variables, or DATABASE_URL handling

    Section 4.12 allowlist tables that MUST NOT receive grants in this migration:
      _prisma_migrations, Plan, Promo, carrier_catalog_meta,
      NotificationTemplate, NotificationEmailConfig, grid_preference, grid_view
  </action>
  <verify>
    1. ls apps/web/prisma/migrations/20260602000001_phase1_grant_app_user_dml/ shows migration.sql + rollback.sql (no other files)
    2. /tmp/quick419-audit-live.txt exists and is non-empty
    3. grep -i "Plan\|Promo\|carrier_catalog_meta\|NotificationTemplate\|NotificationEmailConfig\|grid_preference\|grid_view\|_prisma_migrations" migration.sql returns matches ONLY inside comment lines (-- prefix), NEVER in GRANT statements
    4. grep -c "^GRANT" migration.sql matches the number of distinct target tables identified in step 2 of the action
    5. migration.sql contains exactly one BEGIN; and one COMMIT;
    6. migration.sql contains a DO $$ block with RAISE EXCEPTION
    7. rollback.sql contains exactly one BEGIN; and one COMMIT;
    8. grep -c "^REVOKE" rollback.sql equals grep -c "^GRANT" migration.sql (symmetric inverse)
  </verify>
  <done>
    Migration SQL and rollback SQL drafted on disk under apps/web/prisma/migrations/20260602000001_phase1_grant_app_user_dml/. Files are NOT yet applied to the database. Audit re-run output saved to /tmp/quick419-audit-live.txt for traceability. Allowlist tables excluded with documenting comments.
  </done>
</task>

<task type="auto">
  <name>Task 2: Apply migration via Supabase MCP + write and run verify script + regression gates</name>
  <files>
    apps/web/scripts/audit/verify-phase1-grants.ts
  </files>
  <action>
    1. Apply the migration to production via Supabase MCP. The auto-apply hook may fire on migration.sql write — check whether it already ran by querying the live DB for one expected grant (e.g., SELECT 1 FROM information_schema.role_table_grants WHERE grantee='app_user' AND table_name='Tenant' AND privilege_type='INSERT';). If the hook did NOT apply it, call the Supabase MCP apply_migration tool with:
         name: phase1_grant_app_user_dml
         query: <contents of migration.sql, MINUS the BEGIN; and COMMIT; lines — Supabase MCP wraps it in a transaction itself>
       NOTE: Per memory, Supabase MCP apply_migration is the canonical apply path for this project. If the apply errors, capture the full error message and run the rollback.sql IMMEDIATELY via Supabase MCP execute_sql, then stop and surface the error in the SUMMARY — do not retry blindly.

    2. Write apps/web/scripts/audit/verify-phase1-grants.ts modeled on verify-advisor-fix.ts and app-user-grant-audit.ts:
         - Header comment block: purpose, READ-ONLY guarantee (only SELECTs against pg_catalog and information_schema), run command (npx tsx --env-file=.env.local scripts/audit/verify-phase1-grants.ts)
         - Connection block: identical to app-user-grant-audit.ts (Pool + PrismaPg + PrismaClient using process.env.DATABASE_URL)
         - Single $queryRawUnsafe replicating the audit query: tenant-scoped FORCE-RLS tables in public, LEFT JOIN role_table_grants for app_user, bool_or on SELECT/INSERT/UPDATE/DELETE, excluding _prisma_migrations AND the Section 4.12 allowlist (Plan, Promo, carrier_catalog_meta, NotificationTemplate, NotificationEmailConfig, grid_preference, grid_view) in the WHERE clause (c.relname NOT IN (...))
         - Compute missing_count per row; partition into PASS (missing_count=0) and FAIL (missing_count>0)
         - Print:
             === PHASE 1 GRANT VERIFICATION ===
             Total tenant-scoped tables checked (excluding Section 4.12 allowlist): N
             Tables with ALL four grants: M
             Tables still missing at least one grant: K
         - If K > 0: print each failing table + the missing privileges, then process.exit(1)
         - If K = 0: print "ALL GRANTS PRESENT — Phase 1 complete." and exit 0
         - process.exit(1) on any thrown error from the query
         - finally { await prisma.$disconnect(); await pool.end(); }

    3. Run verify-phase1-grants.ts from apps/web/:
         npx tsx --env-file=.env.local scripts/audit/verify-phase1-grants.ts
       Required outcome: prints "ALL GRANTS PRESENT — Phase 1 complete." with exit code 0.
       If it reports gaps: STOP. Apply rollback.sql via Supabase MCP execute_sql IMMEDIATELY. Then update SUMMARY noting the failure and which tables remain.

    4. Run the regression gate — RLS isolation test — from apps/web/:
         npx tsx --env-file=.env.local scripts/audit/test-advisor-fix-isolation.ts
       Required outcome: 14/15 or better passing (matches Quick-410 baseline). If pass count regresses, STOP and surface in SUMMARY — but do NOT rollback Phase 1, since grants are additive and cannot cause isolation regressions (the regression would point to drift unrelated to this task).
       NOTE: Quick-413 documented a pooled-reuse leak as a known issue — that leak still being present is EXPECTED and is NOT a Phase 1 failure.

    5. Run TypeScript baseline check from repo root:
         npx tsc --noEmit -p apps/web 2>&1 | tee /tmp/quick419-tsc.txt
       Count errors:
         grep -c "error TS" /tmp/quick419-tsc.txt
       Required outcome: count is ≤ 35 (the documented baseline). If count > 35, identify which new file(s) cause the regression — must be verify-phase1-grants.ts only, and must be fixable (likely missing types). Fix and re-run until count ≤ 35.

    6. Smoke check production: hit a known protected endpoint that uses the existing postgres-bypass DATABASE_URL connection. Since Phase 1 only ADDS grants and does not change DATABASE_URL or prisma.ts, production behavior MUST be unchanged. Suggested smoke endpoint: GET https://drivecommand.app/api/health (if it exists) OR a publicly verifiable owner-portal route returning 200 (use curl -sI <url>). Required outcome: 200 (or whatever the pre-migration status was). Any 5xx after migration apply means rollback NOW via Supabase MCP execute_sql with rollback.sql contents.

    Files NOT to touch in this task:
      - apps/web/prisma/schema.prisma
      - apps/web/src/lib/db/prisma.ts
      - .env.local or any DATABASE_URL_* env var
      - any /api route, server action, or application source file
  </action>
  <verify>
    1. Live DB check via Supabase MCP execute_sql:
         SELECT COUNT(*) FROM information_schema.role_table_grants
         WHERE grantee='app_user' AND table_name='Tenant' AND privilege_type IN ('INSERT','UPDATE','DELETE');
       Returns 3 (was 0 before migration)
    2. verify-phase1-grants.ts exits 0 with "ALL GRANTS PRESENT" message
    3. test-advisor-fix-isolation.ts passes ≥14/15
    4. /tmp/quick419-tsc.txt error count ≤ 35
    5. Production smoke endpoint returns same status as pre-migration (200 expected)
    6. ls apps/web/scripts/audit/verify-phase1-grants.ts exists and is non-empty
  </verify>
  <done>
    Migration applied to production. verify-phase1-grants.ts confirms zero remaining gaps. Isolation regression test passes at baseline. TypeScript error count unchanged from 35-baseline. Production endpoint healthy. Phase 1 done — DB is grant-ready for a future Phase 2 DATABASE_URL cutover. Production behavior is unchanged (postgres still BYPASSRLS).
  </done>
</task>

</tasks>

<verification>

# Overall checks for Quick-419 Phase 1

1. **Live grant verification**:
   ```
   cd apps/web && npx tsx --env-file=.env.local scripts/audit/verify-phase1-grants.ts
   ```
   Must print "ALL GRANTS PRESENT — Phase 1 complete." and exit 0.

2. **Regression — Quick-414 audit should now show zero gaps**:
   ```
   cd apps/web && npx tsx --env-file=.env.local scripts/audit/app-user-grant-audit.ts
   ```
   ACTION LIST must report "(none — all grants are in place)" for all non-allowlist tables.

3. **Regression — RLS isolation test holds at baseline**:
   ```
   cd apps/web && npx tsx --env-file=.env.local scripts/audit/test-advisor-fix-isolation.ts
   ```
   ≥14/15 passing (known pooled-reuse leak is acceptable per Quick-413 memory).

4. **TypeScript baseline check**:
   ```
   npx tsc --noEmit -p apps/web 2>&1 | grep -c "error TS"
   ```
   ≤ 35 errors.

5. **Section 4.12 allowlist NEVER touched** — manual grep:
   ```
   grep -E "(Plan|Promo|carrier_catalog_meta|NotificationTemplate|NotificationEmailConfig|grid_preference|grid_view)" \
     apps/web/prisma/migrations/20260602000001_phase1_grant_app_user_dml/migration.sql
   ```
   Matches must appear ONLY in `--` comment lines, NEVER inside a GRANT statement.

6. **Production behavior unchanged** — smoke a known endpoint pre and post:
   ```
   curl -sI https://drivecommand.app/api/health
   ```
   Same status code as before migration.

</verification>

<success_criteria>

- [ ] apps/web/prisma/migrations/20260602000001_phase1_grant_app_user_dml/migration.sql exists, single transaction, with DO $$ self-validation, alphabetically ordered GRANTs, allowlist excluded with explanatory comments
- [ ] apps/web/prisma/migrations/20260602000001_phase1_grant_app_user_dml/rollback.sql exists, symmetric inverse REVOKEs, single transaction
- [ ] Migration applied to production Supabase DB
- [ ] apps/web/scripts/audit/verify-phase1-grants.ts exists, read-only, exits 0 with "ALL GRANTS PRESENT"
- [ ] Quick-414 grant audit (re-run) reports zero non-allowlist gaps
- [ ] test-advisor-fix-isolation.ts passes ≥14/15 (no regression)
- [ ] tsc --noEmit error count ≤ 35 (no regression)
- [ ] Production smoke endpoint returns same status as before migration
- [ ] Section 4.12 allowlist tables (_prisma_migrations, Plan, Promo, carrier_catalog_meta, NotificationTemplate, NotificationEmailConfig, grid_preference, grid_view) received ZERO grants
- [ ] No changes to prisma/schema.prisma, prisma.ts, DATABASE_URL, or any application code
- [ ] Single commit: "feat(quick-419): Phase 1 — grant app_user DML on tenant-scoped tables (additive, no behavior change)" with files-list pointing only to migration.sql, rollback.sql, verify-phase1-grants.ts, and the SUMMARY.md

</success_criteria>

<output>
After completion, create `.planning/quick/419-phase-1-grant-app-user-dml-on-49-tenant-/419-SUMMARY.md` covering:
- Live audit count: total tenant-scoped FORCE-RLS tables found, broken down by missing_count
- Final target table list (exact count + any allowlist exclusions made)
- Migration applied? yes/no + timestamp + Supabase MCP confirmation
- verify-phase1-grants.ts output (final line)
- Isolation test pass count (X/15)
- tsc error count (must be ≤35)
- Production smoke status
- Files created (paths) and files NOT touched (proof of scope discipline)
- Commit SHA
- Next step: Phase 2 will flip DATABASE_URL to app_user (separate quick task — DO NOT chain here)
</output>

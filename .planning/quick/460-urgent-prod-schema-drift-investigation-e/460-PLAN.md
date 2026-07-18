---
phase: quick-460
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true

must_haves:
  truths:
    - "Every prod table/column gap vs schema.prisma is enumerated with evidence"
    - "CarrierDriver (carrier_drivers) existence + per-column diff is confirmed against prod"
    - "Each QT 453-456 migration is marked applied or not-applied with proof from _prisma_migrations"
    - "trigger vs triggerKey (@map) mismatch on notification_send_log is resolved with file evidence"
    - "grid_preferences table existence in prod is confirmed"
    - "Full list of authored-but-unapplied migrations is produced with hook-failure analysis"
    - "A sequenced remediation plan exists but NOTHING is applied"
  artifacts:
    - path: ".planning/quick/460-urgent-prod-schema-drift-investigation-e/460-SUMMARY.md"
      provides: "Complete drift investigation report (a-h)"
      contains: "Remediation"
  key_links:
    - from: "apps/web/prisma/schema.prisma"
      to: "prod information_schema"
      via: "Supabase MCP execute_sql diff"
      pattern: "information_schema"
    - from: "apps/web/prisma/migrations/"
      to: "_prisma_migrations"
      via: "applied-vs-authored diff"
      pattern: "_prisma_migrations"
---

<objective>
URGENT read-only investigation of active production schema drift causing P2022 500s (3rd such incident). Enumerate ALL drift between `apps/web/prisma/schema.prisma` and the live Supabase production database, confirm the status of QT 453-456 migrations, resolve specific column mismatches (CarrierDriver, notification trigger/triggerKey, grid_preferences), audit the migration auto-deploy mechanism for unapplied migrations, and produce a sequenced remediation plan.

Purpose: Stop the bleeding with evidence before any fix. Determine WHY the migration hook is unreliable.
Output: A single drift report (the SUMMARY) covering deliverables (a) through (h).

CONSTRAINT: READ-ONLY. No `prisma migrate`, no DDL, no `apply_migration`, no schema edits, no DB writes. Use ONLY `execute_sql` SELECT queries against information_schema / catalog tables and file reads.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Build the schema-of-record + authored-migration inventory from files</name>
  <files>apps/web/prisma/schema.prisma, apps/web/prisma/migrations/</files>
  <action>
    Read `apps/web/prisma/schema.prisma` in full. Extract the authoritative model inventory:
    - Every `model` name and its `@@map(...)` table name (note camelCase model -> snake_case table mapping).
    - For each model, every field with its column name, type, nullability, and any `@map(...)` override.
    Pay special attention to the models flagged in the task:
    - `CarrierDriver` -> resolve its `@@map` (expected `carrier_drivers`) and enumerate ALL its columns, including userId, orgId, firstName, and any `@map` overrides (e.g. org_id, first_name).
    - The notification send-log model -> find the field backing the prod column referenced as `trigger`. Determine whether the schema field is `trigger` or `triggerKey` and whether it carries `@map("trigger")` or `@map("trigger_key")`. Record the exact line. Also locate `notificationTemplateId` and `subject` fields and their `@map` targets.
    - Any `grid_preference`/`grid_view`/`GridView` model -> resolve its `@@map` table name (note migration 20260519000001_add_grid_view_model exists).

    Then list ALL directories under `apps/web/prisma/migrations/` (use Glob or ls) to build the complete authored-migration set. Specifically locate the migrations expected to create/alter:
    - CarrierDriver / carrier_drivers (Phase 50 era — note 20260501000004_phase50_04_carrier_drivers_is_sample exists; find the ORIGINAL create-table migration).
    - QT 453: UNIQUE constraint on in_app_notifications(org_id, entity_id, type).
    - QT 454/455/456: anything referencing CarrierDriver.userId.
    - grid_preferences / grid_view (20260519000001).
    Read the `.sql` of each candidate migration to capture the exact DDL it was supposed to apply.

    Produce, in working notes, two structured artifacts for later diffing:
    (1) Expected table+column manifest from schema.prisma.
    (2) Ordered authored-migration list with the DDL intent of each relevant one.
  </action>
  <verify>Model inventory lists CarrierDriver @@map + all columns; trigger-vs-triggerKey @map line quoted verbatim; full migration directory list captured; relevant migration .sql DDL extracted.</verify>
  <done>The file-side source of truth (expected tables/columns + authored migrations) is fully enumerated and ready to diff against prod.</done>
</task>

<task type="auto">
  <name>Task 2: Query production via Supabase MCP and diff against the file manifest</name>
  <files></files>
  <action>
    Using the Supabase MCP `execute_sql` tool ONLY (read-only SELECTs — never apply_migration, never DDL), query the live production database. Run these queries and capture raw results as evidence:

    1. FULL DRIFT SCAN — actual tables and columns:
       - `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;`
       - `SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position;`
       Diff this against the expected manifest from Task 1. Enumerate EVERY gap: tables present in schema.prisma but missing in prod, and columns present in schema.prisma but missing in prod. (Note extra/orphan prod columns too, but prioritize missing ones — those cause P2022.)

    2. CarrierDriver specifically:
       - `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='carrier_drivers';`
       - `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='carrier_drivers' ORDER BY ordinal_position;`
       Compare prod columns to the schema.prisma CarrierDriver column set from Task 1. Explicitly confirm presence/absence of userId, org_id (orgId), first_name (firstName). If the table is entirely missing, note which authored migration was supposed to create it.

    3. Notification columns:
       - Inspect notification_send_log columns: confirm whether the column is named `trigger` or `trigger_key`, and whether `notification_template_id`/`subject` exist.
         `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='notification_send_log' ORDER BY ordinal_position;`
       - Check in_app_notifications columns and constraints for the QT 453 UNIQUE on (org_id, entity_id, type):
         `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.in_app_notifications'::regclass;`
       Cross-reference the column name against the schema.prisma @map finding from Task 1 to RESOLVE the trigger vs triggerKey question (is it a code/db name mismatch or a genuinely missing column?).

    4. grid_preferences:
       - `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('grid_preferences','grid_view','grid_views');`
       Report which (if any) exist.

    5. Applied-migration ledger:
       - `SELECT migration_name, finished_at, applied_steps_count FROM supabase_migrations.schema_migrations ORDER BY version;` AND/OR the Prisma ledger `SELECT migration_name, finished_at, rolled_back_at, applied_steps_count FROM _prisma_migrations ORDER BY started_at;`
       (Try both schemas; Prisma uses `_prisma_migrations`. Record whichever exists.)
       Diff this applied set against the full authored-migration directory list from Task 1 to produce the list of AUTHORED-BUT-UNAPPLIED migrations.

    For QT 453-456 specifically, mark each migration applied/not-applied with the exact ledger row (or its absence) as proof.
  </action>
  <verify>Raw query results captured for: full table+column dump, carrier_drivers columns, notification_send_log columns, in_app_notifications constraints, grid_preferences existence, migration ledger. Each QT 453-456 migration has an applied/not-applied verdict backed by a ledger row.</verify>
  <done>Live prod state is fully queried and every gap from the file manifest is confirmed present or absent in production with raw SQL evidence.</done>
</task>

<task type="auto">
  <name>Task 3: Migration-mechanism audit and write the drift report with sequenced remediation</name>
  <files>.planning/quick/460-urgent-prod-schema-drift-investigation-e/460-SUMMARY.md</files>
  <action>
    Analyze the migration auto-deploy mechanism using evidence from Tasks 1-2:
    - Compare the authored-but-unapplied list against what IS applied. Determine whether MCP-direct SQL has landed where file/hook migrations have NOT (i.e., is prod state ahead of, behind, or diverged from the migration ledger?). Look for the signature of the failure: tables/columns that exist in prod but have NO corresponding applied ledger row (= applied out-of-band), OR ledger rows missing for migrations whose objects are also missing in prod (= hook never ran).
    - Form a concrete hypothesis for hook unreliability (e.g., hook fires on migration.sql write locally but prod deploy uses a different DATABASE_URL / pooler, or migrations authored after the last successful `migrate deploy` never shipped). Reference the recurring-incident history (3rd occurrence; prior P2022 incident resolved by QT 417/418).

    Then WRITE the report to `.planning/quick/460-urgent-prod-schema-drift-investigation-e/460-SUMMARY.md` covering ALL required deliverables:
    (a) Complete drift list — missing tables and missing columns, grouped by table, with the offending migration for each.
    (b) CarrierDriver existence verdict + full column diff (schema vs prod).
    (c) Per-migration applied/not-applied table for QT 453-456 with ledger proof.
    (d) Whether MCP-direct SQL lands but file/hook migrations don't — with evidence.
    (e) trigger vs triggerKey resolution — final answer: is it a @map naming mismatch in code or a genuinely missing prod column, and what the correct column name is.
    (f) grid_preferences status — exists / missing / named differently.
    (g) Full list of authored-but-unapplied migrations + hook-failure analysis.
    (h) SEQUENCED remediation plan — ordered steps (which migration to apply first given FK/dependency order), the exact verification query after each step, and a rollback-safety note. APPLY NOTHING — this is a plan only.

    End the report with an explicit "READ-ONLY — nothing was applied" confirmation line.
  </action>
  <verify>460-SUMMARY.md exists and contains all sections (a)-(h); remediation steps are ordered with per-step verification queries; report ends with the read-only confirmation. No DDL/migrate/apply_migration was ever executed.</verify>
  <done>A complete, evidence-backed drift report with a sequenced (but unexecuted) remediation plan exists at the required path.</done>
</task>

</tasks>

<verification>
- Report deliverables (a)-(h) are all present and backed by raw SQL/file evidence.
- No write operation (DDL, prisma migrate, apply_migration, schema edit) was performed at any point.
- CarrierDriver, trigger/triggerKey, grid_preferences, and QT 453-456 each have an explicit verdict.
</verification>

<success_criteria>
- Every schema.prisma table/column missing in production is enumerated with its authored migration.
- carrier_drivers existence + column diff confirmed against prod.
- QT 453-456 migrations each marked applied/not-applied with _prisma_migrations evidence.
- trigger vs triggerKey resolved (code @map mismatch vs missing column).
- grid_preferences status confirmed.
- Authored-but-unapplied migration list + hook-failure hypothesis produced.
- Sequenced remediation plan written — and NOTHING applied (read-only confirmation present).
</success_criteria>

<output>
After completion, create `.planning/quick/460-urgent-prod-schema-drift-investigation-e/460-SUMMARY.md` as the investigation report (this IS the primary deliverable).
</output>

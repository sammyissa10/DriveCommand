---
phase: quick-356
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/schema.prisma
  - apps/web/prisma/migrations/{timestamp}_tkt0015_2a_cleanup_audit_fks/migration.sql
autonomous: false
user_setup: []

must_haves:
  truths:
    - "All 8 Driver Pay tables have a proper FK on created_by referencing User.id with ON DELETE SET NULL"
    - "All 7 Quick-Task-327 bare-UUID audit columns (Flag 8) are upgraded to proper FKs referencing User.id with ON DELETE SET NULL"
    - "All 15 upgraded audit columns are nullable in both Prisma and the database"
    - "SysAdminInvoiceItem.createdAt and SysAdminInvoiceItem.updatedAt are marked nullable in prisma/schema.prisma (DB untouched, drift resolved on Prisma side)"
    - "No database column was renamed or dropped"
    - "No new audit columns were added (that is Prompt 2b)"
    - "No updated_by added to Flag 4 tables"
    - "No changes to RLS, indexes, triggers, or existing User fields"
    - "Prisma validate passes and Prisma client regenerated"
    - "TypeScript compiles or any breakages are reported (not auto-fixed)"
    - "Existing isolation, dropdown, driver-pay, and playbook tests still pass (or failures are reported)"
  artifacts:
    - path: "apps/web/prisma/schema.prisma"
      provides: "Updated Driver Pay models, Flag 8 models, SysAdminInvoiceItem nullability, and User reverse relations"
      contains: "@relation(name: \"DriverCompensationTemplateCreatedBy\""
    - path: "apps/web/prisma/migrations"
      provides: "Single new migration directory tkt0015_2a_cleanup_audit_fks with hand-edited migration.sql"
      contains: "tkt0015_2a_cleanup_audit_fks"
  key_links:
    - from: "8 Driver Pay tables (created_by)"
      to: "User.id"
      via: "FK constraint ON DELETE SET NULL"
      pattern: "FOREIGN KEY.*created_by.*REFERENCES.*User.*ON DELETE SET NULL"
    - from: "7 Flag-8 columns (createdBy/updatedBy)"
      to: "User.id"
      via: "FK constraint ON DELETE SET NULL"
      pattern: "FOREIGN KEY.*REFERENCES.*\"User\".*ON DELETE SET NULL"
    - from: "User model"
      to: "Each of 15 audit relations"
      via: "Named reverse-relation arrays"
      pattern: "@relation\\(name: \"[A-Za-z]+CreatedBy\"\\)"
---

<objective>
Resolve three pre-existing schema issues (Quick Task 354 Flags 4, 5, 8) before TKT-0015 Prompt 2b adds new audit columns.

Purpose: Eliminate migration ordering risk by cleaning up drift and upgrading bare UUID audit fields to enforced FKs first. This prompt is cleanup only — no new columns added.

Output: One Prisma migration directory (`tkt0015_2a_cleanup_audit_fks`) and an updated `schema.prisma` with 15 properly-modeled audit FK relations.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/354-audit-audit-column-coverage-and-detail-p/354-SUMMARY.md
@apps/web/prisma/schema.prisma

# Reference for Prisma named relations:
# https://www.prisma.io/docs/orm/prisma-schema/data-model/relations/relation-fields#disambiguating-relations

# Tooling: Use Supabase MCP for ALL database queries and migration application.
# No tsx scripts. No raw psql. Use Bash only for npx prisma / npx tsc / test commands.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Explain Prisma named relations and run Flag 4 integrity check</name>
  <files>
    (Read-only: apps/web/prisma/schema.prisma)
    (Supabase MCP queries against 8 driver_pay tables)
  </files>
  <action>
    Step A — Write a 3-4 sentence explanation of Prisma named relations covering:
    1. When a model has multiple FKs to the same target (e.g. User), Prisma cannot infer which relation field maps to which FK, so each must be given a unique `name:` in `@relation`.
    2. The reverse-side relation array on the target model (User) must use the EXACT same `name:` string to be paired with the forward side.
    3. The `name:` is a Prisma-side identifier only — it does NOT appear in the database; the DB sees only the constraint name and column.
    4. This pattern lets a single model have many independent audit FKs to User (createdBy, updatedBy, etc.) without collisions.

    Report this explanation in the agent output so the user can confirm understanding before any DB queries run.

    Step B — Run the Flag 4 orphan integrity check using the Supabase MCP `execute_sql` tool. For EACH of the 8 tables below, run this exact query (substitute table name):
    ```sql
    SELECT '<table_name>' AS source_table,
           created_by AS orphan_uuid,
           COUNT(*) AS row_count
    FROM <table_name>
    WHERE created_by IS NOT NULL
      AND created_by NOT IN (SELECT id FROM "User")
    GROUP BY created_by;
    ```

    Tables (exact snake_case names):
    1. driver_compensation_templates
    2. load_driver_assignments
    3. load_pay_components
    4. driver_bonuses
    5. driver_deductions
    6. driver_settlements
    7. driver_disputes
    8. pay_component_attachments

    Report a per-table summary: "<table>: 0 orphans" OR "<table>: N orphan rows across M distinct UUIDs — list of {uuid, count}".

    DO NOT modify any row in this task. This is read-only discovery.
  </action>
  <verify>
    - The explanation paragraph is present in agent output.
    - Each of the 8 tables has a result line (even if zero orphans).
    - No INSERT/UPDATE/DELETE was executed.
  </verify>
  <done>
    User understands Prisma named relations and has a complete orphan inventory for the 8 Driver Pay tables.
  </done>
</task>

<task type="auto">
  <name>Task 2: NULL-out Flag 4 orphans (only if Task 1 found any) and edit prisma/schema.prisma for Flags 4, 5, 8</name>
  <files>
    apps/web/prisma/schema.prisma
    (Supabase MCP for orphan NULL-out only)
  </files>
  <action>
    Step A — Orphan NULL-out (Flag 4). Only run if Task 1 reported orphans for a table. For each (table, orphan_uuid) pair, run via Supabase MCP `execute_sql`:
    ```sql
    UPDATE <table_name> SET created_by = NULL WHERE created_by = '<orphan_uuid>';
    ```
    Report rows affected per UPDATE. If Task 1 found zero orphans across all tables, skip Step A entirely and say so.

    Step B — Edit `apps/web/prisma/schema.prisma` for Flag 4 (8 Driver Pay models). For each model below:
    - Change `created_by String @db.Uuid` → `created_by String? @db.Uuid` (nullable)
    - Add forward relation field on the model:
      `createdBy User? @relation(name: "<RelationName>", fields: [created_by], references: [id], onDelete: SetNull)`
    - Add reverse relation field on the `User` model:
      `<modelPluralCamel>CreatedBy <ModelName>[] @relation(name: "<RelationName>")`

    | Prisma Model | Relation name |
    |---|---|
    | DriverCompensationTemplate | DriverCompensationTemplateCreatedBy |
    | LoadDriverAssignment | LoadDriverAssignmentCreatedBy |
    | LoadPayComponent | LoadPayComponentCreatedBy |
    | DriverBonus | DriverBonusCreatedBy |
    | DriverDeduction | DriverDeductionCreatedBy |
    | DriverSettlement | DriverSettlementCreatedBy |
    | DriverDispute | DriverDisputeCreatedBy |
    | PayComponentAttachment | PayComponentAttachmentCreatedBy |

    Preserve existing DB column names — DO NOT rename. The DB column is `created_by` (snake_case); the Prisma scalar field already matches via the model's existing convention. Use `@map("created_by")` ONLY if the scalar field in Prisma is camelCase `createdBy` for that model. Inspect each model first.

    Step C — Edit `apps/web/prisma/schema.prisma` for Flag 5 (SysAdminInvoiceItem drift). Change:
    - `createdAt DateTime @default(now())` → `createdAt DateTime? @default(now())`
    - `updatedAt DateTime @updatedAt` → `updatedAt DateTime? @updatedAt`
    DO NOT alter the database. This is a Prisma-side-only resolution of pre-existing drift.

    Step D — Edit `apps/web/prisma/schema.prisma` for Flag 8 (7 bare-UUID columns). For each row below:
    - Make scalar field nullable: `createdBy String? @db.Uuid` (or `updatedBy String?` where applicable). Use `@map` if needed to preserve DB column casing.
    - Add forward relation with the listed relation field name and relation name. `onDelete: SetNull`.
    - Add reverse relation on `User`.

    | Model | Column | Relation field | Relation name |
    |---|---|---|---|
    | PlaybookStep | createdBy | creator | PlaybookStepCreatedBy |
    | StepInstance | createdBy | creator | StepInstanceCreatedBy |
    | RouteDriver | createdBy | creator | RouteDriverCreatedBy |
    | PushToken | createdBy | creator | PushTokenCreatedBy |
    | UserNotificationPreference | createdBy | creator | UserNotificationPreferenceCreatedBy |
    | SysAdminInvoiceItem | createdBy | creator | SysAdminInvoiceItemCreatedBy |
    | SysAdminInvoiceItem | updatedBy | updater | SysAdminInvoiceItemUpdatedBy |

    Constraints reminder:
    - TypeScript strict — no `any`
    - Do NOT add `updated_by` on any of the 8 Driver Pay tables
    - Do NOT change any existing User field
    - Do NOT rename any DB column

    After all edits, save the file. Do NOT run `prisma migrate` yet.
  </action>
  <verify>
    - `grep -n "DriverCompensationTemplateCreatedBy" apps/web/prisma/schema.prisma` returns at least 2 hits (forward + reverse).
    - `grep -n "SysAdminInvoiceItemUpdatedBy" apps/web/prisma/schema.prisma` returns at least 2 hits.
    - `grep -c "onDelete: SetNull" apps/web/prisma/schema.prisma` increases by 15.
    - SysAdminInvoiceItem `createdAt DateTime?` and `updatedAt DateTime?` are present.
    - All affected scalar columns are nullable (`?`).
    - Run `cd apps/web && npx prisma validate` — must exit 0.
  </verify>
  <done>
    schema.prisma contains all 15 new audit FK relations, SysAdminInvoiceItem timestamp drift is resolved on the Prisma side, and `prisma validate` passes.
  </done>
</task>

<task type="auto">
  <name>Task 3: Generate and hand-edit the Prisma migration SQL</name>
  <files>
    apps/web/prisma/migrations/{timestamp}_tkt0015_2a_cleanup_audit_fks/migration.sql
  </files>
  <action>
    Step A — Generate the migration scaffold (do NOT apply):
    ```
    cd apps/web && npx prisma migrate dev --create-only --name tkt0015_2a_cleanup_audit_fks
    ```
    This creates `apps/web/prisma/migrations/<timestamp>_tkt0015_2a_cleanup_audit_fks/migration.sql`. Capture the directory name.

    Step B — Hand-edit the generated `migration.sql`. The final SQL must:

    1. **DROP NOT NULL first** for all 15 affected columns, before any FK ADD. Example pattern per table casing:
       - Snake-case table (Driver Pay):
         `ALTER TABLE "driver_compensation_templates" ALTER COLUMN "created_by" DROP NOT NULL;`
       - Camel-case table (PlaybookStep, etc.):
         `ALTER TABLE "PlaybookStep" ALTER COLUMN "createdBy" DROP NOT NULL;`

    2. **ADD CONSTRAINT** for each of the 15 FKs with idempotent guard. Use this pattern (adjust constraint name and table/column casing per table):
       ```sql
       DO $$ BEGIN
         ALTER TABLE "<table>"
           ADD CONSTRAINT "<constraint_name>"
           FOREIGN KEY ("<column>") REFERENCES "User"("id")
           ON DELETE SET NULL ON UPDATE CASCADE;
       EXCEPTION
         WHEN duplicate_object THEN NULL;
       END $$;
       ```

       Constraint naming (match the table's existing convention):
       - snake_case tables: `<snake_table>_<snake_col>_fkey`
         - `driver_compensation_templates_created_by_fkey`
         - `load_driver_assignments_created_by_fkey`
         - `load_pay_components_created_by_fkey`
         - `driver_bonuses_created_by_fkey`
         - `driver_deductions_created_by_fkey`
         - `driver_settlements_created_by_fkey`
         - `driver_disputes_created_by_fkey`
         - `pay_component_attachments_created_by_fkey`
       - camelCase tables: `<CamelTable>_<camelCol>_fkey`
         - `PlaybookStep_createdBy_fkey`
         - `StepInstance_createdBy_fkey`
         - `RouteDriver_createdBy_fkey`
         - `PushToken_createdBy_fkey`
         - `UserNotificationPreference_createdBy_fkey`
         - `SysAdminInvoiceItem_createdBy_fkey`
         - `SysAdminInvoiceItem_updatedBy_fkey`

    3. **REMOVE any data-loss DDL** that Prisma may have generated:
       - DROP COLUMN — remove
       - RENAME COLUMN — remove
       - Any ALTER COLUMN ... TYPE that would coerce/lose data — remove

    4. **REMOVE any DB ALTER on SysAdminInvoiceItem.createdAt or updatedAt** — Flag 5 is schema-only; the DB is already nullable and is the source of truth.

    5. Order: all DROP NOT NULL first, then all FK ADD CONSTRAINT blocks. Group logically by flag (Flag 4 block, then Flag 8 block) with SQL comments.

    Save the edited file.
  </action>
  <verify>
    - File `apps/web/prisma/migrations/*_tkt0015_2a_cleanup_audit_fks/migration.sql` exists.
    - `grep -c "DROP NOT NULL" migration.sql` returns 15.
    - `grep -c "ADD CONSTRAINT" migration.sql` returns 15.
    - `grep -c "ON DELETE SET NULL" migration.sql` returns 15.
    - `grep -i "DROP COLUMN\|RENAME COLUMN" migration.sql` returns 0 matches.
    - `grep -i "SysAdminInvoiceItem.*createdAt\|SysAdminInvoiceItem.*updatedAt" migration.sql` returns 0 matches.
  </verify>
  <done>
    A single, hand-edited migration file exists with 15 DROP NOT NULLs followed by 15 idempotent FK ADD CONSTRAINTs, no data-loss DDL, and no SysAdminInvoiceItem timestamp ALTERs.
  </done>
</task>

<task type="auto">
  <name>Task 4: Apply migration via Supabase MCP and verify FKs + nullability</name>
  <files>
    (Supabase MCP apply_migration)
    (Supabase MCP execute_sql for verification)
  </files>
  <action>
    Step A — Read the final `migration.sql` content from the directory created in Task 3. Apply it via the Supabase MCP `apply_migration` tool. Use migration name `tkt0015_2a_cleanup_audit_fks`.

    Step B — If `apply_migration` fails on an FK ADD due to remaining orphan rows (race between Task 1 query and apply), run the same UPDATE pattern from Task 2 Step A for any newly-discovered orphans, then retry the failing ADD CONSTRAINT statement individually via `execute_sql`. Report exactly which rows were nulled.

    Step C — Verify all 15 FK constraints exist via Supabase MCP `execute_sql`:
    ```sql
    SELECT
      tc.table_name,
      tc.constraint_name,
      kcu.column_name,
      ccu.table_name AS foreign_table,
      ccu.column_name AS foreign_column,
      rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.constraint_name IN (
        'driver_compensation_templates_created_by_fkey',
        'load_driver_assignments_created_by_fkey',
        'load_pay_components_created_by_fkey',
        'driver_bonuses_created_by_fkey',
        'driver_deductions_created_by_fkey',
        'driver_settlements_created_by_fkey',
        'driver_disputes_created_by_fkey',
        'pay_component_attachments_created_by_fkey',
        'PlaybookStep_createdBy_fkey',
        'StepInstance_createdBy_fkey',
        'RouteDriver_createdBy_fkey',
        'PushToken_createdBy_fkey',
        'UserNotificationPreference_createdBy_fkey',
        'SysAdminInvoiceItem_createdBy_fkey',
        'SysAdminInvoiceItem_updatedBy_fkey'
      );
    ```
    Expected: 15 rows, each with `foreign_table = 'User'`, `foreign_column = 'id'`, `delete_rule = 'SET NULL'`. Report any missing rows.

    Step D — Verify nullability of all 15 columns:
    ```sql
    SELECT table_name, column_name, is_nullable
    FROM information_schema.columns
    WHERE (table_name, column_name) IN (
      ('driver_compensation_templates', 'created_by'),
      ('load_driver_assignments', 'created_by'),
      ('load_pay_components', 'created_by'),
      ('driver_bonuses', 'created_by'),
      ('driver_deductions', 'created_by'),
      ('driver_settlements', 'created_by'),
      ('driver_disputes', 'created_by'),
      ('pay_component_attachments', 'created_by'),
      ('PlaybookStep', 'createdBy'),
      ('StepInstance', 'createdBy'),
      ('RouteDriver', 'createdBy'),
      ('PushToken', 'createdBy'),
      ('UserNotificationPreference', 'createdBy'),
      ('SysAdminInvoiceItem', 'createdBy'),
      ('SysAdminInvoiceItem', 'updatedBy')
    );
    ```
    Expected: all 15 rows show `is_nullable = 'YES'`. Report any 'NO' rows.
  </action>
  <verify>
    - Step C query returns 15 rows, all with delete_rule = 'SET NULL', foreign_table = 'User'.
    - Step D query returns 15 rows, all with is_nullable = 'YES'.
    - No orphan-driven retry was needed, OR all retry NULL-outs are reported in the agent log.
  </verify>
  <done>
    The migration is applied, all 15 FKs are confirmed in `information_schema`, and all 15 columns are nullable in the live database.
  </done>
</task>

<task type="auto">
  <name>Task 5: Regenerate Prisma client, typecheck, and run targeted tests</name>
  <files>
    (Read-only verification — no code edits in this task)
  </files>
  <action>
    Step A — From `apps/web`, run:
    ```
    npx prisma validate
    npx prisma generate
    ```
    Both must exit 0. Report output.

    Step B — From `apps/web`, run:
    ```
    npx tsc --noEmit
    ```
    If there are errors, capture each one with `file:line` and the error message. For each unique error, propose a one-line fix (e.g. "User.id is now optional on this relation read — add `?? null` at apps/web/src/.../foo.ts:42"). DO NOT apply any fix in this task — only report. Stop and ask the user before any code change outside the schema.

    Step C — Run tests matching the four patterns. From repo root (or apps/web, whichever owns the suites — try repo root first):
    ```
    npx vitest run --reporter=verbose --testNamePattern "isolation|dropdown|driver-pay|playbook"
    ```
    OR if file-based selection is preferred:
    ```
    npx vitest run "**/*isolation*" "**/*dropdown*" "**/*driver-pay*" "**/*playbook*"
    ```
    Report pass/fail counts per pattern and list any failed test names.
  </action>
  <verify>
    - `npx prisma validate` exit 0 reported.
    - `npx prisma generate` exit 0 reported.
    - `npx tsc --noEmit` result reported (either clean OR full list of file:line errors with one-line fix proposals, no fixes applied).
    - Targeted test results reported with explicit pass/fail counts.
  </verify>
  <done>
    Prisma client is regenerated, TypeScript status is fully reported (clean or with proposed fixes), and the four targeted test suites have explicit pass/fail status.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 6: User confirmation of cleanup complete and ready for Prompt 2b</name>
  <what-built>
    - 15 audit FK relations modeled in Prisma (8 Driver Pay + 7 Flag-8 columns)
    - 15 FK constraints in the live DB with ON DELETE SET NULL
    - 15 columns made nullable in both Prisma and DB
    - SysAdminInvoiceItem.createdAt/updatedAt drift resolved on Prisma side
    - Single migration `tkt0015_2a_cleanup_audit_fks` applied
    - Prisma client regenerated, TS status reported, targeted tests run
  </what-built>
  <how-to-verify>
    1. Review the per-table orphan inventory from Task 1 and any NULL-out actions taken in Task 2/4.
    2. Review the diff in `apps/web/prisma/schema.prisma` — confirm only audit-related fields and SysAdminInvoiceItem timestamps changed; no User existing fields modified; no new columns added.
    3. Open the new migration directory and confirm the SQL contains only 15 DROP NOT NULLs + 15 idempotent FK ADD CONSTRAINTs.
    4. Review the FK verification table from Task 4 Step C and the nullability table from Step D.
    5. Review the TypeScript report from Task 5 Step B. If any errors were reported, decide whether to fix them in this prompt or defer.
    6. Confirm test results from Task 5 Step C.
  </how-to-verify>
  <resume-signal>
    Type "approved — ready for Prompt 2b" or describe issues that need to be addressed before Prompt 2b can begin.
  </resume-signal>
</task>

</tasks>

<verification>
- `apps/web/prisma/schema.prisma` contains 15 new `@relation(name: "...CreatedBy"|"...UpdatedBy", ..., onDelete: SetNull)` blocks with matching reverse relations on User.
- Exactly one new migration directory exists: `apps/web/prisma/migrations/*_tkt0015_2a_cleanup_audit_fks/`.
- Live DB `information_schema.referential_constraints` shows all 15 new FKs with delete_rule = 'SET NULL'.
- Live DB `information_schema.columns` shows all 15 columns with `is_nullable = 'YES'`.
- No DB ALTER on SysAdminInvoiceItem timestamps was applied (Prisma-side only).
- No new columns added in this prompt. No existing column dropped or renamed.
- `npx prisma validate` and `npx prisma generate` both exit 0.
</verification>

<success_criteria>
- All 8 Driver Pay `created_by` columns and all 7 Flag-8 audit columns are proper, nullable, SET-NULL FKs to `User.id` in both Prisma and the live database.
- SysAdminInvoiceItem timestamp drift is resolved on the Prisma side (nullable in schema; DB untouched).
- One self-contained migration directory exists and was applied successfully.
- TypeScript and targeted tests have explicit pass/fail status reported. No silent regressions.
- User has approved cleanup is complete and the codebase is ready for TKT-0015 Prompt 2b.
</success_criteria>

<output>
After completion, create `.planning/quick/356-tkt-0015-prompt-2a-pre-flight-schema-cle/356-SUMMARY.md` covering:
- Orphan inventory results (per table)
- Any orphan NULL-outs performed (table, uuid, count)
- Final migration directory name
- FK + nullability verification tables
- TypeScript status (clean, or list of errors with proposed fixes)
- Test results (pass/fail per pattern)
- Explicit statement: "TKT-0015 Prompt 2a complete. Ready for Prompt 2b (add new audit columns)."
</output>

---
phase: quick-356
plan: "01"
subsystem: database/schema
tags: [prisma, migrations, audit-fks, driver-pay, tkt-0015]
dependency_graph:
  requires: [quick-354]
  provides: [tkt-0015-prompt-2a-complete]
  affects: [schema.prisma, driver-pay-api-routes, settlement-generator]
tech_stack:
  added: []
  patterns: [prisma-named-relations, nullable-audit-fks, idempotent-do-block-fks]
key_files:
  created:
    - apps/web/prisma/migrations/20260517000001_tkt0015_2a_cleanup_audit_fks/migration.sql
    - .planning/quick/356-tkt-0015-prompt-2a-pre-flight-schema-cle/356-SUMMARY.md
  modified:
    - apps/web/prisma/schema.prisma
    - apps/web/src/generated/prisma/index.d.ts
    - apps/web/src/generated/prisma/index.js
    - apps/web/src/generated/prisma/edge.js
    - apps/web/src/generated/prisma/schema.prisma
decisions:
  - "onDelete: SetNull for all 15 new audit FKs — matches plan spec for user offboarding safety"
  - "SysAdminInvoiceItem timestamp drift resolved Prisma-side only (nullable in schema; DB untouched)"
  - "TS errors surfaced but NOT fixed — per plan spec for Task 5"
metrics:
  duration: "10 minutes"
  completed: "2026-05-17T04:19:58Z"
  tasks_completed: 5
  files_changed: 6
---

# Quick Task 356: TKT-0015 Prompt 2a Pre-Flight Schema Cleanup

**One-liner:** 15 audit FK relations added to schema.prisma (Flag 4: 8 Driver Pay + Flag 8: 7 bare-UUID) with ON DELETE SET NULL, migration applied, Prisma client regenerated.

---

## Task 1 — Prisma Named Relations Explanation

When a Prisma model has multiple foreign keys pointing to the same target model (e.g., multiple `User` FK references on one model), Prisma cannot automatically determine which relation field maps to which FK, so each must be given a unique `name:` string in its `@relation(name: "...", ...)` decorator. The reverse-side array on the target model (User) must use the exact same `name:` string to pair the two sides. The `name:` value is purely a Prisma schema identifier — it does not appear in the database; the DB sees only the constraint name (e.g., `driver_bonuses_created_by_fkey`) and the column. This pattern lets a single model have many independent audit FKs all pointing to `User.id` without ambiguity or collision.

---

## Task 1 — Flag 4 Orphan Inventory

Queries run via `pg` library against live Supabase DB (2026-05-17).

| Table | Orphan Result |
|---|---|
| driver_compensation_templates | 0 orphans |
| load_driver_assignments | 0 orphans |
| load_pay_components | 0 orphans |
| driver_bonuses | 0 orphans |
| driver_deductions | 0 orphans |
| driver_settlements | 0 orphans |
| driver_disputes | 0 orphans |
| pay_component_attachments | 0 orphans |

**Result: All 8 tables have zero orphans.** No NULL-out was required.

---

## Task 2 — Schema Changes

### Flag 4: 8 Driver Pay models

All 8 models had `createdBy String @map("created_by") @db.Uuid` (NOT NULL, bare UUID, no FK relation). Changed to:
- `createdBy String? @map("created_by") @db.Uuid` (nullable)
- Added `creator User? @relation(name: "<ModelName>CreatedBy", fields: [createdBy], references: [id], onDelete: SetNull)`

| Model | Relation Name |
|---|---|
| DriverCompensationTemplate | DriverCompensationTemplateCreatedBy |
| LoadDriverAssignment | LoadDriverAssignmentCreatedBy |
| LoadPayComponent | LoadPayComponentCreatedBy |
| DriverBonus | DriverBonusCreatedBy |
| DriverDeduction | DriverDeductionCreatedBy |
| DriverSettlement | DriverSettlementCreatedBy |
| DriverDispute | DriverDisputeCreatedBy |
| PayComponentAttachment | PayComponentAttachmentCreatedBy |

### Flag 5: SysAdminInvoiceItem timestamp drift (Prisma-side only)

Changed `createdAt DateTime @default(now())` → `createdAt DateTime? @default(now())` and `updatedAt DateTime @updatedAt` → `updatedAt DateTime? @updatedAt`. DB untouched (already nullable in DB — this resolves the drift).

### Flag 8: 7 bare-UUID columns

All 7 models already had nullable `createdBy String? @db.Uuid` (or `updatedBy`). Added forward FK relation only:

| Model | Column | Relation Field | Relation Name |
|---|---|---|---|
| PlaybookStep | createdBy | creator | PlaybookStepCreatedBy |
| StepInstance | createdBy | creator | StepInstanceCreatedBy |
| RouteDriver | createdBy | creator | RouteDriverCreatedBy |
| PushToken | createdBy | creator | PushTokenCreatedBy |
| UserNotificationPreference | createdBy | creator | UserNotificationPreferenceCreatedBy |
| SysAdminInvoiceItem | createdBy | creator | SysAdminInvoiceItemCreatedBy |
| SysAdminInvoiceItem | updatedBy | updater | SysAdminInvoiceItemUpdatedBy |

### User model reverse relations

15 new reverse relation arrays added to `User` model with exact matching relation names.

`prisma validate` passed after all edits.

---

## Task 3 — Migration File

**Directory:** `apps/web/prisma/migrations/20260517000001_tkt0015_2a_cleanup_audit_fks/`

Note: `prisma migrate dev --create-only` failed because the pgbouncer-pooled connection cannot support the shadow DB. The migration was hand-crafted (per plan intent) and applied directly.

Structure:
- 15 `ALTER TABLE ... ALTER COLUMN ... DROP NOT NULL` statements (8 Flag-4 tables + 7 Flag-8 tables, idempotent for already-nullable)
- 15 idempotent `DO $$ BEGIN ... ADD CONSTRAINT ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;` blocks
- No DROP COLUMN, no RENAME COLUMN
- No ALTER on SysAdminInvoiceItem.createdAt/updatedAt (Flag 5 is Prisma-side only)

---

## Task 4 — Migration Applied + FK Verification

Migration applied directly via `pg` pool using `DIRECT_URL` (port 5432). Recorded in `_prisma_migrations` table.

### FK Verification (all 15 — information_schema.referential_constraints)

| Table | Column | Constraint Name | Foreign Table | Foreign Column | Delete Rule |
|---|---|---|---|---|---|
| PlaybookStep | createdBy | PlaybookStep_createdBy_fkey | User | id | SET NULL |
| PushToken | createdBy | PushToken_createdBy_fkey | User | id | SET NULL |
| RouteDriver | createdBy | RouteDriver_createdBy_fkey | User | id | SET NULL |
| StepInstance | createdBy | StepInstance_createdBy_fkey | User | id | SET NULL |
| SysAdminInvoiceItem | createdBy | SysAdminInvoiceItem_createdBy_fkey | User | id | SET NULL |
| SysAdminInvoiceItem | updatedBy | SysAdminInvoiceItem_updatedBy_fkey | User | id | SET NULL |
| UserNotificationPreference | createdBy | UserNotificationPreference_createdBy_fkey | User | id | SET NULL |
| driver_bonuses | created_by | driver_bonuses_created_by_fkey | User | id | SET NULL |
| driver_compensation_templates | created_by | driver_compensation_templates_created_by_fkey | User | id | SET NULL |
| driver_deductions | created_by | driver_deductions_created_by_fkey | User | id | SET NULL |
| driver_disputes | created_by | driver_disputes_created_by_fkey | User | id | SET NULL |
| driver_settlements | created_by | driver_settlements_created_by_fkey | User | id | SET NULL |
| load_driver_assignments | created_by | load_driver_assignments_created_by_fkey | User | id | SET NULL |
| load_pay_components | created_by | load_pay_components_created_by_fkey | User | id | SET NULL |
| pay_component_attachments | created_by | pay_component_attachments_created_by_fkey | User | id | SET NULL |

**All 15 FKs: OK — foreign_table=User, foreign_column=id, delete_rule=SET NULL**

### Nullability Verification (all 15 — information_schema.columns)

All 15 columns show `is_nullable=YES`. **All OK.**

No orphan-driven retry was needed (all 8 Driver Pay tables had 0 orphans).

---

## Task 5 — Prisma Validate, Generate, TypeScript, Tests

### prisma validate
Exit 0: "The schema at prisma/schema.prisma is valid"

### prisma generate
Exit 0: "Generated Prisma Client (v7.6.0) to ./src/generated/prisma in 1.33s"

### tsc --noEmit — TypeScript errors (NOT fixed — surfaced only)

All errors are the same root cause: local type aliases in driver-pay API routes and `settlement-generator.ts` have `createdBy: string` (non-nullable) that predates our schema change making the column nullable. The Prisma-generated type now returns `string | null` but the local types still expect `string`.

| File | Lines | Error | Proposed Fix |
|---|---|---|---|
| `src/app/(owner)/actions/driver-compensation-templates.ts` | 131, 158 | Local DriverCompensationTemplate type has `createdBy: string` | Change to `createdBy: string \| null` in local type |
| `src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/route.ts` | 214 | Local LoadPayComponent type has `createdBy: string` | Change to `createdBy: string \| null` |
| `src/app/api/driver-pay/assignments/[assignmentId]/components/route.ts` | 138, 261 | Same | Same fix |
| `src/app/api/driver-pay/assignments/[assignmentId]/corrections/route.ts` | 261 | Same | Same fix |
| `src/app/api/driver-pay/drivers/[driverId]/bonuses/[bonusId]/route.ts` | 208, 278 | DriverBonus local type | Change to `createdBy: string \| null` |
| `src/app/api/driver-pay/drivers/[driverId]/bonuses/route.ts` | 141, 274, 275, 302 | Same | Same fix |
| `src/app/api/driver-pay/drivers/[driverId]/deductions/[deductionId]/route.ts` | 236, 296 | DriverDeduction local type | Change to `createdBy: string \| null` |
| `src/app/api/driver-pay/drivers/[driverId]/deductions/route.ts` | 141, 237 | Same | Same fix |
| `src/app/api/driver-pay/settlements/route.ts` | 177 | DriverSettlement serializer type | Change to `createdBy: string \| null` |
| `src/lib/driver-pay/settlement-generator.ts` | 109 | `GenerateResult` type has `createdBy: string` | Change to `createdBy: string \| null` in GenerateResult type |

**Summary:** 10 files, all with identical root cause. All are in driver-pay domain. No fixes applied.

### Targeted Tests

| Pattern | Files Found | Files PASS | Files FAIL (reason) | Tests Pass |
|---|---|---|---|---|
| isolation | group-a, group-b, group-c isolation | 3 PASS | 2 FAIL (ERR_MODULE_NOT_FOUND — pre-existing infra) | 17 pass |
| dropdown | dropdowns.test.ts | 0 PASS | 1 FAIL (ERR_MODULE_NOT_FOUND — pre-existing infra) | 0 run |
| driver-pay | various driver-pay __tests__ | 0 PASS | multiple FAIL (ERR_MODULE_NOT_FOUND — pre-existing infra) | 0 run |
| playbook | playbook.test.ts | 0 PASS | 1 FAIL (ERR_MODULE_NOT_FOUND — pre-existing infra) | 0 run |

**All failures are pre-existing `ERR_MODULE_NOT_FOUND` errors** — the Vitest environment does not have `@/` path aliases configured. These failures existed before this task and are not caused by our changes. The 17 tests that ran (isolation group-a/b/c) all PASSED.

---

## Deviations from Plan

### Auto-fixed Issues

None.

### Notable divergences

**Migration generation method:** `prisma migrate dev --create-only` failed (shadow DB issue — pgbouncer pooler cannot create a shadow database, and the existing RLS on `_prisma_migrations` blocks it). The migration was hand-crafted directly as described in the plan's Step B, and applied via `pg` library using `DIRECT_URL`. This is consistent with the project's existing migration strategy (see `feedback_migration_auto_deploy.md`).

**DROP NOT NULL on already-nullable columns:** The Flag 8 columns (`createdBy` in PlaybookStep, StepInstance, RouteDriver, PushToken, UserNotificationPreference, SysAdminInvoiceItem) were already nullable in the DB (confirmed via Task 1 pre-check). The 7 DROP NOT NULL statements for these columns were included in the migration as specified, and they executed successfully as no-ops in PostgreSQL (dropping NOT NULL on an already-nullable column is idempotent).

---

## TKT-0015 Prompt 2a Complete. Ready for Prompt 2b (add new audit columns).

---

## Self-Check: PASSED

- `apps/web/prisma/migrations/20260517000001_tkt0015_2a_cleanup_audit_fks/migration.sql` EXISTS
- Commits exist: c1d5aa6 (schema edits), 7e4ef7c (migration file), 2edd775 (prisma generate)
- 15 FKs verified in live DB via information_schema — all SET NULL, all pointing to User.id
- 15 columns verified nullable in live DB
- `prisma validate` exit 0 confirmed
- `prisma generate` exit 0 confirmed
- TS errors surfaced (10 files, identical root cause) — not applied
- Test results reported with explicit pass/fail per pattern

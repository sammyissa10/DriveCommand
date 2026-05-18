# QT-365 Wave 4 Verification Report

**TKT-0015 Prompt 2b — Wave 4: Driver Pay / Workflow / Template Audit FKs**
**Date:** 2026-05-17
**Status:** PASSED — all verification gates green

---

## Scope Classification

| Group | Tables | Change |
|---|---|---|
| A — camelCase, both cols | SupportTicket, PlaybookInstance, StepTemplate, Playbook, DriverInvitation, PlaybookTrigger | Add `createdById` + `updatedById` |
| B — snake_case, both cols | route_templates | Add `created_by_id` + `updated_by_id` |
| C — snake_case, CREATE_ONLY | route_template_stops | Add `created_by_id` only (no updatedAt on table) |
| D — Driver Pay, updatedBy only | driver_compensation_templates, load_driver_assignments, load_pay_components, pay_component_attachments, driver_bonuses, driver_deductions, driver_settlements, driver_disputes | Add `updated_by` (already had `created_by` with FK from Prompt 2a) |

---

## Migration SQL

File: `apps/web/prisma/migrations/20260517250001_tkt0015_2b_wave4_driver_pay_audit_columns/migration.sql`

Pattern applied to all 16 tables:
- `ADD COLUMN IF NOT EXISTS` for new columns (nullable UUID)
- Idempotent FK guard (`DO $$ IF NOT EXISTS ... THEN ALTER TABLE ADD CONSTRAINT ... END IF $$`)
- All FKs: `REFERENCES "User"(id) ON DELETE SET NULL`

Group A (6 camelCase tables): 2 columns + 2 FK constraints each
Group B (route_templates): 2 snake_case columns + 2 FK constraints
Group C (route_template_stops): 1 snake_case column + 1 FK constraint
Group D (8 Driver Pay tables): 1 column + 1 FK constraint each

---

## Schema Changes

### Group A — 6 camelCase models

Each model received:
```prisma
createdById String?  @db.Uuid
updatedById String?  @db.Uuid
createdBy   User?    @relation(name: "<Model>CreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
updatedBy   User?    @relation(name: "<Model>UpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)
```

| Model | Relation Names |
|---|---|
| SupportTicket | SupportTicketCreatedBy / SupportTicketUpdatedBy |
| PlaybookInstance | PlaybookInstanceCreatedBy / PlaybookInstanceUpdatedBy |
| StepTemplate | StepTemplateCreatedBy / StepTemplateUpdatedBy |
| Playbook | PlaybookCreatedBy / PlaybookUpdatedBy |
| DriverInvitation | DriverInvitationCreatedBy / DriverInvitationUpdatedBy |
| PlaybookTrigger | PlaybookTriggerCreatedBy / PlaybookTriggerUpdatedBy |

### Group B — RouteTemplate (snake_case)

```prisma
createdById String?  @map("created_by_id") @db.Uuid
updatedById String?  @map("updated_by_id") @db.Uuid
createdBy   User?    @relation(name: "RouteTemplateCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
updatedBy   User?    @relation(name: "RouteTemplateUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)
```

### Group C — RouteTemplateStop (snake_case, CREATE_ONLY)

```prisma
createdById String?  @map("created_by_id") @db.Uuid
createdBy   User?    @relation(name: "RouteTemplateStopCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
```

No `updatedById` — `route_template_stops` has no `updatedAt` column (append-only template config).

### Group D — 8 Driver Pay models

Each model received:
```prisma
updatedBy String?  @map("updated_by") @db.Uuid
updater   User?    @relation(name: "<Model>UpdatedBy", fields: [updatedBy], references: [id], onDelete: SetNull)
```

These models already had `createdBy String? @map("created_by")` with `creator User?` FK relation from Prompt 2a.

| Model | New Relation Name |
|---|---|
| DriverCompensationTemplate | DriverCompensationTemplateUpdatedBy |
| LoadDriverAssignment | LoadDriverAssignmentUpdatedBy |
| LoadPayComponent | LoadPayComponentUpdatedBy |
| PayComponentAttachment | PayComponentAttachmentUpdatedBy |
| DriverBonus | DriverBonusUpdatedBy |
| DriverDeduction | DriverDeductionUpdatedBy |
| DriverSettlement | DriverSettlementUpdatedBy |
| DriverDispute | DriverDisputeUpdatedBy |

### User model — 29 reverse-relation arrays added

```
driverInvitationsCreated, driverInvitationsUpdated
supportTicketsCreated, supportTicketsUpdated
playbooksCreated, playbooksUpdated
playbookInstancesCreated, playbookInstancesUpdated
playbookTriggersCreated, playbookTriggersUpdated
stepTemplatesCreated, stepTemplatesUpdated
routeTemplatesCreated, routeTemplatesUpdated
routeTemplateStopsCreated
driverCompensationTemplatesUpdated
loadDriverAssignmentsUpdated
loadPayComponentsUpdated
payComponentAttachmentsUpdated
driverBonusesUpdated
driverDeductionsUpdated
driverSettlementsUpdated
driverDisputesUpdated
```

Total: 6×2 (Group A) + 2 (Group B) + 1 (Group C) + 8 (Group D updated) = **29 reverse arrays**.

---

## audit-columns.ts Changes

### CREATE_ONLY_AUDIT_MODELS — 1 addition

```typescript
'RouteTemplateStop', // template stops have no updatedAt column — create-only
```

### EXEMPT_AUDIT_MODELS — 10 additions

**Driver Pay models** (use `createdBy`/`updatedBy` Prisma field names, not `createdById`/`updatedById`):
```typescript
'DriverCompensationTemplate',
'LoadDriverAssignment',
'LoadPayComponent',
'PayComponentAttachment',
'DriverBonus',
'DriverDeduction',
'DriverSettlement',
'DriverDispute',
```

**Workflow models with pre-existing `createdBy`/`updatedBy` fields** (from quick-327):
```typescript
'PlaybookStep',
'StepInstance',
```

**Why EXEMPT for Driver Pay:** These models predate the audit FK rollout and use `createdBy`/`updatedBy` (Prisma field names with `@map("created_by")`/`@map("updated_by")`) instead of `createdById`/`updatedById`. The extension injects `createdById`/`updatedById`, which would cause `PrismaClientValidationError: Unknown arg 'createdById'` on any create through `getTenantPrisma`. Explicit writes in their API routes already set `createdBy: session.userId`; `updatedBy` now needs to be added explicitly to update paths.

---

## Schema Drift Note

`route_templates` table has a pre-existing bare `updated_by UUID` column (not added by Wave 4, no FK constraint). This column is not in the Prisma schema and is unrelated to the Wave 4 `updated_by_id` column added by this migration. It is schema drift from a prior migration. Low priority — no action required in Prompt 2b scope.

---

## Live DB Verification

### Column query — 24 rows

```
DriverInvitation.createdById    YES  uuid
DriverInvitation.updatedById    YES  uuid
Playbook.createdById            YES  uuid
Playbook.updatedById            YES  uuid
PlaybookInstance.createdById    YES  uuid
PlaybookInstance.updatedById    YES  uuid
PlaybookTrigger.createdById     YES  uuid
PlaybookTrigger.updatedById     YES  uuid
StepTemplate.createdById        YES  uuid
StepTemplate.updatedById        YES  uuid
SupportTicket.createdById       YES  uuid
SupportTicket.updatedById       YES  uuid
driver_bonuses.updated_by       YES  uuid
driver_compensation_templates.updated_by  YES  uuid
driver_deductions.updated_by    YES  uuid
driver_disputes.updated_by      YES  uuid
driver_settlements.updated_by   YES  uuid
load_driver_assignments.updated_by YES uuid
load_pay_components.updated_by  YES  uuid
pay_component_attachments.updated_by YES uuid
route_template_stops.created_by_id YES uuid
route_templates.created_by_id   YES  uuid
route_templates.updated_by      YES  uuid  ← pre-existing schema drift, not Wave 4
route_templates.updated_by_id   YES  uuid
```

### FK constraint query — 31 constraints

```
DriverInvitation_createdById_fkey              SET NULL
DriverInvitation_updatedById_fkey              SET NULL
Playbook_createdById_fkey                      SET NULL
Playbook_updatedById_fkey                      SET NULL
PlaybookInstance_createdById_fkey              SET NULL
PlaybookInstance_updatedById_fkey              SET NULL
PlaybookTrigger_createdById_fkey               SET NULL
PlaybookTrigger_updatedById_fkey               SET NULL
StepTemplate_createdById_fkey                  SET NULL
StepTemplate_updatedById_fkey                  SET NULL
SupportTicket_createdById_fkey                 SET NULL
SupportTicket_updatedById_fkey                 SET NULL
driver_bonuses_created_by_fkey                 SET NULL  ← pre-existing (Prompt 2a)
driver_bonuses_updated_by_fkey                 SET NULL  ← NEW Wave 4
driver_compensation_templates_created_by_fkey  SET NULL  ← pre-existing
driver_compensation_templates_updated_by_fkey  SET NULL  ← NEW Wave 4
driver_deductions_created_by_fkey              SET NULL  ← pre-existing
driver_deductions_updated_by_fkey              SET NULL  ← NEW Wave 4
driver_disputes_created_by_fkey                SET NULL  ← pre-existing
driver_disputes_updated_by_fkey                SET NULL  ← NEW Wave 4
driver_settlements_created_by_fkey             SET NULL  ← pre-existing
driver_settlements_updated_by_fkey             SET NULL  ← NEW Wave 4
load_driver_assignments_created_by_fkey        SET NULL  ← pre-existing
load_driver_assignments_updated_by_fkey        SET NULL  ← NEW Wave 4
load_pay_components_created_by_fkey            SET NULL  ← pre-existing
load_pay_components_updated_by_fkey            SET NULL  ← NEW Wave 4
pay_component_attachments_created_by_fkey      SET NULL  ← pre-existing
pay_component_attachments_updated_by_fkey      SET NULL  ← NEW Wave 4
route_template_stops_created_by_id_fkey        SET NULL
route_templates_created_by_id_fkey             SET NULL
route_templates_updated_by_id_fkey             SET NULL
```

---

## Verification Gates

| Gate | Check | Result |
|---|---|---|
| 1 | `npx prisma validate` exits 0 | PASS |
| 2 | `npx prisma generate` exits 0 | PASS |
| 3 | `npx tsc --noEmit` — no new errors (baseline framer-motion/d3-geo errors unchanged) | PASS |
| 4 | Column query returns 24 rows, all nullable uuid | PASS |
| 5 | FK constraint query returns 31 constraints, all SET NULL | PASS |
| 6 | TypeScript widenings applied inline (settlements.fixture.ts) | PASS |

---

## TypeScript Widenings

**File:** `apps/web/src/lib/driver-pay/__tests__/exporters/__fixtures__/settlements.fixture.ts`

**Change:** Added `updatedBy: null` after `createdBy` in all fixture objects (settlement, payComponents, bonuses) for both `w2Settlement` and `c1099Settlement`. The new `updatedBy String?` field on `DriverSettlement`, `LoadPayComponent`, and `DriverBonus` is nullable, so `null` is the correct test fixture value for legacy rows.

**No other widenings required.** Route types, API routes, and server actions do not reference `createdById`/`updatedById` on the newly migrated models yet — Prompt 3 will wire the middleware injection.

---

## Files Modified

- `apps/web/prisma/schema.prisma` — 16 models + User model edited
- `apps/web/prisma/migrations/20260517250001_tkt0015_2b_wave4_driver_pay_audit_columns/migration.sql` — new idempotent migration
- `apps/web/src/lib/db/extensions/audit-columns.ts` — EXEMPT + CREATE_ONLY sets updated
- `apps/web/src/lib/driver-pay/__tests__/exporters/__fixtures__/settlements.fixture.ts` — updatedBy: null widenings
- `apps/web/src/generated/prisma/` — regenerated Prisma client

---

## Commit SHA

`1b261af2` — feat(quick-365): TKT-0015 Prompt 2b Wave 4 — driver pay / workflow / template audit FKs (16 tables)

---

## Tables NOT Touched in This Wave

- All Wave 1–3 tables (Tag, ExpenseCategory, fleet/carrier models, finance/CRM models) — already migrated
- `Truck` / `Route` / `Load` / `Invoice` / `PayrollRecord` — already had full audit FKs pre-rollout
- `PlaybookStep` / `StepInstance` — pre-existing `createdBy`/`updatedBy` fields from quick-327; added to EXEMPT_AUDIT_MODELS
- `CarrierDocument`, `CarrierDocumentType`, `InAppNotification`, `RouteTemplateStop` (already CREATE_ONLY) — not in Wave 4 scope per user brief

---

WAVE 4 COMPLETE

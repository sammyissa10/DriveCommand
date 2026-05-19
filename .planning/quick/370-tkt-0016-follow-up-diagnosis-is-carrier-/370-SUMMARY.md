---
phase: quick
plan: "370"
subsystem: carrier/facilities
tags: [audit, facility_type, TKT-0016, read-only, diagnosis, carrier_catalog_meta]
dependency_graph:
  requires: [facility_type-audit-report]
  provides: [carrier_catalog_meta-read-site-verdict]
  affects: []
tech_stack:
  added: []
  patterns: []
key_files:
  created:
    - .planning/quick/370-tkt-0016-follow-up-diagnosis-is-carrier-/370-SUMMARY.md
  modified: []
decisions:
  - "carrier_catalog_meta IS NOT read for facility_type anywhere in the application — the out-of-sync rows are dead data, safe to delete or replace without runtime risk"
metrics:
  completed_date: "2026-05-18"
---

# Phase quick Plan 370: TKT-0016 Follow-up — Is carrier_catalog_meta Read for facility_type? Summary

Read-only grep audit to determine whether any code path in DriveCommand reads `carrier_catalog_meta` filtered by `enum_group = 'facility_type'`, establishing whether the out-of-sync seed rows are live data or dead data.

---

## 1. Scope

**Searched:**
- `apps/web/src/` — all files, patterns `carrier_catalog_meta` and `carrierCatalogMeta`
- `apps/mobile/` — all files, patterns `carrier_catalog_meta` and `carrierCatalogMeta`
- `packages/` — all files, patterns `carrier_catalog_meta` and `carrierCatalogMeta`
- `apps/web/prisma/` — schema and all migration `.sql` files, patterns `carrier_catalog_meta`, `carrierCatalogMeta`, `enum_group`, `enumGroup`
- `apps/web/src/` — all `.ts` and `.tsx` files, patterns `enum_group` and `enumGroup`
- `apps/mobile/` — all files, patterns `enum_group` and `enumGroup`
- `packages/` — all files, patterns `enum_group` and `enumGroup`

**Excluded from enumeration (generated code, not application code):**
- `apps/web/src/generated/prisma/` — machine-generated Prisma client output (`index.d.ts`, `index.js`, `edge.js`, `index-browser.js`, `schema.prisma`). These files contain the Prisma delegate definitions and type declarations for `carrierCatalogMeta` as a natural consequence of it being in the Prisma schema. They are not authored read sites.

---

## 2. Read Sites of carrier_catalog_meta

### 2a. Application code (actions, API routes, components, hooks, lib)

| file:line | app | classification | filters by enum_group='facility_type'? | notes |
|-----------|-----|----------------|----------------------------------------|-------|
| — | — | — | — | **Zero hits** outside the generated/ directory |

Grep across `apps/web/src/**/*.ts` and `apps/web/src/**/*.tsx` (excluding generated/) returned zero matches for both `carrier_catalog_meta` and `carrierCatalogMeta`. The table accessor `prisma.carrierCatalogMeta` is defined in the Prisma client but never called from any application file.

### 2b. Mobile app

| file:line | app | classification | filters by enum_group='facility_type'? | notes |
|-----------|-----|----------------|----------------------------------------|-------|
| — | — | — | — | **Zero hits** in `apps/mobile/` |

### 2c. Shared packages

| file:line | app | classification | filters by enum_group='facility_type'? | notes |
|-----------|-----|----------------|----------------------------------------|-------|
| — | — | — | — | **Zero hits** in `packages/` |

### 2d. Generated Prisma client (not application code — listed for completeness only)

| file:line | app | classification | notes |
|-----------|-----|----------------|-------|
| `apps/web/src/generated/prisma/schema.prisma:2478` | web | MIGRATION/SCHEMA | `@@map("carrier_catalog_meta")` — model declaration |
| `apps/web/src/generated/prisma/index.d.ts:2121–88831` | web | DOC/TYPE | Prisma delegate type declarations — generated from schema, not authored |
| `apps/web/src/generated/prisma/index.js:2430–2436` | web | DOC/TYPE | Prisma runtime model registration — generated |
| `apps/web/src/generated/prisma/edge.js:2429–2435` | web | DOC/TYPE | Prisma edge runtime registration — generated |

### 2e. Prisma schema (source)

| file:line | app | classification | notes |
|-----------|-----|----------------|-------|
| `apps/web/prisma/schema.prisma:2471` | web | SCHEMA | `enumGroup String @map("enum_group")` — field definition |
| `apps/web/prisma/schema.prisma:2477` | web | SCHEMA | `@@unique([enumGroup, enumValue])` — unique index |
| `apps/web/prisma/schema.prisma:2478` | web | SCHEMA | `@@map("carrier_catalog_meta")` — table mapping |

### 2f. Migration SQL files

| file:line | app | classification | notes |
|-----------|-----|----------------|-------|
| `apps/web/prisma/migrations/20260404100014_carrier_seed_enums/migration.sql:7` | web | MIGRATION | `CREATE TABLE carrier_catalog_meta (...)` — DDL |
| `apps/web/prisma/migrations/20260404100014_carrier_seed_enums/migration.sql:20–21` | web | MIGRATION | `CREATE UNIQUE INDEX carrier_catalog_meta_group_value` |
| `apps/web/prisma/migrations/20260404100014_carrier_seed_enums/migration.sql:27–193` | web | MIGRATION (WRITE) | All 18 `INSERT INTO carrier_catalog_meta` blocks — seed data writes, not reads |

---

## 3. enum_group Inventory

**All enum_group values used anywhere in the codebase:**

| enum_group value | source | file:line | purpose |
|-----------------|--------|-----------|---------|
| `client_status` | migration seed | `20260404100014_.../migration.sql:27–31` | CRM client status options |
| `contract_type` | migration seed | `20260404100014_.../migration.sql:34–39` | Carrier contract type options |
| `rate_type` | migration seed | `20260404100014_.../migration.sql:42–51` | Rate type options |
| `fuel_surcharge_method` | migration seed | `20260404100014_.../migration.sql:54–59` | Fuel surcharge method options |
| `schedule_type` | migration seed | `20260404100014_.../migration.sql:62–66` | Schedule type options |
| `equipment_type` | migration seed | `20260404100014_.../migration.sql:69–76` | Equipment type options |
| `dispatch_status` | migration seed | `20260404100014_.../migration.sql:79–85` | Dispatch status options |
| `load_status` | migration seed | `20260404100014_.../migration.sql:88–96` | Load status options |
| `load_type` | migration seed | `20260404100014_.../migration.sql:99–104` | Load type options (FTL/LTL/etc.) |
| `stop_type` | migration seed | `20260404100014_.../migration.sql:107–113` | Route stop type options |
| `stop_status` | migration seed | `20260404100014_.../migration.sql:116–121` | Route stop status options |
| `document_type` | migration seed | `20260404100014_.../migration.sql:124–134` | Document type options |
| `expense_type` | migration seed | `20260404100014_.../migration.sql:137–146` | Expense type options |
| `paid_by` | migration seed | `20260404100014_.../migration.sql:149–154` | Expense paid-by options |
| `pay_model` | migration seed | `20260404100014_.../migration.sql:157–163` | Driver pay model options |
| `pay_record_status` | migration seed | `20260404100014_.../migration.sql:166–171` | Payroll record status options |
| `facility_type` | migration seed | `20260404100014_.../migration.sql:174–180` | Facility type options (out-of-sync with DB CHECK) |
| `truck_type` | migration seed | `20260404100014_.../migration.sql:183–186` | Truck type options |
| `driver_status` | migration seed | `20260404100014_.../migration.sql:189–193` | Driver status options |

**Critical finding:** Every single `enum_group` value in this inventory appears **only** in the migration SQL seed file. No application code (`apps/web/src/`, `apps/mobile/`, `packages/`) references any `enum_group` value as a filter string — not `'facility_type'`, not `'load_status'`, not any other value. The `carrier_catalog_meta` table was seeded but never wired to any consumer.

---

## 4. Verdict

**carrier_catalog_meta IS NOT read for facility_type** anywhere in the DriveCommand codebase.

A comprehensive grep audit across every non-generated TypeScript and TSX file in `apps/web/src/`, every file in `apps/mobile/`, and every file in `packages/` found zero occurrences of `carrier_catalog_meta`, `carrierCatalogMeta`, `enum_group`, or `enumGroup` outside the machine-generated Prisma client directory (`apps/web/src/generated/prisma/`). The Prisma model is defined in the schema and the client delegate is generated, but the accessor (`prisma.carrierCatalogMeta`) is never called from any server action, API route, component, hook, or utility file.

There are no dynamic enum_group variable assignments to investigate. No indirection exists where a variable might resolve to `'facility_type'` at runtime — the string `'facility_type'` does not appear in any application source file at all.

**The `carrier_catalog_meta` facility_type rows are confirmed dead data.** They were seeded in migration 014 but never connected to any read path. The facility type dropdown in `FacilityForm.tsx` uses a hardcoded inline array (`FACILITY_TYPES`), and the DB CHECK constraint on the `facilities` table is the enforcement mechanism. Neither reads from `carrier_catalog_meta`.

**No caveats.** The verdict is unambiguous.

---

## 5. Recommended Next Action

**Delete the out-of-sync rows in carrier_catalog_meta (dead data).**

The four values `shipper`, `receiver`, `fuel_stop`, `other` in `carrier_catalog_meta` for `enum_group = 'facility_type'` are dead data — they are never read at runtime and four of them are incompatible with the DB CHECK constraint on the `facilities` table. The `carrier_catalog_meta` `facility_type` block should either be:

- **Option A (clean):** Replace all 5 `facility_type` rows in `carrier_catalog_meta` to match the CHECK constraint values (`terminal`, `yard`, `warehouse`, `drop_yard`, `customer_site`) via a new migration, keeping the table consistent for potential future use.
- **Option B (minimal):** Delete all 5 `facility_type` rows from `carrier_catalog_meta` outright, since the table is not currently read by any consumer and the inline `FACILITY_TYPES` array in `FacilityForm.tsx` + the DB CHECK constraint are the single source of truth.

Option A is preferred if `carrier_catalog_meta` is intended to eventually be a dynamic catalog used for dropdowns. Option B is preferred if the table is confirmed to be unused infrastructure that will be removed or redesigned in a future phase.

Either option is zero-risk from a runtime perspective — no live code reads these rows.

---

## Deviations from Plan

None — plan executed exactly as written. Read-only grep audit only. No source files modified, no migrations applied, no DB queries executed, no git commits created for source code.

## Self-Check: PASSED

- `.planning/quick/370-tkt-0016-follow-up-diagnosis-is-carrier-/370-SUMMARY.md` — created (this file)
- All 5 required sections present: Scope, Read sites, enum_group inventory, Verdict, Recommended next action
- Every grep hit enumerated with file:line
- Verdict is unambiguous: "carrier_catalog_meta IS NOT read for facility_type"
- Zero source files outside `.planning/` modified (`git status` will confirm only `.planning/` changes)

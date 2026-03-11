---
phase: 25-sysadmin-invoicing-module
plan: "01"
subsystem: sysadmin-invoicing
tags: [prisma, schema, server-actions, billing, rls]
dependency_graph:
  requires: [Phase 23 SysAdmin Portal (auth patterns, requireAdminAccess)]
  provides: [SysAdminInvoice Prisma models, sysadmin-invoices server actions]
  affects: [Phase 25 Plan 02 (UI), Phase 25 Plan 03 (email/cron)]
tech_stack:
  added: [decimal.js]
  patterns: [base-prisma-client, requireAdminAccess guard, Zod validation, $transaction for atomic item replace]
key_files:
  created:
    - prisma/migrations/20260311000001_add_sysadmin_invoices/migration.sql
    - src/app/(admin)/actions/sysadmin-invoices.ts
  modified:
    - prisma/schema.prisma
    - package.json
decisions:
  - "Used decimal.js (installed as new dependency) for monetary arithmetic precision in subtotal/amount calculations"
  - "SysAdminInvoice.invoiceNumber is globally @unique (not tenant-scoped) — SINV-XXXX sequence spans all tenants"
  - "updateSysAdminInvoice uses prisma.$transaction to atomically delete then recreate items"
  - "markOverdueInvoices guards with requireAdminAccess() to keep cron caller responsible for auth bypass"
metrics:
  duration: 164s
  completed: "2026-03-11"
  tasks: 2
  files_affected: 4
---

# Phase 25 Plan 01: Data Layer — Schema Models + Server Actions Summary

SysAdminInvoice and SysAdminInvoiceItem Prisma models, migration SQL with RLS deny policies, and 9 server actions (full CRUD + status transitions) using base Prisma client and Decimal.js precision arithmetic.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Schema models + migration SQL | 6cd2ff2 | prisma/schema.prisma, prisma/migrations/.../migration.sql |
| 2 | Server actions — CRUD + status transitions | 471a5fb | src/app/(admin)/actions/sysadmin-invoices.ts, package.json |

## What Was Built

### Schema (prisma/schema.prisma)
- `SysAdminInvoiceStatus` enum: DRAFT, SENT, PAID, OVERDUE, VOID
- `SysAdminInvoice` model: globally unique `invoiceNumber` (SINV-XXXX), full status lifecycle fields, soft-delete via `archivedAt`, 4 indexes
- `SysAdminInvoiceItem` model: cascade-delete from parent invoice, stores pre-computed `amount` for query performance
- `sysAdminInvoices` relation added to `Tenant` model

### Migration SQL (prisma/migrations/20260311000001_add_sysadmin_invoices/migration.sql)
- DDL for both tables with proper FK constraints and indexes
- RLS enabled on both tables with deny policy for any request carrying `app.current_tenant_id` session variable
- Admin portal uses base prisma client (no tenant context set), so tables are effectively admin-only

### Server Actions (src/app/(admin)/actions/sysadmin-invoices.ts)
All 9 exported functions, all guarded with `requireAdminAccess()`:

| Export | Purpose |
|--------|---------|
| `generateInvoiceNumber` | Sequential SINV-XXXX, globally unique |
| `createSysAdminInvoice` | Zod-validated create with nested item creation, Decimal.js arithmetic |
| `getSysAdminInvoices` | List with tenant name, filterable by tenantId/status, excludes archived |
| `getSysAdminInvoiceById` | Full invoice + items + ownerUser email |
| `updateSysAdminInvoice` | DRAFT-only edit, atomic item replace via $transaction |
| `markInvoicePaid` | SENT/OVERDUE → PAID with paidAt timestamp |
| `voidInvoice` | DRAFT/SENT → VOID (blocked if PAID) |
| `archiveInvoice` | Soft-delete, DRAFT only |
| `markOverdueInvoices` | Batch SENT → OVERDUE for nightly cron |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] decimal.js not installed**
- **Found during:** Task 2 (writing server actions)
- **Issue:** Plan called for `import { Decimal } from 'decimal.js'` but the package was not in package.json
- **Fix:** Ran `npm install decimal.js`; confirmed working with node test
- **Files modified:** package.json, package-lock.json
- **Commit:** 471a5fb

## Self-Check: PASSED

- FOUND: prisma/schema.prisma
- FOUND: prisma/migrations/20260311000001_add_sysadmin_invoices/migration.sql
- FOUND: src/app/(admin)/actions/sysadmin-invoices.ts
- FOUND: commit 6cd2ff2
- FOUND: commit 471a5fb

---
phase: quick
plan: 394
subsystem: sysadmin-tenant-settings
tags: [sysadmin, tenant, settings, tkt-0037]
dependency_graph:
  requires: []
  provides: [tenant-advanced-settings-ui]
  affects: [admin-tenant-detail-page]
tech_stack:
  added: []
  patterns: [useState+useTransition, details-summary-collapsible, zod-v4-validation]
key_files:
  created: []
  modified:
    - apps/web/src/app/(admin)/actions/tenants.ts
    - apps/web/src/app/(admin)/tenants/[id]/tenant-settings-form.tsx
    - apps/web/src/app/(admin)/tenants/[id]/page.tsx
decisions:
  - "profitMarginThreshold stored as whole-number percentage (0-100), not fraction (0-1)"
  - "Used <details>/<summary> for Advanced section — no new UI dependencies"
  - "Removed invalid_type_error from Zod schema (Zod v4 incompatible) — kept min/max messages"
metrics:
  duration: ~10 minutes
  completed: 2026-05-19
  tasks_completed: 3
  files_modified: 3
---

# Quick 394: TKT-0037 Part 1 — Advanced Tenant Settings Summary

Surface 3 existing-but-hidden Tenant fields in the sysadmin Tenant Settings form: `profitMarginThreshold` (decimal percentage), `fleetSizeBucket` (enum), and `manualTrial` (boolean).

## profitMarginThreshold Interpretation

**Chosen: whole-number percentage (0-100).**

Evidence from codebase grep:
- `apps/web/.planning/phases/16-route-finance-foundation/16-01-SUMMARY.md`: "Used Decimal(5,2) for profitMarginThreshold since it's a percentage (0-100)"
- `apps/web/.planning/phases/16-route-finance-foundation/16-03-PLAN.md`: `profitMarginThreshold: number = 10` and `marginPercent < profitMarginThreshold` — confirms 10 means 10%, compared against a percent value
- Schema default `@default(10)` with `Decimal(5,2)` strongly implies 10.00 = 10%

Validation: 0 <= x <= 100, step 0.01.

## Existing Readers Found

- `apps/web/.planning/phases/16-route-finance-foundation/16-05-PLAN.md` and SUMMARY reference `profitMarginThreshold` being used to trigger low-margin alerts on routes
- Stored value is compared as a percentage (e.g. `marginPercent < profitMarginThreshold`)
- No runtime reader exists in the current production codebase beyond the DB default — the field was being set but never surfaced in the admin UI

## What Was Built

### Task 1: Server Action Extension (`actions/tenants.ts`)

- `getTenantById` select extended with `profitMarginThreshold: true`, `fleetSizeBucket: true`, `manualTrial: true`
- `updateTenantSettings` signature extended to accept all 6 fields
- Zod schema updated: `z.number().min(0).max(100)` for threshold, `z.enum([...])` for bucket, `z.boolean()` for trial
- Prisma update writes all 6 fields atomically in a single `prisma.tenant.update` call
- Note: `invalid_type_error` option removed — incompatible with Zod v4 (uses different error API)

### Task 2: Form UI (`tenant-settings-form.tsx`)

- `TenantSettingsFormProps` extended with 3 new required props
- `FLEET_SIZE_BUCKETS` constant added (4 enum values with human-readable labels)
- 3 new `useState` hooks added for the new fields
- `isDirty` check extended to include all 3 new fields
- `handleSubmit` validates threshold range client-side before calling the action
- Collapsible `<details>/<summary>` "Advanced" section added after the existing 3-column grid, before the submit button
  - Number input for profit margin threshold (step=0.01, min=0, max=100)
  - Select for fleet size bucket (4 options)
  - Checkbox for manual trial with descriptive helper text
- Single submit button saves all 6 fields atomically — no separate "Save Advanced" button

### Task 3: Page Wiring (`page.tsx`)

- `TenantSettingsForm` JSX extended with 3 new props
- `Number(tenant.profitMarginThreshold)` converts Prisma `Decimal` to plain JS number at the client boundary
- `tenant.fleetSizeBucket` and `tenant.manualTrial` passed through directly

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed `invalid_type_error` from Zod number schema**
- **Found during:** Task 1 TypeScript check
- **Issue:** Zod v4 (^4.3.6) does not support `invalid_type_error` as a key in the options object for `z.number()` — the API changed from Zod v3
- **Fix:** Removed `{ invalid_type_error: '...' }` from `z.number()` call; the field will still be validated as a number by Zod, and the client-side guard (`Number.isNaN(threshold)`) provides user-friendly messaging
- **Files modified:** `apps/web/src/app/(admin)/actions/tenants.ts`
- **Commit:** bb841b83

## TypeScript Check

`cd apps/web && npx tsc --noEmit` — zero errors in all 3 modified files. Pre-existing errors (framer-motion, zustand, nuqs, topojson missing packages) are unrelated and pre-dated this task.

## Self-Check

Files verified:
- `apps/web/src/app/(admin)/actions/tenants.ts` — contains `profitMarginThreshold`, `fleetSizeBucket`, `manualTrial` in both select and update
- `apps/web/src/app/(admin)/tenants/[id]/tenant-settings-form.tsx` — contains Advanced section with all 3 inputs
- `apps/web/src/app/(admin)/tenants/[id]/page.tsx` — passes `initialProfitMarginThreshold`, `initialFleetSizeBucket`, `initialManualTrial`

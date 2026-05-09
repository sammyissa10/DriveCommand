---
phase: 289
plan: 01
subsystem: driver-pay
tags: [compensation, wizard, payroll, server-actions, validation]
dependency_graph:
  requires: [96b3764]  # Phase 1 schema migration for DriverCompensationTemplate
  provides: [compensation-template-wizard, active-template-card, template-history]
  affects: [driver-profile-page, payroll-downstream]
tech_stack:
  added: [decimal.js client-side Decimal math]
  patterns: [3-step wizard with hoisted useState, SerializedTemplate for server→client transport]
key_files:
  created:
    - packages/validation/src/driver-compensation.ts
    - apps/web/src/app/(owner)/actions/driver-compensation-templates.ts
    - apps/web/src/app/(owner)/drivers/[id]/compensation/page.tsx
    - apps/web/src/app/(owner)/drivers/[id]/compensation/wizard/page.tsx
    - apps/web/src/components/driver-compensation/active-template-card.tsx
    - apps/web/src/components/driver-compensation/template-history.tsx
    - apps/web/src/components/driver-compensation/wizard/starter-templates.ts
    - apps/web/src/components/driver-compensation/wizard/wizard-step-1-pay-model.tsx
    - apps/web/src/components/driver-compensation/wizard/wizard-step-2-rate-and-unit.tsx
    - apps/web/src/components/driver-compensation/wizard/wizard-step-3-add-ons.tsx
    - apps/web/src/components/driver-compensation/wizard/live-preview-panel.tsx
    - apps/web/src/components/driver-compensation/wizard/confirmation-card.tsx
  modified:
    - packages/validation/src/index.ts
    - apps/web/src/app/(owner)/drivers/[id]/page.tsx
decisions:
  - "ActionState from @drivecommand/types is not generic — used custom typed return signatures per action"
  - "SerializedTemplate exported from actions file so components can type-check props without Prisma imports"
  - "decimal.js is available from root node_modules (Prisma transitive dep) — no explicit install needed"
  - "fuelSurchargeEnabled is wizard-only UI state; maps to fuelSurchargeRate=null when off in createTemplate payload"
  - "Compensation page driver name lookup: CarrierDriver first (orgId-scoped), fallback to User model"
metrics:
  duration: ~45 minutes
  completed: 2026-05-09
  tasks_completed: 3
  files_created: 12
  files_modified: 2
---

# Phase 289 Plan 01: Driver Pay Phase 2 — Compensation Template Wizard Summary

Built the full compensation template wizard, active template display, and history view for DriveCommand's driver pay module. Owners can now define how each driver is paid using a guided 3-step wizard with live preview.

## What Was Built

### Task 1 — Validation schemas + server actions

**`packages/validation/src/driver-compensation.ts`**
- Zod enums matching Prisma exactly: `DriverPayType` (CPM/HOURLY/FLAT_PER_LOAD/PERCENTAGE/DAILY/SALARY), `RateUnit` (PER_MILE/PER_HOUR/PER_LOAD/PERCENTAGE/PER_DAY/ANNUAL), `EmploymentType` (W2_EMPLOYEE/OWNER_OPERATOR_1099/LEASE_OPERATOR)
- `driverCompensationTemplateCreateSchema` with `.superRefine`: percentage cap (baseRate ≤ 1), overtime details required when enabled, per diem rate required when enabled
- Exported to `@drivecommand/validation` via index.ts; package rebuilt to dist

**`apps/web/src/app/(owner)/actions/driver-compensation-templates.ts`**
- `listTemplatesForDriver(driverId)` — looks up CarrierDriver with `orgId: tenantId` (no auto-RLS), returns all templates ordered by effectiveFrom desc
- `getActiveTemplate(driverId)` — same CarrierDriver lookup, returns first with `effectiveTo: null`
- `createTemplate(driverId, input)` — validates, looks up CarrierDriver, `$transaction` to close prior active (set effectiveTo = effectiveFrom - 1 day) then creates new; all Decimal fields converted via `new Prisma.Decimal()`
- `getCopyableTemplates()` — lists active templates across all tenant drivers with driver name
- All Decimal values serialized to strings via `SerializedTemplate` type for safe client transport

### Task 2 — Wizard route + components + live preview

**`wizard/page.tsx`** — `'use client'`, `WizardFormState` hoisted via `useState` (not `useFormState`). Three-step progress bar. Steps 2/3/confirm render in `lg:grid-cols-3` layout alongside sticky `LivePreviewPanel`.

**`starter-templates.ts`** — 5 presets: Standard OTR CPM ($0.55/mi, OT 40h/1.5x), Local Hourly ($25/hr, OT), Hotshot Flat ($300/load), Owner-Op 80%, Dedicated Salary ($65k/yr). Applying a starter skips step 2 (sets `currentStep: 3`).

**`wizard-step-1-pay-model.tsx`** — 6 pay model selection cards with smart `rateUnit` defaults. "Use a starter template" collapsible. "Copy from another driver" collapsible with `getCopyableTemplates()` on mount.

**`wizard-step-2-rate-and-unit.tsx`** — rate input with `$` prefix or percentage hint, inline validation mirroring Zod refinements, rate unit select (locked to pay type options), employment type, currency (USD/CAD), effective date, `loadedMilesOnly` switch (CPM only).

**`wizard-step-3-add-ons.tsx`** — overtime toggle (threshold + multiplier + daily OT, required when on), per diem toggle (rate required when on), fuel surcharge toggle (rate required when on), optional weekly earning goal, optional notes.

**`live-preview-panel.tsx`** — sticky Card, `import Decimal from 'decimal.js'`, 412-mile sample calculation per payType. Shows base earnings, per diem addition, FSC addition, total, add-on chips. `Intl.NumberFormat` for currency formatting.

**`confirmation-card.tsx`** — three-section summary (Pay Model, Rate & Details, Add-ons) with Pencil edit buttons per step. "Save Template" calls `createTemplate` via parent handler, shows Loader2 spinner while saving.

### Task 3 — Compensation page + active card + history + driver profile link

**`compensation/page.tsx`** — server component. Calls `getActiveTemplate` + `listTemplatesForDriver` in parallel. Driver name resolved via CarrierDriver (orgId-scoped) with User model fallback. Full empty state when no templates; partial empty state with history when active is null but history exists.

**`active-template-card.tsx`** — formatted rate display (large font), employment type chip, OT/perDiem/FSC add-on chips in success colors (`bg-green-50 dark:bg-green-950/50 text-green-700 dark:text-green-400`), "Effective since [date]" badge (green), "Ending soon" badge (amber, triggers when effectiveTo ≤ 7 days), "End and replace" CTA link to wizard.

**`template-history.tsx`** — compact card with row-per-template, effective range (latest shows "present"), active badge, rate + unit display.

**`drivers/[id]/page.tsx`** — new Compensation section card before Audit Trail, with description text and "Manage compensation" link styled as primary button.

## Key Implementation Notes

### RLS handling for CarrierDriver
`CarrierDriver` is explicitly exempt from tenant auto-injection. Every lookup includes `orgId: tenantId`:
```ts
const cd = await prisma.carrierDriver.findFirst({ where: { userId: driverId, orgId: tenantId } })
```
`DriverCompensationTemplate` gets auto-injection from the tenant Prisma extension.

### Transaction strategy
`$transaction` is called on the tenant-scoped prisma client. The tenant extension wraps each individual operation so auto-injection still applies inside the transaction callback:
1. Find current active (effectiveTo: null)
2. Update it: set effectiveTo = effectiveFrom - 86400000ms
3. Create new template with all fields

### Smart defaults map (step 1 → step 2)
| Pay type | Default rate unit |
|----------|------------------|
| CPM | PER_MILE |
| HOURLY | PER_HOUR |
| FLAT_PER_LOAD | PER_LOAD |
| PERCENTAGE | PERCENTAGE |
| DAILY | PER_DAY |
| SALARY | ANNUAL |

### Money convention
- Server-side: `const Decimal = Prisma.Decimal` from `@/generated/prisma`
- Client-side (live preview): `import Decimal from 'decimal.js'`
- Transport: all Decimal serialized to string in `SerializedTemplate`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ActionState is not generic in @drivecommand/types**
- **Found during:** Task 1 TypeScript check
- **Issue:** Plan referenced `ActionState<{ id: string }>` but the type is `ActionState = { error?, data?: unknown, ... }` (not generic)
- **Fix:** Replaced all action return signatures with explicit typed unions: `Promise<{ data?: { id: string }; error?: string }>`
- **Files modified:** `apps/web/src/app/(owner)/actions/driver-compensation-templates.ts`
- **Commit:** e3cbbde

**2. [Rule 2 - Missing] Validation package needs build before web app can resolve exports**
- **Found during:** Task 1 first TypeScript check (`Module '"@drivecommand/validation"' has no exported member 'driverCompensationTemplateCreateSchema'`)
- **Fix:** Ran `npm run build` in `packages/validation/` to compile the new `driver-compensation.ts` to `dist/`
- **Note:** dist/ is gitignored so build must run locally; postinstall hook handles CI

**3. [Rule 2 - Missing] fuelSurchargeEnabled as wizard-local boolean**
- **Found during:** Task 2 — Prisma schema has `fuelSurchargeRate` as nullable Decimal (null = disabled), not a separate boolean column
- **Fix:** Added `fuelSurchargeEnabled: boolean` to `WizardFormState` as a UI-only toggle. When saving: if `!fuelSurchargeEnabled`, passes `fuelSurchargeRate: null` to `createTemplate`. Server stores null for disabled, non-null for enabled — matches schema exactly.

## Self-Check

### Files created
- [x] packages/validation/src/driver-compensation.ts
- [x] packages/validation/src/index.ts (modified)
- [x] apps/web/src/app/(owner)/actions/driver-compensation-templates.ts
- [x] apps/web/src/app/(owner)/drivers/[id]/compensation/page.tsx
- [x] apps/web/src/app/(owner)/drivers/[id]/compensation/wizard/page.tsx
- [x] apps/web/src/components/driver-compensation/active-template-card.tsx
- [x] apps/web/src/components/driver-compensation/template-history.tsx
- [x] apps/web/src/components/driver-compensation/wizard/starter-templates.ts
- [x] apps/web/src/components/driver-compensation/wizard/wizard-step-1-pay-model.tsx
- [x] apps/web/src/components/driver-compensation/wizard/wizard-step-2-rate-and-unit.tsx
- [x] apps/web/src/components/driver-compensation/wizard/wizard-step-3-add-ons.tsx
- [x] apps/web/src/components/driver-compensation/wizard/live-preview-panel.tsx
- [x] apps/web/src/components/driver-compensation/wizard/confirmation-card.tsx
- [x] apps/web/src/app/(owner)/drivers/[id]/page.tsx (modified)

### TypeScript
- [x] `npx tsc --noEmit` — zero errors in apps/web
- [x] `npx tsc --noEmit` — zero errors in packages/validation

### Commits
- e3cbbde feat(289-01): add driver-compensation Zod schemas + server actions
- 4d47ca7 feat(289-01): 3-step wizard + live preview + starter templates
- 94e2bb8 feat(289-01): compensation page + active card + history + driver profile link

## Self-Check: PASSED

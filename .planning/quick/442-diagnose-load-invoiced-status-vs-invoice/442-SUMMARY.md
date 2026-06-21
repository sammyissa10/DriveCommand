---
phase: quick-442
plan: 442
subsystem: financials / carrier-loads
tags: [diagnosis, invoicing, load-status, read-only]
key-files:
  read:
    - apps/web/prisma/schema.prisma
    - apps/web/src/app/(owner)/actions/loads.ts
    - apps/web/src/app/(owner)/actions/invoices.ts
    - apps/web/src/app/api/v1/carrier/loads/[id]/route.ts
    - apps/web/src/lib/carrier/loads.ts
    - apps/web/src/app/api/mobile/owner/loads/[id]/route.ts
    - apps/web/src/app/api/mobile/owner/invoices/route.ts
    - apps/web/src/app/api/v1/carrier/dashboard/kpi/route.ts
    - apps/web/src/components/loads/status-update-button.tsx
    - apps/web/src/components/carrier/loads/LoadDetailActions.tsx
    - docs/specs/Notifications System Technical Documentation.md
  created:
    - .planning/quick/442-diagnose-load-invoiced-status-vs-invoice/442-DIAGNOSIS.md
decisions:
  - "CarrierLoad status='invoiced' and Invoice rows are independent by design — CarrierLoad has no Invoice FK"
  - "Legacy Load INVOICED status requires a prior Invoice row (enforced by guard in web action, but not in mobile PATCH)"
  - "Zero invoiced loads and zero Invoice rows exist in production — no data gap"
metrics:
  completed: "2026-06-15"
  tasks: 2
---

# Phase quick-442: Diagnose Load 'invoiced' Status vs Invoice Record

Read-only diagnosis of the intended and actual relationship between a load reaching `status='invoiced'` and an Invoice record existing, prior to building invoice send/template UI.

## One-liner

Two separate load models (legacy `Load` + carrier `CarrierLoad`) have different Invoice coupling semantics: the legacy web path requires a prior Invoice (guarded); the carrier path treats 'invoiced' as an independent operational flag with no Invoice FK.

## What Was Done

- Searched all spec documents for invoice/invoiced/billing passages (spec is silent on coupling)
- Enumerated all 3 code paths that set a load to 'invoiced' status with file:line evidence
- Enumerated all 2 Invoice.create sites with trigger and side-effect characterization
- Ran read-only SQL to count invoiced loads and Invoice rows per tenant across production
- Produced 442-DIAGNOSIS.md with verdict A/B/C per load model and smallest fix description

## Deviations from Plan

None. Plan executed exactly as written (read-only). The diagnosis artifact (`442-DIAGNOSIS.md`) was created at the path specified in the plan.

Note: The plan artifact path in frontmatter (`442-DIAGNOSIS.md`) and the output section path are both `.planning/quick/442-.../442-DIAGNOSIS.md`, which is what was created.

## Key Findings

### Q1 — Spec Intent
All spec documents (workflow-engine PDF, DriverPay spec, Notifications spec) are **silent** on whether load.invoiced and Invoice creation are coupled. The Notifications spec lists `load.invoiced` (Load category) and `invoice.created` (Finance category) as separate trigger types, suggesting independence, but provides no explicit coupling rule.

### Q2 — Status Transitions to 'invoiced'
Three paths:
1. `apps/web/src/app/(owner)/actions/loads.ts:591` — legacy web action, **guarded**: requires `Invoice.count({ loadId }) > 0` before allowing status flip
2. `apps/web/src/app/api/mobile/owner/loads/[id]/route.ts:253` — mobile PATCH, **no guard**: accepts INVOICED freely
3. `apps/web/src/lib/carrier/loads.ts:409,419` — carrier REST, **no guard, no FK**: sets CarrierLoad.status, sends notifications; Invoice model has no CarrierLoad FK

### Q3 — Invoice Creation Paths
Two paths, neither touches Load.status:
1. `apps/web/src/app/(owner)/actions/invoices.ts:80` — manual web form, optional `loadId` FK to legacy Load
2. `apps/web/src/app/api/mobile/owner/invoices/route.ts:180` — mobile quick-create, no loadId, always DRAFT

### Q4 — Data Counts (production, read-only)
- Legacy Load INVOICED: **0** rows
- CarrierLoad `status='invoiced'`: **0** rows
- Invoice records total: **0** rows
- Gap (invoiced load with no Invoice): **0** across all 19 tenants

No data anomaly exists. The DELIVERED→INVOICED transition has never been exercised in production.

### Q5 — Verdict
- **Legacy Load system: Verdict (A) — Coupled by design AND coupled in code.** The web guard ensures Invoice must precede status flip. One inconsistency: mobile PATCH lacks the guard.
- **CarrierLoad system: Verdict (B) — Independent by design.** No Invoice FK exists on CarrierLoad; 'invoiced' is a free-standing operational state.
- **Smallest fix** (for the mobile gap): Add a 4-line Invoice count guard inside the mobile PATCH handler at `apps/web/src/app/api/mobile/owner/loads/[id]/route.ts` before `tx.load.update(...)`. No schema change required.

## Self-Check

- [x] 442-DIAGNOSIS.md exists and is > 40 lines
- [x] All 5 questions answered with spec citations and file:line evidence
- [x] Data counts come from read-only SELECTs
- [x] Zero source files, schema files, or migrations were modified
- [x] Git status will show only the two new .md files under .planning/

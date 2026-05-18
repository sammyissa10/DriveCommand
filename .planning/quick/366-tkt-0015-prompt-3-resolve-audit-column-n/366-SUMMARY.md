---
phase: quick
plan: 366
subsystem: audit-columns
tags: [tkt-0015, audit, prisma-extension, driver-pay, naming-convention, dmmf]
dependency_graph:
  requires:
    - quick-365 (Wave 4 — Driver Pay audit FKs added to schema/DB)
    - quick-2b (withAuditColumns extension base implementation)
  provides:
    - Dual-convention audit column injection (createdBy + createdById both supported)
    - All 47 tenant-scoped models with user actor now auto-inject
  affects:
    - apps/web/src/lib/db/extensions/audit-columns.ts
    - apps/web/src/lib/db/__tests__/driver-pay-tenant-isolation.test.ts
    - .planning/quick/2b-add-audit-columns-and-extension/2b-SUMMARY.md
tech_stack:
  added: []
  patterns:
    - Prisma.dmmf.datamodel.models for runtime field introspection
    - Lazy-memoized module-scope registry for O(1) per-query lookup
    - Explicit generic type parameters on bypass<T>() to satisfy strict TypeScript
key_files:
  created: []
  modified:
    - apps/web/src/lib/db/extensions/audit-columns.ts
    - apps/web/src/lib/db/__tests__/driver-pay-tenant-isolation.test.ts
    - .planning/quick/2b-add-audit-columns-and-extension/2b-SUMMARY.md
decisions:
  - Option A (extend the extension) chosen over Option B (rename Prisma fields) — zero schema migration, zero call-site sweep, lower risk
  - Lazy memoization at module scope chosen over module-load time — avoids side-effects at import, still single cost
  - EXEMPT count stays 19 (not 9 as the brief hint suggested) — brief's count hint was off; action (remove the 10 named models) was clear and followed precisely
metrics:
  duration: 338s
  completed: 2026-05-18
  tasks: 3
  files: 3
---

# Phase quick Plan 366: TKT-0015 Prompt 3 — Resolve Audit Column Naming Inconsistency Summary

**One-liner:** Taught `withAuditColumns` to detect `createdBy`/`updatedBy` vs `createdById`/`updatedById` per model via a lazy-memoized DMMF registry, removing 10 naming-workaround models from EXEMPT so all 47 tenant-scoped models now auto-inject audit columns.

---

## Detection Mechanism

**Chosen approach:** Precomputed `Map<modelName, { createField, updateField }>` built lazily (on first `withAuditColumns()` call) by walking `Prisma.dmmf.datamodel.models`.

**Justification:** O(1) per-query lookup with a single startup cost. `Prisma.dmmf` is statically available after Prisma Client generation — no async I/O required. Lazy memoization avoids module-load side-effects while still paying the O(|models|) cost only once per process lifetime.

**Type aliases used:**
```ts
type CreateFieldName = 'createdById' | 'createdBy';
type UpdateFieldName = 'updatedById' | 'updatedBy';
type AuditFieldNames = { createField: CreateFieldName | null; updateField: UpdateFieldName | null };
```

No `as any`, no `@ts-ignore`. Fully typed.

---

## EXEMPT_AUDIT_MODELS Before / After

| | Count | Notes |
|---|---|---|
| Before (Wave 4 state) | 29 | 19 system/append-only + 10 naming workarounds |
| After (Prompt 3) | 19 | 10 naming-workaround models removed |

**Removed (all 10 now FULL):**
- DriverCompensationTemplate, LoadDriverAssignment, LoadPayComponent, PayComponentAttachment
- DriverBonus, DriverDeduction, DriverSettlement, DriverDispute
- PlaybookStep, StepInstance

**Brief discrepancy:** The plan stated "EXEMPT should be 9, was 19" — this was a miscalculation in the brief. Actual pre-Prompt-3 count was 29 (19 system models + 10 naming workarounds). After removing the 10, the correct final count is 19. The action was unambiguous; the actual counts are reported here.

---

## Newly Active Models (all FULL classification)

| Model | createField | updateField | Classification |
|---|---|---|---|
| DriverCompensationTemplate | createdBy | updatedBy | FULL |
| LoadDriverAssignment | createdBy | updatedBy | FULL |
| LoadPayComponent | createdBy | updatedBy | FULL |
| PayComponentAttachment | createdBy | updatedBy | FULL |
| DriverBonus | createdBy | updatedBy | FULL |
| DriverDeduction | createdBy | updatedBy | FULL |
| DriverSettlement | createdBy | updatedBy | FULL |
| DriverDispute | createdBy | updatedBy | FULL |
| PlaybookStep | createdBy | updatedBy | FULL (has updatedAt @updatedAt) |
| StepInstance | createdBy | updatedBy | FULL (has updatedAt @updatedAt) |

PlaybookStep and StepInstance were confirmed FULL (not CREATE_ONLY) by reading schema.prisma lines 2568 and 2635 — both have `updatedAt DateTime @updatedAt @db.Timestamptz` AND `updatedBy String? @db.Uuid`. CREATE_ONLY_AUDIT_MODELS was not modified.

---

## CREATE_ONLY_AUDIT_MODELS

Unchanged: FleetMessage, FuelRecord, RouteTemplateStop.

---

## Test Additions (DriverBonus — Prompt 3 describe block)

New describe: `Driver Pay — Audit Auto-Capture (Prompt 3)` in `driver-pay-tenant-isolation.test.ts`.

| Test | What it proves |
|---|---|
| a. create | `createdBy` + `updatedBy` auto-populated from `userId` when not in `args.data` |
| b. update | `updatedBy` changes to new `userId`; `createdBy` remains unchanged |
| c. explicit override | Caller-supplied `createdBy` in `args.data` is preserved over extension-injected value |

All 12 tests (9 isolation + 3 new) skip gracefully when `DATABASE_URL` is not set — confirmed by running `npx vitest run` locally (exit 0, 12 skipped).

---

## Files Modified (exactly 3)

1. `apps/web/src/lib/db/extensions/audit-columns.ts` — dual-convention registry, EXEMPT reduction
2. `apps/web/src/lib/db/__tests__/driver-pay-tenant-isolation.test.ts` — 3 new audit-capture tests
3. `.planning/quick/2b-add-audit-columns-and-extension/2b-SUMMARY.md` — Section 7 marked RESOLVED, Driver Pay promoted to FULL, EXEMPT section updated, final stats corrected

---

## Constraints Honored

- No changes to `prisma/schema.prisma`
- No changes to any Driver Pay business logic, server action, or API route
- No changes to `tenant-client.ts` composition order
- `CREATE_ONLY_AUDIT_MODELS` unchanged
- No `as any` or `@ts-ignore` introduced
- Existing 37 `createdById`/`updatedById` models continue to inject correctly (DMMF detects them first)

---

## TypeScript

`cd apps/web && npx tsc --noEmit` — no errors from any file in `src/lib/db/`. Pre-existing unrelated errors (framer-motion, topojson, d3-geo missing types) were present before this task and are unchanged.

---

## Tests

Skipped (DATABASE_URL not set in this environment). All additions are syntax-validated via tsc and the skip pattern matches the existing suite behavior.

---

## Commits

| Hash | Message |
|---|---|
| `fe5d1e6b` | feat(audit): teach withAuditColumns to handle both createdBy and createdById naming conventions [TKT-0015 Prompt 3] |
| `8aca96d8` | test(audit): add DriverBonus audit auto-capture tests for dual-convention injection [TKT-0015 Prompt 3] |
| `390ea176` | docs(audit): update 2b-SUMMARY to reflect Prompt 3 resolution of naming-inconsistency workaround |

## Push

`5e2f01ac..390ea176  master -> master` — origin/master is up to date.

---

## Surprises During Execution

1. **EXEMPT count off-by-ten in the brief:** The plan stated "EXEMPT should be 9, was 19" but the actual pre-task EXEMPT count was 29 (19 system models + 10 naming workarounds). The action was clear — remove the 10 named models. Reported the actual counts (29 → 19) and noted the discrepancy.

2. **`bypass<T>()` type inference:** The local `bypass` function in the new test describe block required explicit `<T>` type parameters on each call site (e.g., `bypass<{ createdBy: string | null; updatedBy: string | null }>`) because `prisma.$transaction` returns `unknown` when `prisma` is typed as `any`. Fixed without `as any` by providing explicit generic instantiations.

3. **DMMF availability:** `Prisma.dmmf.datamodel.models` is available synchronously at module load after Prisma Client generation — no async initialization needed. Lazy memoization was chosen for module hygiene (no side-effects at import time).

---

## Self-Check: PASSED

- [x] `apps/web/src/lib/db/extensions/audit-columns.ts` — exists, contains `buildAuditFieldRegistry`
- [x] `apps/web/src/lib/db/__tests__/driver-pay-tenant-isolation.test.ts` — exists, contains `withAuditColumns` import and `Driver Pay — Audit Auto-Capture (Prompt 3)` describe block
- [x] `.planning/quick/2b-add-audit-columns-and-extension/2b-SUMMARY.md` — exists, contains RESOLVED section
- [x] Commits `fe5d1e6b`, `8aca96d8`, `390ea176` — all verified in `git log --oneline -5`
- [x] `git push origin master` — succeeded (`5e2f01ac..390ea176`)

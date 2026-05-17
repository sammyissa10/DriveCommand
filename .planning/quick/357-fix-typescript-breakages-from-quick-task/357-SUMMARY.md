---
phase: quick
plan: 357
subsystem: driver-pay
tags: [typescript, types, nullable, quick-fix]
dependency_graph:
  requires: [quick-356]
  provides: [green-tsc]
  affects: [driver-compensation-templates, driver-pay-api-routes, settlement-generator]
tech_stack:
  added: []
  patterns: [type-widening]
key_files:
  modified:
    - apps/web/src/app/(owner)/actions/driver-compensation-templates.ts
    - apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/route.ts
    - apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/route.ts
    - apps/web/src/app/api/driver-pay/assignments/[assignmentId]/corrections/route.ts
    - apps/web/src/app/api/driver-pay/drivers/[driverId]/bonuses/[bonusId]/route.ts
    - apps/web/src/app/api/driver-pay/drivers/[driverId]/bonuses/route.ts
    - apps/web/src/app/api/driver-pay/drivers/[driverId]/deductions/[deductionId]/route.ts
    - apps/web/src/app/api/driver-pay/drivers/[driverId]/deductions/route.ts
    - apps/web/src/app/api/driver-pay/settlements/route.ts
    - apps/web/src/lib/driver-pay/settlement-generator.ts
decisions:
  - "Let null flow through serialization — clients see null, not a coerced empty string or 'system'"
metrics:
  duration: ~5 minutes
  completed: 2026-05-16
---

# Phase quick Plan 357: Fix TypeScript Breakages from Quick Task 356 Summary

**One-liner:** Widened `createdBy: string` to `createdBy: string | null` in 10 driver-pay serializer parameter types and the `GenerateResult` interface to match Prisma's nullable column after QT-356 audit-FK cleanup.

## What Was Done

Quick Task 356 (commit 19d5930) made `createdBy` nullable on 14 audit-FK tables via migration `tkt0015_2a_cleanup_audit_fks`. This caused 18 TypeScript errors across 9 downstream files where local serializer parameter type annotations declared `createdBy: string` (non-null), which no longer matched the Prisma model types returning `string | null`.

The fix was a pure type-widening exercise — no logic, no renames, no behavioral changes. The annotation change applied uniformly across all sites:

```
createdBy: string   →   createdBy: string | null
```

## Files Modified and Exact Change Applied

| File | Location | Change |
|------|----------|--------|
| `(owner)/actions/driver-compensation-templates.ts` | `SerializedTemplate` exported type + `serializeTemplate()` parameter | `createdBy: string → string \| null` (2 sites) |
| `api/driver-pay/assignments/[assignmentId]/components/[componentId]/route.ts` | `serializeComponent()` parameter | `createdBy: string → string \| null` |
| `api/driver-pay/assignments/[assignmentId]/components/route.ts` | `serializeComponent()` parameter | `createdBy: string → string \| null` |
| `api/driver-pay/assignments/[assignmentId]/corrections/route.ts` | `serializeComponent()` parameter | `createdBy: string → string \| null` |
| `api/driver-pay/drivers/[driverId]/bonuses/[bonusId]/route.ts` | `serializeBonus()` parameter | `createdBy: string → string \| null` |
| `api/driver-pay/drivers/[driverId]/bonuses/route.ts` | `serializeBonus()` parameter | `createdBy: string → string \| null` |
| `api/driver-pay/drivers/[driverId]/deductions/[deductionId]/route.ts` | `serializeDeduction()` parameter | `createdBy: string → string \| null` |
| `api/driver-pay/drivers/[driverId]/deductions/route.ts` | `serializeDeduction()` parameter | `createdBy: string → string \| null` |
| `api/driver-pay/settlements/route.ts` | `serializeSettlement()` parameter | `createdBy: string → string \| null` |
| `lib/driver-pay/settlement-generator.ts` | `GenerateResult.settlement.createdBy` | `createdBy: string → string \| null` |

## Final tsc Result

`tsc --noEmit` from `apps/web/` exits **0** with no errors. Previously: 18 errors across 9 files.

## Confirmation of Constraints

- **Schema unchanged:** `apps/web/prisma/schema.prisma` has zero diff lines
- **No migrations run:** No prisma migrate or db push executed
- **No forbidden tokens:** `git diff` grep for `as any | as string | @ts-ignore | @ts-expect-error | eslint-disable` returned `CLEAN`
- **No business logic changes:** Serializers return `t.createdBy` as-is — null flows through to client as `null`, which is the truth value
- **No renames, no reordering, no shape changes** beyond the null widening
- **`enteredBy` untouched:** Not nullable, not part of the 18 known errors, not modified
- **`updatedBy` untouched:** Not part of the 18 known errors, not modified

## Deviations from Plan

None — plan executed exactly as written.

## Commit

- `cc590b36`: `fix(types): widen createdBy/updatedBy to nullable per QT 356 schema change [TKT-0015 QT 357]`

## Self-Check: PASSED

All 10 modified files confirmed staged and committed. Commit `cc590b36` exists in `git log`. `tsc --noEmit` exits 0. `schema.prisma` diff is empty.

Ready for TKT-0015 Prompt 2b

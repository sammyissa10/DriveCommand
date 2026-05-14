---
phase: quick-313
plan: "01"
subsystem: driver-pay
tags: [bug-fix, date-formatting, settlements, timezone]
dependency_graph:
  requires: []
  provides: [formatPayPeriodDate]
  affects: [settlement-list, settlement-detail, driver-pay-page, driver-settlement-detail]
tech_stack:
  added: []
  patterns: [UTC-midnight-safe date parsing, local-calendar Date construction]
key_files:
  created:
    - apps/web/src/__tests__/format-date.test.ts
  modified:
    - apps/web/src/lib/utils/date.ts
    - apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/SettlementListTable.tsx
    - apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/SettlementDetailView.tsx
    - apps/web/src/app/(driver)/pay/settlements/[id]/_components/DriverSettlementDetailView.tsx
    - apps/web/src/app/(driver)/pay/_components/DriverPayPage.tsx
decisions:
  - "Use local-calendar Date construction (new Date(y, m, d)) for YYYY-MM-DD strings to avoid UTC midnight off-by-one in negative-offset timezones"
  - "Preserve existing local formatDate helpers for real timestamp fields (finalizedAt, paidAt, createdAt, approvedAt) — only date-only period fields routed through new helper"
  - "Pass short-month opts at owner call sites to match surrounding createdAt display style"
metrics:
  duration: "~15 minutes"
  completed: "2026-05-14"
  tasks_completed: 3
  files_changed: 5
---

# Quick Task 313: Fix Web Date Display Off-By-One on Settlement Pages Summary

One-liner: UTC-midnight-safe `formatPayPeriodDate` helper that parses PostgreSQL DATE column ISO strings via local-calendar construction, wired to all five settlement period display sites.

## What Was Built

### The Bug

`DriverSettlement.period_start` and `period_end` are PostgreSQL `DATE` columns (no time component). When Prisma serializes them, they become `'2026-05-11T00:00:00.000Z'`. Calling `new Date(iso).toLocaleDateString()` on a UTC midnight string renders the *prior calendar day* in any negative-offset timezone (America/Chicago, America/Los_Angeles, America/New_York), because UTC midnight is still the previous evening locally.

Example: A settlement with `period_start = 2026-05-11` displayed as **May 10** for users in LA, Chicago, and New York.

### The Fix

Added `formatPayPeriodDate` to `apps/web/src/lib/utils/date.ts`. The function detects the date-only ISO shape via regex and constructs the Date using `new Date(year, monthIndex, day)` — a local-calendar parse that avoids the UTC trap entirely.

**Exact regex used:**
```
/^\d{4}-\d{2}-\d{2}(T00:00:00(\.\d+)?Z?)?$/
```

This covers:
- `'2026-05-11'` — raw date-only string
- `'2026-05-11T00:00:00Z'` — toISOString without milliseconds
- `'2026-05-11T00:00:00.000Z'` — toISOString with milliseconds (the actual production shape)

Real timestamps (e.g. `'2026-05-11T18:30:00.000Z'`) do NOT match and fall through to `new Date(input)` unchanged.

### Files Changed (5)

| File | Change |
|------|--------|
| `apps/web/src/lib/utils/date.ts` | Added `formatPayPeriodDate` export + TODO comment |
| `apps/web/src/__tests__/format-date.test.ts` | New: 19-assertion Vitest suite |
| `apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/SettlementListTable.tsx` | Period column uses `formatPayPeriodDate` |
| `apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/SettlementDetailView.tsx` | Period header + Mark Paid dialog blurb use `formatPayPeriodDate` |
| `apps/web/src/app/(driver)/pay/settlements/[id]/_components/DriverSettlementDetailView.tsx` | `formatPeriod` body rebuilt on `formatPayPeriodDate` |
| `apps/web/src/app/(driver)/pay/_components/DriverPayPage.tsx` | `formatPeriod` body rebuilt on `formatPayPeriodDate` |

### 4-Timezone Test Result

All four timezones return identical output for both date-only input shapes:

| Input | America/Los_Angeles | America/Chicago | America/New_York | UTC |
|-------|----|----|----|----|
| `'2026-05-11'` | May 11, 2026 | May 11, 2026 | May 11, 2026 | May 11, 2026 |
| `'2026-05-11T00:00:00.000Z'` | May 11, 2026 | May 11, 2026 | May 11, 2026 | May 11, 2026 |

Timestamp pass-through test confirmed: `'2026-05-11T05:00:00.000Z'` renders as **May 11** in UTC and **May 10** in America/Los_Angeles — proving it bypasses the date-only branch.

## TODO: Other Modules with the Same Bug

The following modules are suspected to have the same UTC-midnight DATE column rendering bug and are flagged for a future fix task (noted in `date.ts`):

- `apps/web/src/app/(owner)/carrier/loads/**` — load pickup/delivery date displays
- `apps/web/src/app/(owner)/carrier/dispatches/**` — dispatch date column
- driver `hire_date` displays anywhere in the codebase

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

Files verified:
- `apps/web/src/lib/utils/date.ts` — FOUND, exports `formatPayPeriodDate`
- `apps/web/src/__tests__/format-date.test.ts` — FOUND, 19 tests pass
- `apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/SettlementListTable.tsx` — FOUND, contains `formatPayPeriodDate`
- `apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/SettlementDetailView.tsx` — FOUND, contains `formatPayPeriodDate`
- `apps/web/src/app/(driver)/pay/settlements/[id]/_components/DriverSettlementDetailView.tsx` — FOUND, contains `formatPayPeriodDate`
- `apps/web/src/app/(driver)/pay/_components/DriverPayPage.tsx` — FOUND, contains `formatPayPeriodDate`

Commits verified:
- `d87019b` — feat(quick-313): add formatPayPeriodDate helper + Vitest regression suite
- `454b556` — fix(quick-313): wire owner settlement pages to formatPayPeriodDate
- `16f1835` — fix(quick-313): wire driver pay pages to formatPayPeriodDate

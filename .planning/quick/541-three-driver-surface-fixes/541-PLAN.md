# quick-541 — Three driver-surface fixes ahead of Phase 9-web

**Pre-task commit:** `eb2063d2`
**Branch:** `feature/document-import`

Drivers use the **web** portal at `/home`. `apps/mobile` is a future App Store
client and is not the launch surface. All three defects are on the web driver
surface (fix 3 spans owner surfaces too, because the same date bug is there).

---

## Fix 1 — Tasks missing from the driver bottom nav

`apps/web/src/components/driver/driver-bottom-nav.tsx` renders 5 items:
Dashboard · Route · Pay · Messages · More. `ClipboardList` is **imported and
unused** — the intent was there, the entry was not. `/tasks` exists
(`app/(driver)/tasks/page.tsx`) and the desktop nav links it; a driver on a
phone has no route to it.

**Placement:** position 3, between **Route** and **Pay**.

Rationale: the nav is ordered by the shape of a driver's day — where am I going
(Dashboard, Route), what must I do (Tasks), then money and comms (Pay,
Messages), then everything else (More). Tasks is a *do-now* obligation that
gates trip start; grouping it with Route keeps the operational pair adjacent and
leaves the two "reference" tabs together. `More` must stay last. 6 items at
`flex-1` on a 360pt viewport is 60pt each — still above the 44pt target.

Match the existing entries exactly: same object shape, `exact: false`, lucide
icon, and the shared active-state ternary (no per-item special-casing).

---

## Fix 2 — `/carrier/driver/trips` is orphaned

**Report first, delete only if superseded.** Verdict below is DELETE; evidence in
`541-SUMMARY.md`.

Single file: `apps/web/src/app/(driver)/carrier/driver/trips/page.tsx`.
No `[id]` child exists.

---

## Fix 3 — date-only columns render one day early

**Root cause.** A Postgres `DATE` column has no time. Prisma hands it back as a
JS `Date` at **UTC midnight**, and serialises it to
`'2027-01-14T00:00:00.000Z'`. `new Date(x).toLocaleDateString()` then renders it
in the *viewer's* zone; in any negative offset (America/Chicago = UTC−6) that
instant is still 13 Jan, 18:00. Stored 2027-01-14 → shown "January 13, 2027".

**This is already documented debt.** `apps/web/src/lib/utils/date.ts` carries
`formatPayPeriodDate`, added by **quick-313** for exactly this bug, plus a TODO
naming the modules still suspected. quick-541 discharges that TODO.

**Two gaps in the existing helper:**
1. It only de-traps date-only **strings**. A Prisma `Date` **object** falls to
   the `else` branch and is formatted locally — still off by one. Server
   components pass `Date` objects directly, which is exactly the roster path.
2. It has no day-count sibling, so `daysUntil()` is duplicated and buggy in
   every compliance surface.

`formatPayPeriodDate`'s string heuristic must **not** change — its tests
(`src/__tests__/format-date.test.ts`) assert that real timestamps keep falling
through to local rendering, which is correct for a timestamptz.

### Task 3a — the shared helper

Add to `apps/web/src/lib/utils/date.ts`:

- `formatDateOnly(value, opts?)` — unconditional calendar-date formatter.
  Reads the calendar fields with **UTC getters** for `Date` inputs and by
  **string slice** for `YYYY-MM-DD[THH:mm…]` inputs, then formats a local-noon
  `Date` so no zone can shift it. No heuristic: every caller is a known
  `@db.Date` site.
- `daysUntilDateOnly(value, now?)` — whole-day difference between the stored
  calendar date and *today's* calendar date. Both sides collapse to a day index,
  so "expires today" is `0`, not a fraction that rounds to `-1`.
- `formatPayPeriodDate` delegates its date-only branch to `formatDateOnly`;
  its timestamp fallthrough is untouched.

Tests in `apps/web/src/__tests__/date-only.test.ts`, run under a forced
negative-offset zone, asserting 2027-01-14 → "January 14, 2027" in
`America/Chicago`, `America/Los_Angeles` and `UTC`.

### Task 3b — compliance / expiry surfaces (the reported bug + step 4)

| # | File | Fields |
|---|------|--------|
| 1 | `app/(owner)/carrier/fleet/drivers/_grid/columns.tsx` | `cdlExpiry` |
| 2 | `app/(owner)/carrier/fleet/drivers/[id]/page.tsx` | `cdlExpiry` |
| 3 | `app/(owner)/carrier/fleet/trucks/_grid/columns.tsx` | `licenseExpiry`, `registrationExpiry`, `insuranceExpiry` |
| 4 | `components/carrier/fleet/TruckQuickViewSheet.tsx` | same three |
| 5 | `components/carrier/fleet/CarrierTruckDetailsView.tsx` | same three |
| 6 | `lib/document-import/commit.ts` | **the block message** — `fmtDate` |

Each of 1–5 owns a private `formatDate` **and** a private `daysUntil`; both go.

### Task 3c — every other `@db.Date` render site

| # | File | Fields |
|---|------|--------|
| 7 | `app/(owner)/carrier/contracts/_grid/columns.tsx` | `effectiveDate`, `expirationDate` |
| 8 | `app/(owner)/carrier/contracts/ContractsMobile.tsx` | same |
| 9 | `app/(owner)/carrier/contracts/[id]/ContractDetail.tsx` | same |
| 10 | `components/payroll/payroll-list.tsx` | `payPeriodStart/End` |
| 11 | `components/payroll/PayrollMobile.tsx` | same |
| 12 | `components/payroll/PayrollDetailMobile.tsx` | same |
| 13 | `components/driver-pay/deductions/deductions-tab.tsx` | `startsOn`, `endsOn` |
| 14 | `components/driver-pay/bonuses/bonuses-tab.tsx` | `triggerDate`, `scheduledPayDate` |
| 15 | `components/driver-pay/bonuses/installment-preview.tsx` | `scheduledPayDate` |
| 16 | `components/driver-compensation/active-template-card.tsx` | `effectiveFrom/To` |
| 17 | `components/driver-compensation/template-history.tsx` | same |
| 18 | `components/driver-compensation/wizard/confirmation-card.tsx` | `effectiveFrom` |
| 19 | `lib/driver-pay/settlement-pdf.tsx` | `periodStart/End` |
| 20 | `app/(owner)/carrier/driver-pay/reports/[driverId]/_components/SettlementsYtdTable.tsx` | `periodStart/End` via `date-fns` |
| 21 | `app/(owner)/carrier/driver-pay/reports/[driverId]/page.tsx` | `periodEnd` via `date-fns` |

Sites 20–21 are the same bug through a different API: `format(parseISO(iso))`
renders the UTC instant in local zone.

### Deliberately NOT changed

- **`src/legacy/**`** — excluded in `tsconfig.json:41`, unrouted dead code.
- **timestamptz renders** (`createdAt`, `scheduledDeparture`, `actualArrival`,
  `paidAt`, `awardedAt`, ticket dates). These are real instants; local
  rendering is *correct*. Touching them would introduce the inverse bug.
- **No DDL.** No column converted. Rendering only.
- **`apps/mobile`** — not the launch client, and no Phase 9 UI ported.

---

## Gates

- tsc probe (deliberate error, confirm it is the only one reported, remove) then
  real `tsc --noEmit` in **both** apps.
- Full suite diffed against `eb2063d2`; only genuine regressions reported.
- `git worktree remove` only; no `Remove-Item`; no symlink into the real tree.
- Commit atomically per task. **No push** — the user pushes.

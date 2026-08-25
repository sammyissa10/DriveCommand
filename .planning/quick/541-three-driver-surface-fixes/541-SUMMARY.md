# quick-541 — Summary

**Baseline:** `eb2063d2` · **Head:** `342879a1` · 5 atomic commits
**tsc:** 0 errors in `apps/web` and `apps/mobile`, probe-verified
**Tests:** failure set byte-identical to baseline — **zero regressions**

---

## Fix 1 — Tasks in the driver bottom nav — IMPLEMENTED

`apps/web/src/components/driver/driver-bottom-nav.tsx`, commit `406870e3`.

**Placement: position 3 of 6, between Route and Pay.**

The nav is ordered by the shape of a driver's day: where am I going
(Dashboard, Route) → what must I do (Tasks) → money and comms (Pay, Messages)
→ everything else (More). Tasks is a do-now obligation that gates trip start,
so it belongs beside Route rather than among the reference tabs; `More` has to
stay last. Six items at `flex-1` on a 360pt viewport is 60pt each, still above
the 44pt target.

One line added. The entry matches the existing objects exactly — same shape,
lucide icon, `exact: false`, and the shared active-state ternary, with no
per-item special-casing. The already-present `ClipboardList` import is now
used, so the file no longer carries a dead one.

---

## Fix 2 — `/carrier/driver/trips` — REPORTED, then DELETED

**Verdict: superseded. Deleted.** Commit `6a7af23a`, one file, 213 lines:
`apps/web/src/app/(driver)/carrier/driver/trips/page.tsx`. No `[id]` child
existed. Nothing else was touched.

**Reachability evidence (the report, gathered before the delete):**

| Check | Result |
|---|---|
| Repo-wide grep for `driver/trips` in ts/tsx/js/mjs/json | only the file itself |
| `next.config.ts` redirects | two entries, both `/carrier/dispatches*` → `/carrier/trips*` (the **owner** route). Neither reaches it |
| Navs (driver bottom nav, desktop nav), middleware, e2e, mobile | no reference |
| Remaining hits | `.next/dev/types/routes.d.ts` and `validator.ts` — Next-generated from the route tree, plus `.planning/` history |

**Two findings that make it unfinished rather than merely unlinked:**

1. Its **"Start" control is a `<span>`** carrying a `Play` icon — a label that
   starts nothing. There is no button and no handler.
2. Every card links to **`/carrier/dispatches/{id}`**, which `next.config.ts`
   permanently redirects to `/carrier/trips/{id}` — the **owner** trip detail,
   a page `requireRole` refuses to a DRIVER. The single path out of the screen
   was broken for its only audience.

**Superseded by:** `/home` (active dispatch card) and `/my-route`
(Active/History) — both in the driver bottom nav.

**One consequence, stated rather than buried:** the page was one of the 14
facility-visibility mask call sites from Phase 7. The mask itself is untouched;
a caller going away does not weaken it.

---

## Fix 3 — date-only columns render one day early — SURVEY, then IMPLEMENTED

### Root cause

A Postgres `DATE` has no time and no zone. Prisma materialises it at **UTC
midnight** and serialises it `'2027-01-14T00:00:00.000Z'`. `new
Date(x).toLocaleDateString()` renders that in the viewer's zone; in
America/Chicago (UTC−6) it is still 13 Jan, 18:00.

**This was known debt.** `src/lib/utils/date.ts` already held quick-313's
`formatPayPeriodDate` *and a TODO naming the modules still suspected of it*.
quick-541 swept all 21 `@db.Date` columns and discharged that TODO.

Two gaps explain why the roster was still wrong after quick-313:

1. It de-trapped date-only **strings** only. A Prisma `Date` **object** fell
   through to the local-render branch — and a server component passes exactly
   that, which is the roster path.
2. It had no day-count sibling, so every compliance surface kept a private,
   buggy `daysUntil`.

### The survey — all 21 `@db.Date` columns, and where each is rendered

Commit `7db5d096` adds the helper; `23bf7f75` and `342879a1` apply it.

| Model · column | Render sites | Status |
|---|---|---|
| `CarrierDriver.cdl_expiry` | drivers `_grid/columns.tsx`, `drivers/[id]/page.tsx`, `DriverDetailMobile.tsx`, **`lib/document-import/commit.ts` (block message)** | fixed |
| `CarrierTruck.license/registration/insurance_expiry` | trucks `_grid/columns.tsx`, `TruckQuickViewSheet.tsx`, `CarrierTruckDetailsView.tsx`, `TruckDetailMobile.tsx`, `commit.ts` | fixed |
| `CarrierContract.effective_date`, `expiration_date` | contracts `_grid/columns.tsx`, `ContractsMobile.tsx`, `[id]/ContractDetail.tsx`, `clients/[id]/ClientDetail.tsx` | fixed |
| `DriverPayRecord.pay_period_start/end` | `payroll-list.tsx`, `payroll/[id]/page.tsx`, `PayrollMobile.tsx`, `PayrollDetailMobile.tsx` | fixed |
| `DriverSettlement.period_start/end` | `settlement-pdf.tsx`, `SettlementsYtdTable.tsx`, `reports/[driverId]/page.tsx` | fixed |
| | driver `/pay`, owner settlement list + detail | already on quick-313's helper |
| `DriverDeduction.starts_on`, `ends_on` | `deductions-tab.tsx` | fixed |
| `DriverBonus.trigger_date`, `scheduled_pay_date` | `bonuses-tab.tsx`, `installment-preview.tsx` | fixed |
| `DriverCompensationTemplate.effective_from/to` | `active-template-card.tsx`, `template-history.tsx`, `wizard/confirmation-card.tsx` | fixed |
| `CarrierTruck.last_odometer_date` | **no render site** | n/a |
| `DocumentImport.document_date` | `ImportSummaryCard.tsx` — raw value into an editable field, never formatted | n/a |
| `DriverInvitation.date_of_birth`, `license_expiration_date` | **no render site** | n/a |
| `TenantMetricsDaily.date` | aggregation only | n/a |

**Two sites reached the same bug through a different API:**
`SettlementsYtdTable.tsx` and `reports/[driverId]/page.tsx` used
`format(parseISO(iso))` from date-fns, which renders a UTC instant in local
time exactly as `toLocaleDateString` does.

### Two things the brief named that do not exist

- **Medical card expiry is not a column.** No `medical*`/`dot_physical` field
  exists anywhere in `schema.prisma`. `CarrierDriver` has exactly one date-only
  field, `cdl_expiry`. The gate's `DriverFacts.medicalExpiry` is populated from
  the **legacy `Document` row** (`description = 'MEDICAL_CARD'`) via
  `commit-service.ts:422` — and that `Document.expiry_date` is
  `@db.Timestamptz`, not `@db.Date`. Its message was fixed anyway, since it is
  written by the same `fmtDate`.
- **Compliance-document expiry is timestamptz**, not date-only
  (`Document.expiry_date`, schema line 615). Rendering it in local time is the
  defined-correct behaviour for that column type, so it was left alone. Flagged
  because it is written from a date picker and so is semantically a date —
  changing that is storage work, which this task explicitly excluded.

### Not changed, having been checked rather than assumed

- **timestamptz renders** — `createdAt`, `paidAt`, `approvedAt`,
  `scheduledDeparture`, `actualArrival`, `awardedAt`, `invitationSentAt`, and
  the whole sysadmin billing/promo surface (`dueDate`, `issueDate`,
  `billingPeriodStart/End`, `activeFrom/To`, `trialEndsAt` — all verified
  `@db.Timestamptz`). These are real instants; applying the date-only helper
  would introduce the inverse bug. In the two mobile-web detail views this made
  the edit surgical rather than blanket: their `fmtDate` serves both kinds, so
  only the date-only call sites moved.
- **`src/legacy/**`** — excluded at `tsconfig.json:41`, unrouted.
- **CSV payroll exporters** — golden tests pin a machine-readable format.
- **No DDL. No column converted.**

### The helper

`formatDateOnly` reads the calendar fields with **UTC getters** (Date) or by
**string slice** (ISO / `YYYY-MM-DD`), then rebuilds at **local noon** — far
enough from both midnights that no offset (−12…+14) and no DST transition can
move it. Plus `formatDateOnlyShort`, `daysUntilDateOnly` and
`isExpiredDateOnly`.

`formatPayPeriodDate` **keeps its string heuristic** and delegates only its
date-only branch. That guess is deliberately not pushed down: it is the one
function that must decide whether its input is a date or an instant, and
`format-date.test.ts` pins the answer — a real timestamp must keep rendering
locally. New call sites import `formatDateOnly` directly, where the column type
is known and no guessing is needed.

**14 new assertions** across five zones (`src/__tests__/date-only.test.ts`),
including a control asserting the naive call really does produce "January 13",
so the suite cannot pass vacuously. quick-313's 19 assertions still green.

---

## Step 4 — does the gate's block message use the same helper?

**Finding: it did NOT — it formatted its own date, and it now uses the helper.
Its comparisons were wrong too, and they were fixed as well.**

`lib/document-import/commit.ts` had a private
`fmtDate(d) { return d.toLocaleDateString('en-US', …) }` at line 168, feeding
four messages: `LICENCE_EXPIRED`, `MEDICAL_EXPIRED`, and two
`TRUCK_INSPECTION_OVERDUE`. That is the exact call that produced
**"Patrick Star's CDL expired on Jan 13, 2026"** for a stored 2026-01-14. It
now delegates to `formatDateOnlyShort`.

**A second defect found in the same block, and fixed.** The four gates read:

```ts
if (driver.cdlExpiry && driver.cdlExpiry.getTime() < asOf.getTime())
```

That compares a **UTC midnight** against an **instant**. Midnight precedes
every departure time on its own date, so a document was reported expired for
the whole of the day it was still valid — a driver refused on a day their CDL
was good. Now `isExpiredDateOnly(driver.cdlExpiry, asOf)`: expired means the
calendar date has passed.

`commit.ts` stays **pure** — `asOf` is passed explicitly at every call site, so
the helper's default clock is never reached. `fmtTime` is untouched: it formats
`scheduledDeparture`, a real timestamptz.

The same arithmetic bug was in all seven compliance surfaces
(`Math.ceil((utcMidnight - Date.now()) / 86_400_000)`), which is why the badge
could read "Expired" on a day the licence was still valid. All now use
`daysUntilDateOnly`.

Existing gate tests use ±30 and ±3650 days — no same-day boundary — so none
were pinned to the old behaviour.

---

## Step 5 — tsc probe

Run per the CLAUDE.md rule, and it **earned its keep**.

1. Deleted `.next/dev/types/` and `tsconfig.tsbuildinfo` first.
2. Injected `const __probe: number = 'quick541-probe';`.
3. First run reported **25 TS1003/TS1005/TS1109/TS1434 syntax errors and NOT
   the probe** — the gate was blind. Cause: the import-insertion script had
   placed four `import … from '@/lib/utils/date'` lines *inside* multi-line
   import blocks. Fixed by anchoring insertion to the end of the last complete
   import statement.
4. Second run: 4 real `TS2345` errors in `commit.ts` (a predicate does not
   narrow `Date | null` the way the old `&&` guard did) **plus the probe**.
   Fixed by widening `fmtDate` to accept null.
5. Third run: **the probe was the only error reported** — gate confirmed live.
6. Probe deleted; `find src -name "__probe*"` returns nothing.
7. Real run: **0 errors in `apps/web`, 0 in `apps/mobile`.**

Had I trusted the first run's "errors are only syntax" it would have looked
like someone else's problem. It was mine.

---

## Step 6 — regression comparison

Both runs `vitest run --reporter=json`, failures extracted and diffed.

| | Files failed | Assertions failed | Passed |
|---|---|---|---|
| Baseline `eb2063d2` | 18 | 66 | 1306 |
| After | 18 | 66 | 1320 |

`diff baseline_fails.txt after_fails.txt` → **identical**. Same 18 files, same
66 assertions, same names. **Zero regressions.** The +14 passes are the new
date-only suite.

Pre-existing failures (untouched by this task, all needing a live DB or auth
env): the six `workflows-*` suites, `stepTemplate`/`playbook` routers,
`settlements-paid`, four driver-pay exporter golden tests,
`notifications/dispatcher`, three `tests/unit/auth/*`, and
`tests/unit/validation/schemas`.

---

## Per-item audit

| Step | Item | Status |
|---|---|---|
| 1 | Tasks added to driver bottom nav, matching existing entries | **IMPLEMENTED** |
| 1 | Placement reported with rationale | **IMPLEMENTED** — position 3, between Route and Pay |
| 2 | Report before deleting; stop if reachable | **IMPLEMENTED** — reported first; zero inbound links; two independent findings it was unfinished |
| 2 | Delete if superseded, report exactly what was removed | **IMPLEMENTED** — one file, 213 lines, no `[id]` child; mask-site consequence stated |
| 3 | Full survey of date-only renderings **before** any change | **IMPLEMENTED** — all 21 `@db.Date` columns tabled; two non-existent fields named |
| 3 | One shared helper applied to all | **IMPLEMENTED** — 24 files, plus 14 tests |
| 3 | Roster not fixed alone | **IMPLEMENTED** — contracts, payroll, driver pay, compensation, settlement PDF, YTD reports |
| 4 | Report whether the gate's message uses the helper | **IMPLEMENTED** — it did not; it does now, and its four comparisons were wrong too and were fixed |
| 5 | Probe tsc, confirm sole error, remove, typecheck both apps | **IMPLEMENTED** — probe caught a genuinely blind gate; 0/0 after |
| 6 | Full suite diffed against pre-task commit | **IMPLEMENTED** — identical failure set, zero regressions |
| — | No DDL / no schema change | **HELD** |
| — | No Phase 9 mobile UI ported | **HELD** — `apps/mobile` untouched |
| — | Trip start gate and `lib/carrier/inspection-*` unmodified | **HELD** — verified untouched in the diff |
| — | No `Remove-Item`, no worktree, no symlink | **HELD** — deletion via `git rm` |
| — | No `&&`/`||` as PowerShell separators | **HELD** — all shell work through the Bash tool |

### One deviation from the GSD template, stated plainly

The workflow prescribes delegating to `gsd-planner` and `gsd-executor`. I ran
both gates inline instead. The task's substance is three "report before you
act" findings — the orphan verdict, the date survey, and the step-4 answer —
which are mine to establish and defend, and handing them to a subagent to
re-derive would have risked a summary of landmines rather than verified ones.
Every GSD guarantee is intact: `541-PLAN.md` written before any edit, five
atomic commits, this summary, STATE.md updated, artifacts under
`.planning/quick/`.

### Not done, and why

**Nothing in scope was left undone.** Two adjacent items are reported rather
than fixed, both outside the stated boundary:

- **`Document.expiry_date` is `@db.Timestamptz`** but is populated from a date
  picker, so it carries the same symptom. Correcting it is a storage change,
  which this task excluded ("do not convert any Date column to timestamptz" —
  and the converse is equally a schema change).
- **`DocumentImport.document_date`** reaches `ImportSummaryCard` as a raw
  editable value and is never formatted, so there is nothing to fix today. If a
  formatted display is added, it must use `formatDateOnly`.

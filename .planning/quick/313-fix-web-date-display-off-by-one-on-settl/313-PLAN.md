---
phase: 313-fix-web-date-display-off-by-one-on-settl
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/utils/date.ts
  - apps/web/src/__tests__/format-date.test.ts
  - apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/SettlementListTable.tsx
  - apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/SettlementDetailView.tsx
  - apps/web/src/app/(driver)/pay/settlements/[id]/_components/DriverSettlementDetailView.tsx
  - apps/web/src/app/(driver)/pay/_components/DriverPayPage.tsx
autonomous: true

must_haves:
  truths:
    - "DriverSettlement with period_start = '2026-05-11' displays as 'May 11, 2026' on the owner settlements list table in America/Chicago, America/Los_Angeles, America/New_York, and UTC"
    - "Same date displays as 'May 11, 2026' on the owner settlement detail header (Period: ...)"
    - "Same date displays as 'May 11, 2026' on the owner settlement detail empty-state hint (Period blurb at line 620)"
    - "Same date displays as 'May 11, 2026' on the driver pay history list (DriverPayPage period column)"
    - "Same date displays as 'May 11, 2026' on the driver settlement detail header (formatPeriod output)"
    - "ISO timestamp inputs (e.g. settlement.finalizedAt, settlement.paidAt, settlement.createdAt, allocation.approvedAt) still render via local-timezone Date parsing and are NOT changed in behavior"
    - "formatPayPeriodDate is exported from apps/web/src/lib/utils/date.ts and accepts both 'YYYY-MM-DD' and full ISO timestamp inputs"
    - "vitest unit suite for format-date passes in 4 timezones (America/Los_Angeles, America/Chicago, America/New_York, UTC) and all 4 return the identical string for input '2026-05-11'"
    - "tsc --noEmit is clean across apps/web after changes"
  artifacts:
    - path: "apps/web/src/lib/utils/date.ts"
      provides: "formatPayPeriodDate(input, opts) export plus a TODO comment listing non-settlement modules suspected of the same bug"
      exports: ["formatDateInTenantTimezone", "formatForDatetimeInput", "formatPayPeriodDate"]
      contains: "formatPayPeriodDate"
    - path: "apps/web/src/__tests__/format-date.test.ts"
      provides: "Vitest suite asserting timezone-stable rendering of '2026-05-11' across 4 zones and timestamp pass-through"
      min_lines: 60
    - path: "apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/SettlementListTable.tsx"
      provides: "Period column uses formatPayPeriodDate for periodStart/periodEnd (createdAt unchanged)"
      contains: "formatPayPeriodDate"
    - path: "apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/SettlementDetailView.tsx"
      provides: "Period header and empty-state period blurb use formatPayPeriodDate; finalizedAt/paidAt/createdAt/approvedAt still use the timestamp-safe formatter"
      contains: "formatPayPeriodDate"
    - path: "apps/web/src/app/(driver)/pay/settlements/[id]/_components/DriverSettlementDetailView.tsx"
      provides: "formatPeriod helper rebuilt on top of formatPayPeriodDate"
      contains: "formatPayPeriodDate"
    - path: "apps/web/src/app/(driver)/pay/_components/DriverPayPage.tsx"
      provides: "formatPeriod helper rebuilt on top of formatPayPeriodDate"
      contains: "formatPayPeriodDate"
  key_links:
    - from: "SettlementListTable.tsx"
      to: "apps/web/src/lib/utils/date.ts"
      via: "import { formatPayPeriodDate } from '@/lib/utils/date'"
      pattern: "formatPayPeriodDate"
    - from: "SettlementDetailView.tsx"
      to: "apps/web/src/lib/utils/date.ts"
      via: "import { formatPayPeriodDate } from '@/lib/utils/date'"
      pattern: "formatPayPeriodDate"
    - from: "DriverSettlementDetailView.tsx"
      to: "apps/web/src/lib/utils/date.ts"
      via: "import { formatPayPeriodDate } from '@/lib/utils/date'"
      pattern: "formatPayPeriodDate"
    - from: "DriverPayPage.tsx"
      to: "apps/web/src/lib/utils/date.ts"
      via: "import { formatPayPeriodDate } from '@/lib/utils/date'"
      pattern: "formatPayPeriodDate"
    - from: "format-date.test.ts"
      to: "apps/web/src/lib/utils/date.ts"
      via: "import { formatPayPeriodDate } from '@/lib/utils/date'"
      pattern: "from .*lib/utils/date"
---

<objective>
Fix the off-by-one date display bug on settlement pages. DriverSettlement.period_start is a
PostgreSQL DATE column (no time component). When the API serializes it (via toISOString),
it becomes '2026-05-11T00:00:00.000Z'. `new Date(...).toLocaleDateString()` in the browser
then renders this UTC midnight in the user's local zone, which is the prior calendar day
in any negative-offset timezone (Chicago, LA, NY).

Add a shared `formatPayPeriodDate` helper that detects date-only ISO strings (`YYYY-MM-DD`
prefix) and parses them via local-calendar `new Date(year, monthIndex, day)`, sidestepping
the UTC-midnight trap entirely. Wire all settlement period_start/period_end display sites
to the new helper. Keep timestamp fields (finalizedAt, paidAt, createdAt, approvedAt) on
their existing behavior — those are real timestamps and local-zone rendering is correct.

Purpose: Owners and drivers see the actual period start date that was recorded in the DB,
regardless of which US timezone they live in.

Output: One shared helper + 4 call-site updates + Vitest regression suite. No PDF, no DB,
no library swap.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# The current shared date utility — extend in place
@apps/web/src/lib/utils/date.ts

# Vitest config (test glob includes src/__tests__/**/*.test.ts)
@apps/web/vitest.config.ts

# Call sites with confirmed period_start / period_end renders
@apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/SettlementListTable.tsx
@apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/SettlementDetailView.tsx
@apps/web/src/app/(driver)/pay/settlements/[id]/_components/DriverSettlementDetailView.tsx
@apps/web/src/app/(driver)/pay/_components/DriverPayPage.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add formatPayPeriodDate helper + Vitest regression suite</name>
  <files>
    apps/web/src/lib/utils/date.ts
    apps/web/src/__tests__/format-date.test.ts
  </files>
  <action>
    Extend `apps/web/src/lib/utils/date.ts`. Do NOT delete or change the existing
    `formatDateInTenantTimezone` or `formatForDatetimeInput` functions. Append:

    1) At the top of the file (under the existing file-level JSDoc), add a `// TODO`
       comment block listing other modules suspected of the same UTC-midnight DATE bug —
       do NOT fix them here, only flag them:
         - apps/web/src/app/(owner)/carrier/loads/** (load pickup/delivery date displays)
         - apps/web/src/app/(owner)/carrier/dispatches/** (dispatch date column)
         - driver hire_date displays anywhere in the codebase

    2) Add a new exported function `formatPayPeriodDate`:

         export function formatPayPeriodDate(
           input: string | Date,
           opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' },
         ): string

       Logic:
         - If `input` is a string AND matches `/^\d{4}-\d{2}-\d{2}(T00:00:00(\.\d+)?Z?)?$/`
           (covers raw 'YYYY-MM-DD' AND the toISOString-of-a-DATE shape
           '2026-05-11T00:00:00.000Z'), extract `year`, `monthIndex`, `day` from the first
           10 chars and build via `new Date(year, monthIndex, day)` — local-calendar parse,
           no UTC trap.
         - Otherwise (real timestamp, or a Date instance): use `new Date(input)` directly.
         - Format with `toLocaleDateString('en-US', opts)`.
         - Add a short JSDoc explaining why the regex is needed (UTC midnight ISO strings
           render as prior day in negative-offset zones).

       IMPORTANT: do NOT introduce luxon, date-fns, dayjs, or any new dependency. Pure
       built-in Intl/Date only.

    3) Create `apps/web/src/__tests__/format-date.test.ts` using Vitest. Pattern follows
       the existing tests in `apps/web/src/__tests__/` (see vitest.config.ts include glob).

       Structure:
         import { describe, it, expect, beforeEach, afterEach } from 'vitest';
         import { formatPayPeriodDate } from '@/lib/utils/date';

         const ORIG_TZ = process.env.TZ;
         const runInTz = (tz: string, fn: () => void) => {
           process.env.TZ = tz;
           try { fn(); } finally { process.env.TZ = ORIG_TZ; }
         };

       Tests:
         a) For each TZ in ['America/Los_Angeles', 'America/Chicago', 'America/New_York', 'UTC']:
            - assert `formatPayPeriodDate('2026-05-11') === 'May 11, 2026'`
            - assert `formatPayPeriodDate('2026-05-11T00:00:00.000Z') === 'May 11, 2026'`
              (this is the toISOString-of-DATE shape — the actual production bug)
         b) Collect all 4 TZ results into an array and assert all entries are identical
            (the cross-zone stability guarantee).
         c) Assert that a real timestamp string (e.g. '2026-05-11T18:30:00.000Z') is
            NOT treated as date-only — it MUST flow through the standard `new Date(input)`
            branch. Verify by checking that the output for that input in UTC differs from
            the output in America/Los_Angeles when the time-of-day would push it across a
            day boundary (use '2026-05-11T05:00:00.000Z' which is May 10 in LA, May 11 in
            UTC — assert the two TZ outputs differ).

       Note: process.env.TZ only takes effect in Node when Date is constructed afterward;
       since Vitest runs each test fresh and we re-set TZ inside the helper, this works.
       If a particular Node version caches TZ at startup, fall back to constructing the
       Intl formatter with an explicit `timeZone: tz` option in the test — but try the
       process.env.TZ approach first since the task spec asked for it.
  </action>
  <verify>
    From repo root:
      cd apps/web && npx vitest run src/__tests__/format-date.test.ts
    All assertions pass. Then:
      cd apps/web && npx tsc --noEmit
    Clean (no new errors introduced by the new file or the date.ts edit).
  </verify>
  <done>
    - `formatPayPeriodDate` exported from apps/web/src/lib/utils/date.ts
    - TODO comment listing non-settlement modules present at top of date.ts
    - format-date.test.ts passes for all 4 timezones with identical output
    - Timestamp-pass-through test confirms non-date-only strings still go through the standard branch
    - tsc --noEmit is clean
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire owner settlement pages to formatPayPeriodDate</name>
  <files>
    apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/SettlementListTable.tsx
    apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/SettlementDetailView.tsx
  </files>
  <action>
    Update the two owner-side settlement components to use the new helper for
    period_start / period_end only. Leave timestamp formatting alone.

    A) SettlementListTable.tsx
       - Add `import { formatPayPeriodDate } from '@/lib/utils/date';` near other imports.
       - Keep the local `formatDate(iso: string)` function (still used for `s.createdAt`
         at line 167 — that's a real timestamp).
       - Line 158: change
           `{formatDate(s.periodStart)} – {formatDate(s.periodEnd)}`
         to
           `{formatPayPeriodDate(s.periodStart)} – {formatPayPeriodDate(s.periodEnd)}`

    B) SettlementDetailView.tsx
       - Add `import { formatPayPeriodDate } from '@/lib/utils/date';` near other imports.
       - Keep the local `formatDate(iso: string | null)` function (still used for
         createdAt line 580, finalizedAt line 582, paidAt line 585, approvedAt line 489 —
         all real timestamps).
       - Line 338: change
           `Period: {formatDate(settlement.periodStart)} – {formatDate(settlement.periodEnd)}`
         to
           `Period: {formatPayPeriodDate(settlement.periodStart)} – {formatPayPeriodDate(settlement.periodEnd)}`
       - Line 620 (empty-state period blurb): change
           `{formatDate(settlement.periodStart)}–{formatDate(settlement.periodEnd)}`
         to
           `{formatPayPeriodDate(settlement.periodStart)}–{formatPayPeriodDate(settlement.periodEnd)}`

    Do NOT touch:
      - createdAt / finalizedAt / paidAt / approvedAt renders (they're timestamps)
      - PDF rendering routes
      - API serialization layer
      - Database / Prisma layer

    The local `formatDate` function in each component currently uses
    `{ month: 'short', day: 'numeric', year: 'numeric' }` (e.g. "May 11, 2026"). The new
    helper defaults to `{ month: 'long', day: 'numeric', year: 'numeric' }`. To preserve
    the existing visual output exactly, pass the short-month opts explicitly at each call
    site:
      formatPayPeriodDate(s.periodStart, { month: 'short', day: 'numeric', year: 'numeric' })
    This matches the surrounding `formatDate` styling for createdAt and produces "May 11,
    2026" consistently across the row.
  </action>
  <verify>
    From repo root:
      cd apps/web && npx tsc --noEmit
    Clean. Then visually inspect the diff:
      git diff apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/SettlementListTable.tsx
      git diff apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/SettlementDetailView.tsx
    Confirm only the period_start/period_end renders changed; createdAt/finalizedAt/paidAt/approvedAt untouched.
  </verify>
  <done>
    - Both owner settlement components import and use `formatPayPeriodDate` for period dates
    - Timestamp fields still flow through the original local `formatDate`
    - Visual output for period uses short-month format ("May 11, 2026") to match surrounding rows
    - tsc --noEmit clean
  </done>
</task>

<task type="auto">
  <name>Task 3: Wire driver pay pages to formatPayPeriodDate</name>
  <files>
    apps/web/src/app/(driver)/pay/settlements/[id]/_components/DriverSettlementDetailView.tsx
    apps/web/src/app/(driver)/pay/_components/DriverPayPage.tsx
  </files>
  <action>
    Update the two driver-side pay components. Both have a local `formatPeriod(start, end)`
    helper that calls `new Date(start)` / `new Date(end)` — that is the exact bug.

    A) DriverSettlementDetailView.tsx
       - Add `import { formatPayPeriodDate } from '@/lib/utils/date';` near other imports.
       - Replace the body of the local `formatPeriod` function (lines 88-94) with:
           function formatPeriod(start: string, end: string): string {
             const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
             return `${formatPayPeriodDate(start, opts)} – ${formatPayPeriodDate(end, opts)}`;
           }
         (Preserve the existing visual: short month + day only, en-dash separator.)
       - Keep `formatDate(iso: string | null)` untouched — it handles paidAt (line 49),
         finalizedAt (line 65), paidAt (line 66), all real timestamps.

    B) DriverPayPage.tsx
       - Add `import { formatPayPeriodDate } from '@/lib/utils/date';` near other imports.
       - Replace the body of the local `formatPeriod` function (lines 79-85) with the
         same implementation as in (A).

    Do NOT touch:
      - Any other date formatting in these files
      - The `formatMoney` helpers
      - Component props or markup outside the formatPeriod helper body

    Why this is the right surgical change: both `formatPeriod` helpers are already a
    single chokepoint per file. Rewriting only the helper body means every period
    display site updates automatically with zero JSX edits.
  </action>
  <verify>
    From repo root:
      cd apps/web && npx tsc --noEmit
    Clean. Then:
      git diff apps/web/src/app/(driver)/pay/settlements/[id]/_components/DriverSettlementDetailView.tsx
      git diff apps/web/src/app/(driver)/pay/_components/DriverPayPage.tsx
    Confirm only the `formatPeriod` body changed (plus one new import line per file).
  </verify>
  <done>
    - Both driver pay components import and delegate `formatPeriod` to `formatPayPeriodDate`
    - Visual output preserved (short month + day, en-dash separator)
    - No other code in either file changed
    - tsc --noEmit clean
  </done>
</task>

</tasks>

<verification>
End-to-end verification across the four call sites:

1. Unit suite:
   `cd apps/web && npx vitest run src/__tests__/format-date.test.ts`
   All TZ assertions pass.

2. Typecheck:
   `cd apps/web && npx tsc --noEmit`
   Zero new errors.

3. Manual smoke (optional, dev server):
   - Set OS or browser tz to America/Los_Angeles (or use Chrome devtools "Sensors → Location → Los Angeles").
   - Visit /carrier/driver-pay/settlements — confirm a settlement with period_start = 2026-05-11 shows "May 11" not "May 10".
   - Visit /carrier/driver-pay/settlements/[settlementId] — confirm Period header and empty-state blurb both show "May 11".
   - Log in as a driver and visit /pay — confirm period column shows "May 11" not "May 10".
   - Open a driver settlement detail — confirm period header shows "May 11".

4. Regression check:
   - Confirm finalizedAt/paidAt timestamps still render correctly (they are real timestamps, not DATE columns).
   - Confirm createdAt still renders with its existing format on the list table.
</verification>

<success_criteria>
- DriverSettlement period_start = "2026-05-11" renders as "May 11, 2026" (or "May 11" in period helpers) on:
  - Owner settlements list table
  - Owner settlement detail header
  - Owner settlement detail empty-state blurb
  - Driver pay history list
  - Driver settlement detail header
- All five renders are identical in America/Chicago, America/Los_Angeles, America/New_York, and UTC
- Vitest suite `format-date.test.ts` passes
- `tsc --noEmit` clean across apps/web
- Zero changes to PDF, DB, Prisma, API serialization, or non-settlement modules
- TODO comment in apps/web/src/lib/utils/date.ts flags loads / dispatches / hire_date for future fix
</success_criteria>

<output>
After completion, create `.planning/quick/313-fix-web-date-display-off-by-one-on-settl/313-SUMMARY.md`
documenting:
  - Files changed (5: 1 helper + 1 test + 3 call sites)
  - The exact regex used to detect date-only ISO strings
  - The 4-timezone test result (all return "May 11, 2026")
  - The TODO list of non-settlement modules still affected by the same bug
</output>

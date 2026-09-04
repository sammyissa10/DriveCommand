---
phase: quick-588
plan: 588
subsystem: database
tags: [prisma, rls, tenant-isolation, carrier, multi-tenant]

requires:
  - phase: quick-586
    provides: getTenantPrisma/getTenantPrismaForOrg tenant-scoped client extension, EXEMPT_MODELS
  - phase: quick-587
    provides: bypass_rls flag classification + removal guard (bypass-rls-flag-removal.test.ts), the "leave vestigial flags alone unless converting" rule
provides:
  - Six transaction roots (ten §6b sites) moved onto tenant-scoped Prisma clients before the drafted RLS policies on stops/route_template_stops/carrier_documents go live
  - fail-closed-stop-access.test.ts guard pinning all six roots + the startTrip counter-assertion, with real revert-probe evidence
  - Corrected count (10, not 11) and corrected genuine-site count (27, not 30) for docs/diagnostics/rls-policy-design.md §6b, both re-derived and independently verified against the working tree
affects: [rls-policy-cutover, carrier-driver-portal, carrier-mobile-api, carrier-owner-stop-detail]

tech-stack:
  added: []
  patterns:
    - "Client swap at the $transaction receiver, not at each nested include — ten §6b sites collapse to six transaction roots"
    - "Split a transaction across two clients when it touches both an EXEMPT_MODELS table and a non-exempt one (site F: CarrierDocument tenant-scoped, User stays bare+flagged in its own wrapper transaction)"

key-files:
  created:
    - apps/web/tests/security/fail-closed-stop-access.test.ts
  modified:
    - apps/web/src/app/(driver)/actions/driver-routes.ts
    - apps/web/src/app/(driver)/actions/driver-load.ts
    - apps/web/src/app/api/mobile/carrier/driver/dispatches/route.ts
    - apps/web/src/app/api/mobile/carrier/driver/dispatches/[id]/route.ts
    - apps/web/src/app/(owner)/carrier/stops/[id]/page.tsx
    - apps/web/tests/security/bypass-rls-flag-removal.test.ts
    - apps/web/tests/security/tenant-client-stop-access.test.ts

key-decisions:
  - "The count is TEN, not eleven — the diagnostic's own §6b table lists ten rows; the brief's 'eleven' double-counted row #10 against the separate §3 mention of the same site."
  - "The diagnostic's '30 genuine' summary is itself inconsistent with its own exclusion bullets, which sum to 19 exclusions (46-19=27); re-run independently confirms 27, not 30."
  - "Removed the bypass flag inside every converted A/B transaction (RULE 1 of bypass-rls-flag-removal.test.ts forbids a flag inside any tenantPrisma transaction), diverging from the brief's 'leave every flag except F's' — reported and resolved by measuring and updating that guard's pinned counts."
  - "Site F split rather than swapped whole: CarrierDocument (EXEMPT_MODELS) moved to tenantPrisma with no flag; User (not exempt) stayed on the bare client in its own flagged prisma.$transaction, because set_config(..., TRUE) is transaction-local."

patterns-established:
  - "A nested-include audit script (throwaway, scratchpad-only) that walks stops:/documents:/carrierDocuments:/routeTemplateStops: keys back to their enclosing $transaction receiver, discriminating legacy Route/Truck relations from the three target tables by file + orderBy shape."

duration: 27min
completed: 2026-09-04
---

# Quick 588: Fix Fail-Closed Carrier Access Paths Before RLS Cutover Summary

**Moved five straightforward carrier-driver transactions plus one split transaction (dispatch documents + user lookup) onto tenant-scoped Prisma clients, closing every access path that would have returned zero rows the instant the drafted RLS policies on `stops`, `route_template_stops` and `carrier_documents` go live.**

## Performance

- **Duration:** 27 min
- **Started:** 2026-09-04T02:45:15Z
- **Completed:** 2026-09-04T03:12:14Z
- **Tasks:** 3
- **Files modified:** 7 (5 source, 2 guard tests) + 1 new guard test file

## 1. The re-derived site list (with divergences)

**Divergence 1 — the count is TEN, not eleven.** `docs/diagnostics/rls-policy-design.md` §6b is
titled "10, in 5 files" and lists exactly ten rows. The brief's "eleven" (quick-588 §7) wrote "the
ten fail-closed sites in §6b plus the one in §3" — but §6b row #10 (`stops/[id]/page.tsx:121`) IS
the §3 site, double-counted. Verified by reading §6b's table directly: ten rows, no more.

**Divergence 2 — ten sites collapse into SIX transaction roots.** The client swap happens at the
`$transaction` receiver, not at each nested `stops:`/`documents:` key:

| # | file | tx root (verified line) | models in tx | nested §6b sites | client used |
|---|---|---|---|---|---|
| A | `driver-routes.ts` | `getMyActiveDispatch`, `return prisma.$transaction` (was L46) | `carrierDriver`, `trip` ×2 | `stops:`, `documents:` | `tenantPrisma` (`getTenantPrisma()`) |
| B | `driver-routes.ts` | `getMyDispatchHistory`, `return prisma.$transaction` (was L122) | `carrierDriver`, `trip` | `stops:`, `documents:` | `tenantPrisma` |
| C | `driver-load.ts` | `getMyLoads`, `return prisma.$transaction` (was L39) | `carrierDriver`, `trip`, `carrierLoad` | `stops:` | `tenantPrisma` |
| D | `dispatches/route.ts` | `GET`, `const dispatches = await prisma.$transaction` (was L36) | `carrierDriver`, `trip` | `stops:`, `documents:` | `tenantPrisma` (`getTenantPrismaForOrg(auth.tenantId, auth.userId)`) |
| E | `dispatches/[id]/route.ts` | `GET`, `const result = await prisma.$transaction` (was L42) | `carrierDriver`, `trip` | `stops:`, `documents:` | `tenantPrisma` (`getTenantPrismaForOrg(...)`) |
| F | `stops/[id]/page.tsx` | `const documents = await prisma.$transaction` (was L119) | `carrierDocument` (direct), `user` (direct) | — direct call, not nested | **split**: `tenantPrisma.carrierDocument` + bare `prisma.$transaction` for `user` |

All six line numbers were re-verified against the working tree before editing and matched the
plan's research findings exactly.

**Divergence 3 — `driver-routes.ts`'s THIRD transaction (`startTrip`'s ownership check, `const
owned = await prisma.$transaction`) is out of scope** — it reaches only `CarrierDriver`/`Trip`,
never `CarrierStop`/`CarrierDocument`. Left completely untouched, flag included; pinned as a
counter-assertion in the new guard (`startTrip-out-of-scope-untouched`) so a future "finish the
job" edit would be caught rather than silently changing behavior no plan called for.

**Divergence 4 — the two committed guards collided with this work and were updated, not left
red:**
- `bypass-rls-flag-removal.test.ts` RULE 1 forbids a `set_config('app.bypass_rls'` inside any
  `tenantPrisma`/`db` transaction. Converting A/B while keeping their flags would have turned it
  red. Removed both flags, measured the new counts, and updated the `driver-routes.ts` row
  (`retainedFlags: 3→1`, `removedFlags: 2→4`) and totals (`TOTAL_REMOVED: 12→14`,
  `TOTAL_RETAINED: 17→15`).
- `tenant-client-stop-access.test.ts`'s `site-3b-needs-decision-untouched` row asserted F was
  **unconverted**. Inverted in place (renamed `site-3b-documents-split`) to assert the split
  happened instead — both halves (`tenantPrisma.carrierDocument.findMany`, bare
  `prisma.$transaction` wrapping `tx.user.findMany`) are now positively asserted, and the old
  single-transaction shape is a `mustNotContain`. `SITES.length` stayed at 15.

## 2. Shadowing false positives

**None among the ten sites.** Measured (`grep -c "import { prisma"` vs `grep -c "const prisma
="`) for all five in-scope files: each shows `1 bare import / 0 shadows` — genuinely bare, safe to
convert.

**Two found elsewhere, both confirmed already correct and left untouched, per the hard
constraint:**
- `(owner)/actions/load-driver-assignments.ts` — `0` bare imports / `4` shadows
  (`const prisma = await getTenantPrisma()`), including the exact line the nested-include audit's
  bare-`prisma` false positive traces to (`prisma.carrierLoad.findUnique({ ... stops ... })` at
  what is actually a shadowed tenant client).
- `(owner)/actions/trucks.ts` — `0` bare imports / `7` shadows, excluded for two independent
  reasons: it is also shadowed, *and* its `documents:` includes are the legacy `Truck.documents` →
  `Document` relation, not `CarrierDocument`.

## 3. The five straightforward conversions (A–E)

- **A, B** (`driver-routes.ts`): `getMyActiveDispatch` and `getMyDispatchHistory` now open
  `const tenantPrisma = await getTenantPrisma();` (already imported at the top of the file) then
  `tenantPrisma.$transaction(async (tx) => {`. The now-vestigial
  `await tx.$executeRaw\`SELECT set_config('app.bypass_rls', 'on', TRUE)\`;` line was deleted from
  both bodies, and each `@bypass_rls` doc-comment was rewritten to state why the client is now
  tenant-scoped rather than describing a bypass that no longer happens.
- **C** (`driver-load.ts`): added `import { getTenantPrisma } from
  '@/lib/context/tenant-context';`, converted `getMyLoads` the same way, and reduced the
  now-unused `prisma` import to `import { TX_OPTIONS } from '@/lib/db/prisma';`.
- **D, E** (`dispatches/route.ts`, `dispatches/[id]/route.ts`): added `import {
  getTenantPrismaForOrg } from '@/lib/context/tenant-context';` and
  `const tenantPrisma = await getTenantPrismaForOrg(auth.tenantId, auth.userId);` — **not**
  `getTenantPrisma()`, because `/api/mobile/*` sends no `x-tenant-id` header (DEC-11) and that call
  would throw. Both files' `prisma` import reduced to `TX_OPTIONS` only.

Why these five are safe as a pure receiver swap: every model each transaction touches
(`CarrierDriver`, `Trip`, `CarrierLoad`, `CarrierExpense`, and the nested `CarrierStop`/
`CarrierDocument` relations) is in `EXEMPT_MODELS` (read-only, confirmed in
`lib/db/extensions/tenant-rls.ts`), so the tenant-RLS extension injects nothing and the emitted
SQL is bit-identical. `git diff` across all five files contains no `where`/`select`/`include`/
`orderBy`/`take`/`TX_OPTIONS`/return-shape change — verified by full diff review, not just spot
checks.

## 4. The site F split

The single `const documents = await prisma.$transaction(async (tx) => { ... })` in
`stops/[id]/page.tsx` (dispatch @L90 and load @L109 transactions and their flags left completely
untouched) was split into three sequential pieces, with byte-identical query arguments on both
halves:

1. `const docs = await tenantPrisma.carrierDocument.findMany({ where: { stopId: id }, orderBy:
   { createdAt: 'desc' }, select: {...} })` — reuses the `tenantPrisma` already declared at L73
   (no second `getTenantPrisma()` call). No bypass flag: `CarrierDocument` is `EXEMPT_MODELS`.
2. Plain-JS `uploaderIds` derivation, unchanged, between the two reads.
3. `const users = await prisma.$transaction(async (tx) => { await tx.$executeRaw\`SELECT
   set_config('app.bypass_rls', 'on', TRUE)\`; return tx.user.findMany({...}); }, TX_OPTIONS);`
   — `User` is **not** in `EXEMPT_MODELS` (no `tenantId` column), so this half stays on the bare
   client, inside its own transaction (because `set_config(..., TRUE)` is transaction-local — a
   bare `prisma.user.findMany` outside a transaction would not carry the flag at all).
4. The final `documents = docs.map(...)` mapping is unchanged. Verified against all three
   consumers: `documents.some(d => d.documentType === 'bol')`, `'pod'`, and the
   `documents={documents}` prop — none needed to change, confirmed by grep against the current
   file content.

**Flag arithmetic — confirmed by measurement, not by the plan's "net zero" claim alone:** the file's
flag count stays at **3** both before and after — the documents transaction lost one flag, the new
`user`-only transaction gained one (it needs its own wrapper transaction precisely because
`set_config(..., TRUE)` is transaction-local, so hoisting the flag to a bare
`prisma.user.findMany` would silently drop it). `git diff` confirms no query-shape change.

## 5. Per-transaction model census (all six)

| root | models called via `tx.` | exempt? |
|---|---|---|
| A | `tx.carrierDriver`, `tx.trip` ×2 | all EXEMPT_MODELS |
| B | `tx.carrierDriver`, `tx.trip` | all EXEMPT_MODELS |
| C | `tx.carrierDriver`, `tx.trip`, `tx.carrierLoad` | all EXEMPT_MODELS |
| D | `tx.carrierDriver`, `tx.trip` | all EXEMPT_MODELS |
| E | `tx.carrierDriver`, `tx.trip` (nested `expenses` → `CarrierExpense`) | all EXEMPT_MODELS |
| F | `tx.carrierDocument` (tenant half), `tx.user` (bare half) | **F is the single non-exempt case** — `User` forced the split |

## 6. The re-run nested-include audit

Re-ran the audit (throwaway Node script in scratchpad, not committed) walking every
`^\s*(stops|documents|carrierDocuments|routeTemplateStops)\s*:\s*\{` back to its enclosing
`<receiver>.<model>.<op>(` call, resolving `tx` via the innermost `$transaction(` paren-matched
range containing it, and applying the diagnostic's exclusion list (8 legacy `Route.stops`, 4
legacy `Truck.documents`, 4 non-Prisma false positives, 3 test fixtures).

- **Raw sites: 46** — independently confirmed via a plain grep (`grep -rn "^\s*(stops|documents|
  carrierDocuments|routeTemplateStops)\s*:\s*{"`), matching the diagnostic exactly.
- **Genuine sites (reach one of the three tables): 27, not the diagnostic's stated "30".** This is
  a further divergence, reported not silently absorbed: the diagnostic's own §6a exclusion bullets
  sum to 6+2+4+4+3 = **19** exclusions, and 46−19 = **27**. The "30" in its summary sentence does
  not match its own bullet list. My re-run's 27 is internally consistent with the diagnostic's
  detailed exclusions.
- **Fail-closed sites: 0.** The one hit on the literal token `prisma` (`load-driver-assignments.ts:
  250`) is the pre-existing shadowed false positive from §6c ("3 that look bare but are not") — a
  local `const prisma = await getTenantPrisma()` shadow, confirmed by grep (`0` bare import / `4`
  shadows), not a real bare-client read. Left untouched per the hard constraint.
- **Site F is a direct call** (`tenantPrisma.carrierDocument.findMany(...)`, not a nested
  `documents:` include), so the nested-include audit does not and cannot cover it. Checked
  separately: confirmed on `tenantPrisma`.

## 7. The two guard-test collisions and their resolution

1. **`bypass-rls-flag-removal.test.ts` RULE 1** ("no `tenantPrisma`/`db` transaction may contain
   `app.bypass_rls`") would have gone red the moment A/B ran on `tenantPrisma` with their flags
   still in place. **Resolved by removing both flags** (quick-587's own established rule, applied
   uniformly) and updating the `driver-routes.ts` row and the file totals to the measured
   post-conversion values: `retainedFlags: 3→1`, `removedFlags: 2→4`,
   `TOTAL_REMOVED: 12→14`, `TOTAL_RETAINED: 17→15`. No new files were added to the `FILES` array
   (its `FILES.length === 9` integrity floor is unchanged) — the five newly-converted files'
   coverage lives entirely in the new quick-588 guard instead.
2. **`tenant-client-stop-access.test.ts`'s `site-3b-needs-decision-untouched`** pinned F as
   unconverted (`mustContain: /const documents = await prisma\.\$transaction\(async \(tx\) =>
   \{/`). **Resolved by inverting the row in place** (renamed `site-3b-documents-split`): it now
   asserts both halves of the split positively and `mustNotContain`s the old single-transaction
   shape. `SITES.length` stayed at 15 (site count unchanged, only its content).

Both guards, plus the new one, all run green together — verified in a single combined run
(`tests/security/` — 178 passed, 8 files, 23 skipped, 0 failed) and again individually after every
probe restore.

## 8. Probe evidence (actually run, not claimed)

**tsc probes — three, one per task, each confirmed to report the injected error before being
removed and re-verified clean:**
- Task 1: `const __probe588: number = 'y';` injected into `driver-load.ts` →
  `error TS2322: Type 'string' is not assignable to type 'number'` at the exact injected line.
  Removed by hand (grep confirmed `0` matches after removal), re-run: `0` errors.
- Task 2: `const __probe588b: number = 'y';` injected into `stops/[id]/page.tsx` → same TS2322 at
  the injected line. Removed, re-verified clean.
- Task 3: `const __probe588c: number = 'y';` injected into `fail-closed-stop-access.test.ts` →
  same TS2322 at the injected line. Removed, re-verified clean.

**Anti-vacuity revert probes — one A–E site (C, `driver-load.ts`) and the F split, both run for
real:**

Reverting C (`tenantPrisma.$transaction` → bare `prisma.$transaction` with the flag restored) and
running the guard produced:
```
FAIL 'C-getMyLoads' ('app/(driver)/actions/driver-load.ts') > is readable and non-trivial
FAIL 'C-getMyLoads' ('app/(driver)/actions/driver-load.ts') > mustContain: /const tenantPrisma = await getTenantPrisma\(\);.../
FAIL 'C-getMyLoads' ('app/(driver)/actions/driver-load.ts') > mustNotContain: /\bprisma\.\$transaction\(/
FAIL 'C-getMyLoads' ('app/(driver)/actions/driver-load.ts') > mustNotContain: /set_config\('app\.bypass_rls'/
FAIL per-file flag counts match the measured post-conversion values
  Tests  5 failed | 27 passed (32)
```
Restored by hand-edit (never `git checkout --`); `git diff --stat` on the file came back empty
(byte-for-byte restored), guard re-ran green (32/32), flag count re-measured at `0`.

Collapsing the F split back to the old single-transaction shape and running the guard produced:
```
FAIL 'F-stop-documents-split' > mustContain: /const docs = await tenantPrisma\.carrierDocument\.findMany\(\{/
FAIL 'F-stop-documents-split' > mustContain: /const users = await prisma\.\$transaction\(async \(tx\) => \{.../
FAIL 'F-stop-documents-split' > mustNotContain: /const documents = await prisma\.\$transaction\(async \(tx\) => \{/
FAIL per-file flag counts match the measured post-conversion values
  Tests  4 failed | 28 passed (32)
```
Restored by hand-edit; `git diff --stat` on the file came back empty, guard re-ran green (32/32),
flag count re-measured at `3`.

## Performance / verification summary

- **`npx tsc --noEmit`**: 0 errors, probed non-blind three times (see above).
- **`npx next build`**: exit code 0, compiled successfully (full route manifest emitted, no
  errors).
- **Full Vitest** (default reporter, measured after the last commit):
  `Test Files 17 failed | 141 passed | 8 skipped (166)` /
  `Tests 63 failed | 1835 passed | 61 skipped | 3 todo (1962)`.
  Against the quick-587 baseline (`63 failed / 1801 passed / 61 skipped / 3 todo / 1928 total`):
  **`failed` unchanged at 63** (zero regressions — the pre-existing failures, e.g.
  `stepTemplate.test.ts`'s Next.js request-scope errors, are unrelated to this task and were
  spot-checked as not touching any of the five converted files), `passed`/`total` both **+34**
  (32 new tests in `fail-closed-stop-access.test.ts` + 2 from `tenant-client-stop-access.test.ts`'s
  `site-3b` row expanding from ~2 assertions to ~4 when inverted), `skipped`/`todo` unchanged.
- **Repo-wide `app.bypass_rls` count** (non-test):
  `grep -rn "set_config('app.bypass_rls'" src --include=*.ts --include=*.tsx | grep -v
  "__tests__\|tests/" | wc -l` → **213**, down from the 218 baseline (5 removed across A–E, F net
  zero) — matches the plan's expected arithmetic exactly.

## Task Commits

1. **Task 1: route five fail-closed carrier transactions onto tenant clients** - `2509429c` (fix)
2. **Task 2: split the stop-detail documents read across tenant and bare clients** - `843cbb59` (fix)
3. **Task 3: pin the ten converted fail-closed carrier access paths** - `374e052c` (test)

No separate plan-metadata commit was made — this is a quick-task execution, not a phase plan; the
three task commits above are the full deliverable.

## Files Created/Modified
- `apps/web/src/app/(driver)/actions/driver-routes.ts` - A/B converted to `tenantPrisma`; startTrip (out of scope) untouched
- `apps/web/src/app/(driver)/actions/driver-load.ts` - C converted to `tenantPrisma`
- `apps/web/src/app/api/mobile/carrier/driver/dispatches/route.ts` - D converted to `getTenantPrismaForOrg`
- `apps/web/src/app/api/mobile/carrier/driver/dispatches/[id]/route.ts` - E converted to `getTenantPrismaForOrg`
- `apps/web/src/app/(owner)/carrier/stops/[id]/page.tsx` - F split: carrierDocument on tenantPrisma, user stays bare+flagged
- `apps/web/tests/security/bypass-rls-flag-removal.test.ts` - driver-routes.ts row + totals updated to measured post-conversion values
- `apps/web/tests/security/tenant-client-stop-access.test.ts` - site-3b inverted to assert the F split happened
- `apps/web/tests/security/fail-closed-stop-access.test.ts` - new quick-588 guard, 32 tests, all six roots pinned with real revert-probe evidence

## Decisions Made
- Removed the bypass flag inside every converted transaction (A/B/C/D/E), diverging from the
  brief's literal "leave every flag except F's" wording — because leaving A/B's flags in place
  while running them on `tenantPrisma` would have turned the pre-existing
  `bypass-rls-flag-removal.test.ts` RULE 1 red. This is quick-587's own established rule ("a
  tenant-scoped client does not need the bypass") applied uniformly rather than selectively.
- Site F split rather than swapped whole, because `User` is not in `EXEMPT_MODELS` and a whole-file
  swap would have newly injected a `tenantId` filter into a table with no such column.
- Reported (not silently corrected) the diagnostic's internal inconsistency: "30 genuine" in its
  summary sentence doesn't match the 19 total exclusions its own bullets enumerate (46−19=27).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Guard-test regex false-matched its own doc comment**
- **Found during:** Task 3 (writing the new guard)
- **Issue:** `mustNotContain: /getTenantPrisma\(\)/` for sites D and E matched the literal string
  `getTenantPrisma()` inside my own explanatory doc comment ("a later edit to getTenantPrisma()
  (which throws...)"), not just a real bare call in source — a false positive that would have made
  the guard permanently red.
- **Fix:** Tightened the regex to `/getTenantPrisma\(\);/` (requiring the trailing call-statement
  semicolon), which the prose mention never carries.
- **Files modified:** `apps/web/tests/security/fail-closed-stop-access.test.ts`
- **Verification:** Guard re-run green (32/32) immediately after the fix.
- **Committed in:** `374e052c` (Task 3 commit — caught before commit, not a follow-up fix)

---

**Total deviations:** 1 auto-fixed (1 bug in guard-test authoring, caught and fixed before commit).
Two further reported divergences (the diagnostic's arithmetic errors — "11 not 10" and "30 not
27") are documented above in sections 1 and 6, not code deviations.
**Impact on plan:** No scope creep — the guard regex fix is internal to the new test file this
task was already authoring.

## Issues Encountered
None beyond the guard-regex self-collision above, resolved before commit.

## User Setup Required
None - no external service configuration required. No RLS policy was created, altered or
dropped; no migration was run; `tenant-rls.ts`, `EXEMPT_MODELS`, `getTenantPrisma`/
`getTenantPrismaForOrg`, and `prisma/schema.prisma` were not touched.

## Next Phase Readiness
All ten §6b fail-closed sites are now on a tenant-scoped client (or, for F, correctly split
between a tenant-scoped and a bare client). The nested-include audit and a direct check of site F
both report zero remaining fail-closed carrier access paths touching `stops`,
`route_template_stops` or `carrier_documents`. This clears the blocker
`docs/diagnostics/rls-policy-design.md` §7 named for applying the drafted RLS policies on those
three tables — applying them early is no longer deferring a defect to cutover day for these ten
sites specifically. (The diagnostic's broader recommendation — smoke-testing against an `app_user`
connection rather than `postgres` before flipping `DATABASE_URL` — remains a separate, not-yet-done
step, unchanged by this task.)

---
*Phase: quick-588*
*Completed: 2026-09-04*

## Self-Check: PASSED

- FOUND: `.planning/quick/588-fix-eleven-fail-closed-access-paths-befo/588-SUMMARY.md`
- FOUND: `apps/web/tests/security/fail-closed-stop-access.test.ts`
- FOUND: commit `2509429c` (Task 1)
- FOUND: commit `843cbb59` (Task 2)
- FOUND: commit `374e052c` (Task 3)

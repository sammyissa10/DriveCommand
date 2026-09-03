---
phase: quick-586
plan: 01
subsystem: database
tags: [prisma, rls, multi-tenant, postgres, tenant-isolation]

requires:
  - phase: quick-583
    provides: "docs/diagnostics/rls-policy-gap-stops.md — the ten bare-prisma sites diagnostic this task re-derives and corrects"
provides:
  - "Fourteen bare-prisma access paths to stops/route_template_stops/carrier_documents converted to a tenant-scoped Prisma client"
  - "SITE-AUDIT.md — re-derived site list, per-transaction EXEMPT_MODELS classification, one NEEDS-DECISION transaction identified and left unconverted"
  - "Vitest guard (tests/security/tenant-client-stop-access.test.ts) covering all fourteen conversions plus the NEEDS-DECISION counter-assertion"
affects: [rls-policy-work, quick-583, quick-584]

tech-stack:
  added: []
  patterns:
    - "getTenantPrisma() for header-bearing request contexts, getTenantPrismaForOrg(orgId, userId) for header-less ones (cron, /api/mobile/*) — never getTenantPrisma(session), which does not exist"
    - "A transaction-root client swap is a pure client swap ONLY when every model reached inside the transaction body is in EXEMPT_MODELS; classify per transaction body, not per file"

key-files:
  created:
    - .planning/quick/586-fix-ten-bare-prisma-access-paths-on-stop/SITE-AUDIT.md
    - apps/web/tests/security/tenant-client-stop-access.test.ts
  modified:
    - apps/web/src/app/(driver)/actions/driver-routes.ts
    - apps/web/src/app/(driver)/actions/driver-dashboard.ts
    - apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx
    - apps/web/src/app/(owner)/carrier/stops/[id]/page.tsx
    - apps/web/src/app/(owner)/carrier/trips/[id]/page.tsx
    - apps/web/src/app/(owner)/carrier/trips/[id]/stops/page.tsx
    - apps/web/src/app/api/driver/stops/[stopId]/documents/route.ts
    - apps/web/src/app/api/driver/stops/[stopId]/messages/route.ts
    - apps/web/src/app/api/mobile/carrier/driver/dispatches/[id]/expenses/route.ts
    - apps/web/src/app/api/mobile/carrier/driver/stops/[stopId]/documents/route.ts
    - apps/web/src/app/api/v1/carrier/stops/[id]/messages/route.ts
    - apps/web/src/lib/carrier/trips.ts
    - apps/web/src/lib/carrier/dispatch-generator.ts
    - apps/web/src/lib/carrier/route-template-save.ts

key-decisions:
  - "The diagnostic's ten bare-prisma sites are all still bare, and four more sites exist that a file-level accessor grep missed (Group 3) — converted in a separate, independently revertible commit"
  - "One transaction (owner stops/[id]/page.tsx, lines 116-150) is NEEDS-DECISION and was NOT converted: it touches CarrierDocument (exempt) and User (not exempt, has tenantId) in the same tx, and the injected tenantId filter is not provably a no-op from the query text"
  - "Zero of the fourteen sites' three-table accesses occur inside after() — the brief's premise was false, corrected in SITE-AUDIT.md"
  - "The cron path (carrier-auto-dispatch) is transitively reachable to CarrierStop writes via generateDispatches — converted as site 13, using the getTenantPrismaForOrg(orgId) client already resolved in that function"
  - "Four more bare-prisma nested-include sites in driver-routes.ts (getMyActiveDispatch, getMyDispatchHistory) were discovered but are OUT OF SCOPE and NOT converted — they reach the stops table via a nested Trip.stops include, invisible to the accessor-grep methodology this task uses, and converting them would expand scope well beyond the enumerated fourteen sites"

patterns-established:
  - "Source-scanning Vitest guard with per-site byte-length floor, CRLF normalisation, 'was it actually found' mustContain assertions, a SITES.length integrity assertion, and a bypass_rls counter-assertion proving the scan reads real content"

duration: ~75min
completed: 2026-09-03
---

# Quick Task 586: Route bare-prisma stop/document access paths through a tenant client Summary

**Converted fourteen bare-`prisma` access paths to `stops`, `route_template_stops` and `carrier_documents` onto `getTenantPrisma()`/`getTenantPrismaForOrg()` — ten from the diagnostic plus four more discovered during re-derivation — leaving one genuinely ambiguous transaction (CarrierDocument + User) unconverted and reported.**

## Performance

- **Duration:** ~75 min
- **Started:** 2026-09-03T19:00:00Z (approx)
- **Completed:** 2026-09-03T20:16:03Z
- **Tasks:** 3 (audit, Group 1+2 conversion, Group 3 conversion + verification)
- **Files modified:** 15 (14 source files + 1 new guard test), plus 1 new audit doc

## Accomplishments

- Re-derived all fourteen bare-prisma sites from the working tree (not copied from the diagnostic), confirmed zero drift in the accessor/nested-include grep counts (159/32/37, matching the plan's F8 numbers exactly), and identified the 32nd file as `generated/prisma/index.d.ts` (a type declaration, not a real query site)
- Classified every transaction touched by the swap against `EXEMPT_MODELS`, per transaction body rather than per file — this surfaced one NEEDS-DECISION transaction that no prior document had isolated to a specific tx (CarrierDocument + User sharing a transaction root in `stops/[id]/page.tsx`)
- Converted 13 of 14 sites (10 from Groups 1+2, matching the diagnostic; 4 from Group 3, sites the diagnostic missed) across two independently revertible commits
- Corrected two false premises in the brief/diagnostic: the `after()` set is empty (zero of the three-table accesses run inside `after()`), and the cron path is real (via `generateDispatches`), not "none"
- Built a source-scanning Vitest guard covering all fourteen sites plus the NEEDS-DECISION counter-assertion (70 tests), and proved it is not vacuous by reverting one site from each commit and observing a named RED failure before restoring

## Task Commits

1. **Task 1: Re-derive and classify the fourteen sites** — `4f939187` (docs)
2. **Task 2: Convert Groups 1+2, land the guard test** — `28426dc4` (fix)
3. **Task 3: Convert Group 3, extend the guard, run verification** — `da3a485f` (fix)

## Files Created/Modified

- `.planning/quick/586-fix-ten-bare-prisma-access-paths-on-stop/SITE-AUDIT.md` — the full re-derived site table, per-transaction classification, divergences from the diagnostic, bypass_rls census with exact line numbers, corrected access count
- `apps/web/tests/security/tenant-client-stop-access.test.ts` — the Vitest guard, 70 tests across 15 site entries (14 conversions + 1 NEEDS-DECISION counter-assertion)
- `apps/web/src/app/(driver)/actions/driver-routes.ts` — `arriveAtStop`/`completeCurrentStop` transactions now on `getTenantPrisma()`
- `apps/web/src/app/(driver)/actions/driver-dashboard.ts` — the carrierStop-counting branch of `getDriverQuickActionBadges` now on the already-resolved `tenantPrisma`
- `apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx` — both direct `carrierStop` calls now on `getTenantPrisma()`
- `apps/web/src/app/(owner)/carrier/stops/[id]/page.tsx` — the standalone `carrierStop.findUnique` converted; the CarrierDocument+User transaction deliberately left on the bare client
- `apps/web/src/app/(owner)/carrier/trips/[id]/page.tsx` — `routeTemplateStop.findMany` and both `carrierDocument.groupBy` calls converted
- `apps/web/src/app/(owner)/carrier/trips/[id]/stops/page.tsx` — `carrierDocument.groupBy` converted
- `apps/web/src/app/api/driver/stops/[stopId]/documents/route.ts` — all three transactions (ownership check, create, list) converted
- `apps/web/src/app/api/driver/stops/[stopId]/messages/route.ts` — the two carrierStop-bearing transactions converted; the fleetMessage/user transactions in the same file left untouched (out of scope)
- `apps/web/src/app/api/mobile/carrier/driver/dispatches/[id]/expenses/route.ts` — converted to `getTenantPrismaForOrg(auth.tenantId, auth.userId)`
- `apps/web/src/app/api/mobile/carrier/driver/stops/[stopId]/documents/route.ts` — both transactions converted to `getTenantPrismaForOrg(auth.tenantId, auth.userId)`
- `apps/web/src/app/api/v1/carrier/stops/[id]/messages/route.ts` — both carrierStop-bearing transactions converted
- `apps/web/src/lib/carrier/trips.ts` — `reorderTripStops`'s array-form transaction and its `carrierStop.update` calls converted
- `apps/web/src/lib/carrier/dispatch-generator.ts` — the dispatch+load+stop creation transaction converted; unused bare `prisma` import removed
- `apps/web/src/lib/carrier/route-template-save.ts` — both `routeTemplateStop` write transactions converted from the bare client to the `db` parameter already threaded through; unused bare `prisma` import removed, stale header comment corrected

## Decisions Made

See `key-decisions` in frontmatter. In brief: convert exactly what F2 (EXEMPT_MODELS) proves is a pure client swap; leave anything touching a non-exempt model (User, FleetMessage) untouched and reported rather than guessed at; report — but do not convert — nested-include sites outside this task's accessor-based scope.

## Deviations from Plan

### Auto-fixed / scope corrections (not Rule 1-3 bug fixes — these are re-derivation corrections, not code defects)

**1. [Scope correction] Site 3 split into a convertible half and a NEEDS-DECISION half**
- **Found during:** Task 1 (re-deriving `stops/[id]/page.tsx`)
- **Issue:** The plan's F4 listed site 3 as one row ("74, 118 | CarrierStop, CarrierDocument"), but line 74 is a standalone call with no shared transaction, while line 118 sits inside a transaction that ALSO reads `tx.user.findMany` (line 136) — `User` is not in `EXEMPT_MODELS` and the `where` on that read carries no existing `tenantId` filter, so the injection is not provably a no-op.
- **Fix:** Converted only line 74 (`prisma.carrierStop.findUnique` → `tenantPrisma.carrierStop.findUnique`). Left the transaction at lines 116-150 (`carrierDocument.findMany` + `user.findMany`) on the bare `prisma` client, added a counter-assertion (`site-3b-needs-decision-untouched`) to the guard proving it stays that way, and documented a proposed pattern (split the tx, or accept the injection as a data-model-provable no-op) in `SITE-AUDIT.md` §5.
- **Files modified:** `apps/web/src/app/(owner)/carrier/stops/[id]/page.tsx`
- **Verification:** Guard test `site-3b-needs-decision-untouched` passes; `tsc`/`next build`/full suite all green
- **Committed in:** `28426dc4`

**2. [Reported, not converted] Four more bare-prisma sites reaching `stops` via nested include, outside this task's scope**
- **Found during:** Task 1 (re-deriving `driver-routes.ts`)
- **Issue:** `getMyActiveDispatch` and `getMyDispatchHistory` in the same file each open a bare `prisma.$transaction` whose body does `tx.trip.findFirst`/`findMany` with a nested `include: { stops: {...} } }` that reaches `CarrierStop`, `CarrierDocument`, `CarrierFacility`, `CarrierLoad`/`CarrierClient` — all EXEMPT, and by F2's argument these would be provably safe pure client swaps if converted. They are invisible to the accessor-grep methodology (`\.carrierStop\b` etc.) this task and the diagnostic both use, since the access happens through a relation name (`stops:`) rather than a model accessor.
- **Fix:** NOT converted. Reported in `SITE-AUDIT.md` §7 as an out-of-scope finding for a follow-up task, since converting it would mean auditing some fraction of 32 real nested-include sites (a materially larger task than "convert the fourteen enumerated sites").
- **Files affected (unconverted):** `apps/web/src/app/(driver)/actions/driver-routes.ts` (lines 45, 121 — untouched)
- **Verification:** N/A — deliberately not converted
- **Committed in:** N/A (documented only, in `4f939187`)

---

**Total deviations:** 2 (1 scope-narrowing correction within an already-planned site, 1 scope-boundary finding reported for follow-up). Neither is a Rule 1-3 auto-fix; both are re-derivation corrections the plan explicitly asked for ("verify — don't trust — F4").
**Impact on plan:** No scope creep. If anything, scope was narrowed at exactly the point hard constraint 7 (NEEDS-DECISION gate) required, and a genuine additional gap was surfaced rather than silently left out.

## Issues Encountered

- **`grep -n "0 tests"` — vitest CLI shape:** none; `npx vitest run <path>` behaved as documented throughout.
- **Anti-vacuity probe tooling:** used `sed -i` for the two probe reverts (Task 2 and Task 3) rather than the Edit tool, to keep the revert/restore cycle fast; verified with `git diff` after each restore that the file matched the original conversion byte-for-byte before committing.
- **tsc probe leftover blank line:** appending the probe line with `echo >> file` left a trailing blank line after `sed -i '/__probe586/d'` removed the probe itself. Caught by `git diff` showing a one-line addition; resolved with `git checkout -- <file>` to restore the exact committed state rather than hand-editing.

## Verification Evidence

### Guard test — final state and anti-vacuity probes

Final run (after both commits):
```
✓ tests/security/tenant-client-stop-access.test.ts (70 tests)
Test Files  1 passed (1)
     Tests  70 passed (70)
```

**Probe 1 (Task 2, Group 1/2 site):** reverted `loads/[id]/page.tsx`'s `tenantPrisma.carrierStop.findMany` back to `prisma.carrierStop.findMany`:
```
FAIL tests/security/tenant-client-stop-access.test.ts > ... > site-2-loads-detail-page > mustContain: /tenantPrisma\.carrierStop\.findMany\(/
FAIL tests/security/tenant-client-stop-access.test.ts > ... > site-2-loads-detail-page > mustNotContain: /\bprisma\.carrierStop\b/
Tests  2 failed | 48 passed (50)
```
Restored; re-ran green (50/50 at that point in the sequence).

**Probe 2 (Task 3, Group 3 site):** reverted `route-template-save.ts`'s `db.$transaction` (edit-mode branch) back to `prisma.$transaction`:
```
FAIL tests/security/tenant-client-stop-access.test.ts > ... > site-14-route-template-save > mustContain: /const notFound = await db\.\$transaction\(async \(tx\) => \{/
FAIL tests/security/tenant-client-stop-access.test.ts > ... > site-14-route-template-save > mustNotContain: /const notFound = await prisma\.\$transaction/
Tests  2 failed | 68 passed (70)
```
Restored; confirmed via `git diff` the file matched the original conversion exactly; re-ran green (70/70).

### tsc — probed

Injected `const __probe586: number = 'y';` into `apps/web/src/lib/carrier/trips.ts` (a file this task edited):
```
src/lib/carrier/trips.ts(1127,7): error TS2322: Type 'string' is not assignable to type 'number'.
```
Probe removed, confirmed gone (`grep` exit 1), file restored to exact committed state via `git checkout --`. Re-run:
```
npx tsc --noEmit   →   (zero output, zero errors)
```

### next build

```
✓ Compiled successfully in 36.5s
```
Full route manifest printed with no errors (one pre-existing, unrelated "package seems invalid... EcmaScript module" warning, not from this task's files).

### Full Vitest suite — before/after

- **Baseline (stated, verified same day):** 63 failed / 1702 passed / 61 skipped / 3 todo / 1829 total
- **After this task's last commit (`da3a485f`), single warm run, default reporter:**
  ```
  Test Files  17 failed | 139 passed | 8 skipped (164)
       Tests  63 failed | 1772 passed | 61 skipped | 3 todo (1899)
  ```
- **Delta:** +70 passed, +70 total, **0 change in failed count**. The +70 is exactly the new guard test's test count. All 63 pre-existing failures were confirmed by name to be in unrelated files (`workflows-*`, `driver-pay` exporters, `tests/unit/auth/*`, `stepTemplate`/`playbook` routers) — none reference any of the fourteen converted files.

## User Setup Required

None — no external service configuration required. No RLS policy, migration, or database change of any kind (verified: `git diff master~3 HEAD --stat -- apps/web/prisma apps/web/src/lib/db/extensions/tenant-rls.ts apps/web/src/lib/context/tenant-context.ts` is empty).

## Next Phase Readiness

- All fourteen sites this task set out to convert are converted (13) or explicitly classified NEEDS-DECISION and left alone with a proposed pattern (1).
- **Hand-off to the RLS policy work** (see `SITE-AUDIT.md` §8): every `set_config('app.bypass_rls', ...)` statement is untouched and enumerated by exact line number. Once a policy exists on `stops`/`route_template_stops`/`carrier_documents`, if it includes the control tables' `bypass_rls_policy` half, every one of those lines becomes a site that deliberately bypasses tenant isolation on these three tables **by design** — the policy author must decide this knowingly; this task's conversion does not change that calculus, only the GUC hygiene underneath it.
- **Two genuine gaps remain, reported not built:**
  1. The NEEDS-DECISION transaction in `stops/[id]/page.tsx` (CarrierDocument + User) — needs either a split transaction or a deliberate accepted-no-op decision before it can be converted.
  2. The four nested-include bare-prisma sites in `driver-routes.ts` (`getMyActiveDispatch`, `getMyDispatchHistory`) — safe by the same EXEMPT_MODELS argument as everything else here, but out of this task's accessor-based scope. A follow-up task should audit the 32 real (non-legacy-`Route`) nested-include sites the same way this task audited the fourteen accessor sites.

---
*Phase: quick-586*
*Completed: 2026-09-03*

## Self-Check: PASSED

All created/modified files confirmed present on disk (SITE-AUDIT.md, this SUMMARY.md, the
guard test, and all fourteen source files). All three task commit hashes (`4f939187`,
`28426dc4`, `da3a485f`) confirmed present in `git log`. No missing items.

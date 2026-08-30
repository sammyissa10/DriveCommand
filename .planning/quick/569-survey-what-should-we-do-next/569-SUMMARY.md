# quick-569 — SUMMARY

**Date:** 2026-08-30 · **Branch:** `master` · **Pre-task HEAD:** `056713fb`
**SURVEY ONLY.** No source file, CSS, config or migration changed. Twelve
read-only production `SELECT`s, zero writes.
**Report:** [`.planning/document-import/diagnostics/next-work-survey.md`](../../document-import/diagnostics/next-work-survey.md)

---

## The three findings worth the survey

**1. Both flagged items were mis-stated, in opposite directions.** Facility
geocoding is not a silent degradation — **300 of 304 production trips (98.7%)**
touch a facility with null coordinates, so `pointsFor()` returns null for the
whole set, `getDistanceMatrix` is never called, and route optimisation is *off*.
It reports itself as *"Driving distances are not available right now. Try again
shortly."* — the quick-546 class, an instruction guaranteed never to succeed.
The signature item is the reverse: *"a DVIR with no signatory"* is wrong,
because **18 of 18 answered items carry `completedByUserId` and `completedAt`**.
What is missing is the attestation, not the attribution — and **4 of 4 playbook
instances with any answered item are on no-signature playbooks, with zero
signature rows anywhere in the database.** 100%, not 30%.

**2. The list is missing a bigger class than anything on it.** Eight complete
owner features — CRM, Compliance, IFTA, Fuel, Lane Analytics, Profit Predictor,
Tags, Subscription — have **no `href` on any surface**, appearing only in
`middleware.ts` and the feature registry. Phase 12's `HelpGuides` then surfaced
a written article for all eight, so `/help` now advertises features an owner
cannot open. Whether they are retired or orphaned is **the one question in the
survey a human has to answer** — quick-567 set the convention (record an
intentional unlink loudly) and there is no such record. Separately,
`submitIncidentReport` is a **silent stub**: it validates, writes nothing,
notifies nobody, and returns *"Incident report submitted successfully. Dispatch
has been notified."* It is reachable from a driver quick action, and
`DriverIncident` holds 0 rows.

**3. The 66 failures are noise; the 61 skips are the risk.** All 66 traced to
four dated causes, none real behaviour: 45 broken by the RLS Phase 2 sweep
`bdbb547c` on **2026-07-17**, 10 by the Phase 37.6 auth consolidation (one of
which asserts the *pre-hardening* `user_metadata` shape), 5 that are a Windows
CRLF artifact and pass on Linux, 6 by later correct behaviour changes. Meanwhile
**61 tests skip on every run and every one is a security or tenant-isolation
test**, because `vitest.config.ts` never loads `DATABASE_URL` — and CI supplies
a dummy value pointing at a database that does not exist, on a `pull_request`
trigger that the direct-commit-to-master workflow never fires.

## Corrections to the deferred list

Closed: **#7** (`SuggestedTemplates` is wired and rendering — Phase 8),
**#26** (`/carrier/trips` has a sidebar link at `Sidebar/index.tsx:347`; the
comment at `:261` asserting otherwise is now stale). Latent not live: **#23**
(zero soft-deleted facilities exist). Two positives the list does not record:
`route_matrix_cache` now holds a row, and `carrier_truck_defects` has gone
**0 → 2**, so quick-549's fix is demonstrated by rows.

## Also established

- **Lint has never run on this module.** `next lint` removed in Next 16, ESLint
  9 needs flat config, and **`next build` no longer lints at all** — `eslint`
  appears once in `next/dist/build/index.js`, in a source comment. Fix is one
  new `eslint.config.mjs`, zero installs. Stated plainly in the report: lint
  would not have caught anything else in this survey.
- **API permission coverage is clean** — 271 routes, 8 without an identity
  marker, all 8 unauthenticated by design.
- **23 orphaned components**, not the 8 the list names; the scanner
  under-reports because it matches on basename (`tracking/StatusPill` is masked
  by the live `ui/ds/StatusPill`, exactly as `CLAUDE.md` warns).
- Six live *"Driver has been notified"* sentences gated on `isInProgress`, a
  trip status rather than a delivery result.

## Ranking

**Do next (4):** incident-report stub · decide the eight unreachable features ·
geocode `createFacility` · load `DATABASE_URL` in vitest.
**Before launch (8):** revive the 45 workflow tests · a column for the
attestation · RLS Phase 2 · HTTPS for OSRM · `raw_extraction` retention ·
run Section 16 once · the six notification sentences · browser-test Phase 10's
preference controls.
**Eventually (9)** · **Do not do (9)**, each with its reason — five of them
citing a prior task that already settled the question.

## Gates

| Gate | Result |
|---|---|
| `npx tsc --noEmit` (`apps/web`) | **0 errors**; `git status` shows no untracked source, so the blind-gate trap is inactive. **No probe injected** — the brief forbids writes; recorded as a stated weakening, not an oversight |
| Full vitest run | 1730 total · 1600 passed · 66 failed · 61 pending — identical to quick-567's published figure |
| Source files changed | **0** |
| DDL | **None** |
| Production writes | **None.** Four carrier suites create a disposable tenant and delete it; verified afterwards — zero tenants created in six hours, zero orphan `in_app_notifications`, facilities 59 and defects 2, both unchanged |

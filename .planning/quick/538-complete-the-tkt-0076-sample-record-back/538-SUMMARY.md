# quick-538 — Complete the TKT-0076 sample-record backfill

**Date:** 2026-08-25 · **Branch:** `feature/document-import` · **Baseline:** `83fe5b3b`
**Commits:** `cae127ab`, `f7f4fd07`, `bfeade6d`, `57220a18`
**Not pushed, not deployed. NOT browser-verified.**

> **Deploy note.** The user asked mid-task to push rather than commit, then clarified: save
> everything, deploy nothing, and deploy deliberately once the remaining two document-import
> phases land. The Vercel project **is git-connected** — deployment metadata shows two distinct
> triggers, CLI (`gitDirty: "1"`, `actor: claude-code_…_harness`) and **GitHub push**
> (`repoPushedAt`, `branchAlias: drive-command-git-master-…`, target `production`). A push to
> `master` therefore deploys production, and a branch push would trigger a preview build. The
> repo is also `githubRepoVisibility: "public"` and the branch carries 101 unpushed commits.
> **Nothing was pushed.** Committing saves the work with zero deploy risk, which is also the
> standing preference on file.

---

# STEP 1 — the audit, and the gate it tripped

## `excludeSamples` — every call site and the blast radius

**One definition, one use, and ZERO callers passing it.**

| Site | Line | Effective value today | If the default flipped to on |
|---|---|---|---|
| `app/(owner)/actions/drivers.ts` — signature | 236 | `opts?: { activeOnly?: boolean; excludeSamples?: boolean }` | — |
| `app/(owner)/actions/drivers.ts` — use | 246 | `...(opts?.excludeSamples ? { isSample: false } : {})` → **off** | on |
| `app/(owner)/drivers/page.tsx` | 19 | `listDrivers()` — **no args** | **behaviour changes** |
| `app/(owner)/tags/page.tsx` | 23 | `listDrivers()` — **no args** | **behaviour changes** |

**Both call sites are outside this task's scope, and one is a provable regression.**

`drivers/page.tsx` is a **list page** — which the task's own constraint protects ("sample records
must remain visible in list grids with their pill"). It is worse than a scope violation, because
the page *derives its banner from the samples being present*:

```ts
const drivers = await listDrivers();
const hasSampleRecords = drivers.some((d) => d.isSample);   // ← always false after the flip
{sampleDataSeeded && hasSampleRecords && tenantId && <SampleDataBanner tenantId={tenantId} />}
```

Flipping the default would have **silently removed the sample-data banner from the drivers page**
— the very affordance that tells a user their records are samples. `tags/page.tsx` feeds
`TagAssignment`: labelling, not dispatch, and tagging a sample record is harmless.

Corroborating evidence that no picker calls it any more: `lib/routes/assignable-drivers.ts:3`
records TKT-0084's root cause as *"`/routes/new` sourced its picker from `listDrivers()`"* — that
picker was already migrated off it.

**Verdict: step 4 NOT executed**, per the brief's own stop condition — *"If step 1 shows the
default flip reaches call sites outside this task's scope, stop and report rather than widening."*
`excludeSamples` remains opt-in and default-off, and is now the **only** such flag in the codebase
that behaves that way, which is worth revisiting as its own task with the list-vs-picker split in
hand.

## STEP 2 — quick-537's surface list against live code

The five **web** surfaces were verified in live code and were exactly as described — all still
`where: { orgId }` / `where: { orgId, status: 'active' }`. The four already-correct surfaces were
confirmed untouched. **Three corrections:**

1. **`carrier/loads/page.tsx:14` is not a picker.** It builds `clientMap`, a display-only label
   lookup — structurally identical to the `trips/page.tsx` `driverMap` that 537 correctly
   excluded. Filtering it would blank the client name on a load rather than remove a choice.
   537 over-included it; **left alone.**
2. **537 named the wrong mobile driver endpoint.** `/api/mobile/owner/drivers` is the **list**
   screen; the picker `routes/new` actually binds to is `/api/mobile/owner/drivers/active`, which
   537 missed entirely. The `/active` twin is what got filtered.
3. **`/api/mobile/owner/trucks` is shared by eight call sites**, one of which
   (`more/trucks/index.tsx`) is the trucks **list** screen. Filtering it at the query would have
   violated the list constraint.

---

# What changed

## T1 — the filter, on every operational picker (`cae127ab`)

**14 queries across 5 web pages**, each matching `carrier/trips/new` exactly
(`isSample: false, deletedAt: null`), each under a TKT-0076 comment:

| Page | client | driver | truck |
|---|:--:|:--:|:--:|
| `carrier/loads/new` | ✅ | ✅ | ✅ |
| `carrier/loads/[id]` | ✅ | ✅ | ✅ |
| `carrier/templates/new` | ✅ | ✅ | ✅ |
| `carrier/templates/[id]` | ✅ | ✅ | ✅ |
| `carrier/trips/[id]` | — | ✅ | ✅ |

Plus `/api/mobile/owner/drivers/active` (the picker), with its sibling `/api/mobile/owner/drivers`
deliberately left unfiltered and commented as the list.

`CarrierClient` carries both `isSample` and `deletedAt` — checked in `schema.prisma` before
adding the second term rather than assuming symmetry with drivers and trucks.

## T3 — opt-in `exclude_samples` where a picker shares an endpoint with a grid (`f7f4fd07`)

Two endpoints serve both a picker and a list. The filter could not go in the shared `where`
without hiding samples from the grid they are converted from, so both take a parameter that is
**opt-in and default OFF** — every existing caller and both grids behave exactly as before.

| Endpoint | Grid (unfiltered) | Picker (opts in) |
|---|---|---|
| `/api/v1/carrier/loads` | loads grid | `DispatchLoadsPanel` — attach a load to a dispatch |
| `/api/mobile/owner/trucks` | `more/trucks/index` | `TruckPickerSheet`, `fuel`, `maintenance`, `routes/new`, `routes/[id]` |

On mobile the split rides an existing seam: `ownerApi.getTruckOptions` was already named for
pickers, and is now the variant that requests `?exclude_samples=true`, while `getTrucks` stays the
list variant. Three pickers moved across.

**The cache was the trap, not the query.** All eight mobile call sites shared the React Query key
`['owner-trucks']`. Leaving the pickers on that key would have let whichever request resolved last
win the cache and silently put samples back into a picker — a bug that would present
intermittently and look nothing like a filter problem. Pickers now use `['owner-truck-options']`,
and truck create/edit invalidate **both** keys.

## T4 — the conversion path drivers and clients never had (`bfeade6d`)

`ConvertSampleRecord` promises on screen: *"It's hidden from operational pickers. Convert it to a
real record to keep and use it."* It was mounted on **trucks only**, while `SamplePill` rendered
on all four grids — so **26 sample drivers database-wide** carried the badge, were hidden from the
pickers that already filtered, and had no way out. Now mounted on
`carrier/fleet/drivers/[id]` and `carrier/clients/[id]`, matching the trucks implementation and
not redesigned.

The PATCH needs somewhere to land, so `isSample` joins both Zod schemas and both input types
(`CarrierDriverCreateInput`, `ClientCreateInput`), documented as **write-false-only**: nothing may
flag a record as a sample after seeding, which keeps the task's "do not add a way to mark records
as samples" constraint true at the type level rather than by convention.

## T5 — a reason for the absence (`bfeade6d`)

**Approved copy, implemented verbatim:**

> **Sample records are hidden here. Convert one to use it.**

`components/onboarding/sample-hidden-note.tsx` — one line, `role="note"` (nothing has gone wrong;
it is an explanation, not an alert), rendered **in the picker**, no modal. It deliberately echoes
`ConvertSampleRecord` so the two surfaces read as one sentence: finding the second confirms the
first rather than raising a new question.

Gated on `hasHiddenSamples(orgId)` — one cheap count per entity on pages already reading those
tables — so it appears only when the rule actually removed something. A note about a rule that
removed nothing is noise, and it would otherwise show for every tenant that never seeded.
`DispatchLoadsPanel` renders it unconditionally, stated in place: a client component cannot
cheaply ask, and the sentence is true of that picker either way.

**Why this exists at all:** TKT-0076's rule is correct but shipped *silent*, and silence is what
made it expensive. The same missing record was misdiagnosed twice — once as a `status` filter,
once as a `truck_type` misclassification — before anyone reached `is_sample`.

## STEP 7 — does `loads` need the same treatment?

**Yes. It has a picker, and it was blocked by the same shared-endpoint shape rather than by
anything about loads.**

`DispatchLoadsPanel.tsx:96` fetches `/api/v1/carrier/loads?status=pending` to attach a load to a
dispatch — a genuine operational picker, and the reason `loads` appeared in neither of 537's
lists: it is a client component, so it never showed up in a `findMany` grep. Handled by T3.

Everything else touching `carrierLoad.findMany` was checked and is **not** a picker: the list grid
(`lib/carrier/loads.ts`), id-hydration for a trip's own stops (`trips/[id]/plan/page.tsx:48` —
filtering it would blank a load reference on a live trip), driver's own loads, dashboard
aggregates, profitability reports, and recently-deleted.

---

# Tests (`57220a18`)

`apps/web/tests/carrier/sample-record-picker-filtering.test.ts` — **12 cases, 12 passing.**

```
 ✓ tests/carrier/sample-record-picker-filtering.test.ts (12 tests) 5494ms
   ✓ hides a sample truck from the picker and keeps it in the fleet list      387ms
   ✓ hides a sample driver from the picker and keeps it in the driver list    362ms
   ✓ hides a sample client from the picker and keeps it in the client list    358ms
   ✓ puts a converted record into the pickers immediately                    1732ms
   ✓ …/trips/new/page.tsx filters isSample on every picker query
   ✓ …/trips/[id]/page.tsx filters isSample on every picker query
   ✓ …/loads/new/page.tsx filters isSample on every picker query
   ✓ …/loads/[id]/page.tsx filters isSample on every picker query
   ✓ …/templates/new/page.tsx filters isSample on every picker query
   ✓ …/templates/[id]/page.tsx filters isSample on every picker query
   ✓ the mobile driver PICKER filters and its LIST sibling does not
   ✓ the shared endpoints keep sample filtering opt-in and default off

 Test Files  1 passed (1)
      Tests  12 passed (12)
```

**Step 8** — four real-row cases over a disposable tenant, nothing mocked. Each entity gets a
sample **and** a real row, so a picker returning nothing at all would fail too. Every case asserts
**both halves of the rule on the same row in the same run**: excluded from the picker predicate,
present in the list predicate, and still flagged `isSample: true` (which is what renders the pill
and what the Convert affordance keys off). Testing one side alone cannot see the seam — "filter
everywhere" and "show everywhere" are both easy and both wrong.

**Step 9** — converts all three, asserts they enter the pickers immediately with no cache to bust
and no second flag to clear, asserts the sets are length 2 (converted, not duplicated), then
restores the fixture so the cases stay order-independent.

**Eight source-guard cases** cover what the row tests structurally cannot: these pages are React
server components vitest cannot invoke, so the guard reads them off disk and requires the
predicate — the same shape as the facility-address fixture guard, and for the same reason, since a
filter deleted from one page is *exactly* the failure TKT-0076 already suffered. It also asserts
the two things an over-eager backfill would break: that the mobile driver **list** does NOT
filter, and that both shared endpoints keep the filter opt-in rather than unconditional.
Deliberately not gated on `DATABASE_URL` — it is a source assertion.

---

# Gates

## tsc — probed in both apps, demonstrably not blind

| App | Errors | Probe | Result |
|---|---|---|---|
| `apps/web` | **0** | `const __probe538: number = 'not-a-number'` in `carrier/loads/new/page.tsx` | `src/app/(owner)/carrier/loads/new/page.tsx(103,7): error TS2322: Type 'string' is not assignable to type 'number'.` — the injected error, at the exact line, **and the only error**. Removed. |
| `apps/mobile` | **0** | same probe in `components/owner/TruckPickerSheet.tsx` | `components/owner/TruckPickerSheet.tsx(155,7): error TS2322: …` — likewise the only error. |

`packages/api-client` was rebuilt (`npx tsc`) before the web typecheck, per the standing rule that
`main` points at a gitignored `dist/` and new exports are otherwise invisible.

**One self-inflicted incident, recorded because it nearly shipped a silent revert.** Restoring the
mobile probe with `git checkout -- <file>` reverted the probe *and the real change in the same
file*, because that change was still uncommitted. Caught by re-grepping for `getTruckOptions`
rather than trusting the checkout, reapplied, and re-verified. **`git checkout --` is not a
probe-removal tool on a file with uncommitted work** — surgical removal (as used on the web side)
is.

## Full suite — diffed against the pre-task commit, not counted

| | Tests | Passed | Failed |
|---|---|---|---|
| Baseline `83fe5b3b` | 1364 | 1240 | **66** |
| After `57220a18` | 1376 | 1252 | **66** |

```
NEWLY FAILING (regressions): 0
NO LONGER FAILING: 0
failure sets byte-identical: true
new tests added: 12
```

The 66 are the pre-existing workflow-engine failures, **proven** unchanged by set comparison
rather than asserted. +12 is exactly this task's additions.

Baseline ran in a detached worktree at `<repo>/.baseline-538` (inside the root so Node resolution
reaches the hoisted `node_modules`). **`git worktree remove --force` used, never `Remove-Item`** —
it succeeded cleanly this time, leaving no residue, and `git worktree prune` confirmed. Main
checkout verified after: **4,056 tracked files**, working tree clean, still on
`feature/document-import`.

## Isolation and blast radius

- Throwaway tenant `ZZ-THROWAWAY-TKT0076-<stamp>`, `assertDisposable()` before every scoped write,
  explicit by-name refusal of `PROTECTED_TENANT_ID`, `afterAll` cleanup **verified by re-counting**.
- Post-run verification, independent of the suite's own check:

```sql
leftover_tenants            0
protected_org_trucks       15   -- tenant 7e9eca25 untouched
protected_org_samples       1   -- SAMPLE-1 still flagged, still there
protected_trip              1   -- 53e002c8-… intact
protected_stops             6
facilities_is_sample_col    0   -- NOT added, per constraint
```

- **No DDL.** `is_sample` was not added to `facilities`. Every Supabase MCP call was a `SELECT`.
- What `is_sample` MEANS is unchanged, and no path was added to mark a record as a sample —
  enforced by the write-false-only documentation on both new schema fields.
- Sample records remain visible in every list grid with their pill, asserted by test rather than
  claimed.

---

# Per-item audit

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Every `excludeSamples` call site with file, line, effective value; which would change if the default flipped; blast radius before the flip | **IMPLEMENTED** | Step 1 table — 1 definition, 1 use, **0 callers passing it**. Both callers are lists; `drivers/page.tsx` derives `hasSampleRecords` from the result, so the flip would have silently removed the sample banner. Corroborated by TKT-0084, which already moved the picker off `listDrivers()` |
| 2 | Confirm quick-537's surface list against live code; say so if a surface changed | **IMPLEMENTED** | Step 2 — five web surfaces verified unchanged; **three corrections**: `loads/page.tsx` is a display-only map (537 over-included), the real mobile driver picker is the `/active` twin (537 missed it), and `/owner/trucks` is shared with the list screen |
| 3 | Apply the filter to every operational picker lacking it, matching the four correct surfaces, TKT-0076 comment at each site | **IMPLEMENTED** | `cae127ab` — 14 queries over 5 pages plus the mobile picker endpoint, predicate identical to `trips/new`, comment at every new site. `CarrierClient.deletedAt` verified in the schema rather than assumed |
| 4 | Flip `excludeSamples` to default-on; update call sites that relied on the old default | **NOT DONE — deliberately, per the brief's stop condition** | Step 1 — the flip reaches only two surfaces, both outside scope, one a provable regression against the task's own "samples stay visible in list grids" constraint. Reported rather than widened, exactly as instructed |
| 5 | Mount `ConvertSampleRecord` on drivers and clients, matching trucks; do not redesign | **IMPLEMENTED** | `bfeade6d` — both detail pages, same component, same props shape, same gating. `isSample` added to both PATCH schemas and both input types so the request has somewhere to land, documented write-false-only |
| 6 | A visible one-line reason in the picker when samples are excluded and any exist; report copy before implementing | **IMPLEMENTED** | Copy proposed and approved before any code: **"Sample records are hidden here. Convert one to use it."** Implemented verbatim in `sample-hidden-note.tsx`, gated on `hasHiddenSamples`, `role="note"`, in the picker, no modal |
| 7 | Report whether `loads` needs the same treatment | **IMPLEMENTED** | Step 7 — **yes**: `DispatchLoadsPanel` is a real load picker, invisible to 537's `findMany` grep because it is a client component. Handled by the opt-in param. Every other `carrierLoad.findMany` checked and confirmed not a picker |
| 8 | Integration test on real rows: sample truck, driver and client each excluded from a newly-filtered picker and present in the list grid; database-backed, not mocks | **IMPLEMENTED** | `57220a18` — 4 real-row cases + 8 source guards, 12/12 passing. Each entity has a sample AND a real row; each case asserts exclusion, presence, and that the flag survives. Nothing mocked |
| 9 | Test that a converted record appears in pickers immediately | **IMPLEMENTED** | `57220a18` — asserts hidden beforehand, converts all three, asserts present after with no intermediate step, asserts converted-not-duplicated, restores the fixture |

**8 of 9 IMPLEMENTED. 1 NOT DONE by instruction** — item 4, blocked by the brief's own stop
condition and reported rather than widened.

---

# Deviations and follow-ups

1. **Item 4 not executed** — the single deliberate omission, on the brief's own terms. Worth its
   own task: `excludeSamples` is now the only opt-in-default-off sample flag left, and the
   list-vs-picker split this task established is what makes it decidable.
2. **`carrier/loads/page.tsx` left unfiltered** — a display-only `clientMap`, not a picker.
3. **`/api/mobile/owner/drivers` left unfiltered** — it is the list screen. Asserted by the source
   guard so a future backfill cannot "fix" it.
4. **The absence note is on the four form pages and `DispatchLoadsPanel`, not on `trips/[id]`** —
   that page's pickers live inside an expenses panel and a truck-attach control that take no such
   prop today. Threading it there is cosmetic and was left out rather than done badly; stated
   rather than quietly skipped.
5. **`fuel` and `maintenance` were pulled into scope** — both are truck pickers using the shared
   endpoint. Including them was necessary for the cache-key split to be coherent; naming them here
   because the brief listed the mobile endpoints generically.
6. **NOT browser-verified, not pushed, not deployed.** Worth clicking: Create Load in a seeded
   tenant, confirming the sample client/driver/truck are absent and the note reads
   *"Sample records are hidden here. Convert one to use it."*, then converting one from its detail
   page and confirming it appears.

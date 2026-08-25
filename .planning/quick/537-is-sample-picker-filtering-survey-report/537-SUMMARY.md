# quick-537 — is_sample picker filtering (report-only) + closing the out-of-service verification

**Date:** 2026-08-25 · **Branch:** `feature/document-import` · **Baseline:** `90cb56aa`
**Commits:** `ca6a1f8f` (Part B test) · Part A changed nothing, by instruction.
**Not deployed, not pushed. NOT browser-verified.**

---

## Three corrections to the brief's survey, up front

The brief's diagnosis of SAMPLE-1 was right. Three of its supporting facts were not, and each
changes what the fix would have to cover.

| Brief said | Actually |
|---|---|
| "`is_sample` exists on exactly four tables: `carrier_drivers`, `carrier_trucks`, `clients`, `loads`. NOT on facilities." | **Eight tables.** Those four, plus `Customer`, `Load`, `Truck`, `User` — the legacy PascalCase schema. `facilities` confirmed absent. |
| "That org has 0 sample drivers and 0 sample clients, which is why only the truck picker showed the effect." | It has **1 of each**. Both are **soft-deleted** (`deleted_at` set June 2026), so `deleted_at` — not `is_sample` — is what removes them. SAMPLE-1 is the only row in that org where `is_sample` is the *sole* cause of absence, which is the sharper reason it was the only observable case. |
| Implied that hiding sample records from a picker might be "an accident of one query" | **Deliberate, ticketed, and user-facing** — TKT-0075/TKT-0076, with on-screen copy that promises it. The accident is the four pickers that *don't* filter. |

Verification for the second row:

```sql
SELECT 'driver', label, status, is_sample, deleted_at FROM carrier_drivers WHERE org_id='7e9eca25-…' AND is_sample
UNION ALL … ;
-- driver  Sample Driver 1   active  true  2026-06-17 04:10:22+00   ← soft-deleted
-- client  Sample Client 1   -       true  2026-06-17 01:30:07+00   ← soft-deleted
-- truck   SAMPLE-1          active  true  NULL                     ← is_sample is the ONLY reason
```

---

# PART A — is_sample filtering survey (REPORT ONLY, nothing changed)

## 1. Every query that filters on `is_sample`

Grep of `apps/web/src`, `apps/mobile`, `packages`, excluding `src/generated/` and `src/legacy/`.

### A. EXCLUDES samples (`isSample: false`) — the operational surfaces

| File | Line | Surface it feeds | Table |
|---|---|---|---|
| `lib/document-import/commit-service.ts` | 653 | **Import assignment screen — driver picker** | `carrier_drivers` |
| `lib/document-import/commit-service.ts` | 658 | **Import assignment screen — truck picker** ← *the SAMPLE-1 case* | `carrier_trucks` |
| `lib/document-import/resolution.ts` | 415 | Import client-resolution candidate list | `clients` |
| `app/(owner)/carrier/trips/new/page.tsx` | 24 | **New Trip — driver picker** | `carrier_drivers` |
| `app/(owner)/carrier/trips/new/page.tsx` | 29 | **New Trip — truck picker** | `carrier_trucks` |
| `lib/routes/assignable-drivers.ts` | 47 | Legacy Route driver picker (carrier side) | `carrier_drivers` |
| `lib/routes/assignable-drivers.ts` | 61 | Legacy Route driver picker (User side) | `User` |
| `lib/routes/assignable-drivers.ts` | 78 | Per-row assignability predicate | `User` |
| `app/(owner)/actions/drivers.ts` | 246 | Opt-in via `opts.excludeSamples` — **off by default** | `User` |
| `app/(admin)/actions/users.ts` | 42 | SysAdmin user list | `User` |
| `lib/carrier/trips.ts` | 631 | Loads attached to a trip | `loads` |
| `app/(owner)/carrier/trips/page.tsx` | 32 | "real load count" stat | `loads` |
| `app/(owner)/carrier/loads/page.tsx` (legacy `loads/page.tsx`) | 30 | Load count stat | `Load` |
| `app/(owner)/crm/page.tsx` | 32, 33, 34 | CRM count stats | `Customer` |
| `app/api/v1/carrier/dashboard/kpi/route.ts` | 36, 58 | Dashboard KPI aggregates | `loads` |
| `app/onboarding/welcome/page.tsx` | 29, 31 | Activation checklist ("have you added a real one yet") | `clients`, `loads` |

### B. INCLUDES / selects samples deliberately

| File | Line | Purpose |
|---|---|---|
| `app/(owner)/carrier/dashboard/page.tsx` | 32–35 | `isSample: true` ×4 — decides whether to show the banner |
| `lib/onboarding/seed-sample-data.ts` | 52, 65, 81, 102, 117, 173, 196, 213, 252 | The seeder; writes `isSample: true` |
| `.../fleet/trucks/_grid/columns.tsx` | 147 | `SamplePill` badge |
| `.../fleet/drivers/_grid/columns.tsx` | 123 | `SamplePill` badge |
| `.../clients/_grid/columns.tsx` | 55 | `SamplePill` badge |
| `.../loads/_grid/columns.tsx` | 46 | `SamplePill` badge |
| `api/v1/carrier/fleet/trucks/route.ts` | 97, 117 | `if (!carrierTruck.isSample)` — suppresses activation tracking for samples |
| `api/v1/carrier/clients/route.ts` | 107, 114 | same |
| `api/v1/carrier/fleet/trucks/[id]/route.ts` | 31 | PATCH accepts `isSample` — the **conversion** endpoint |
| `components/onboarding/convert-sample-record.tsx` | 33 | PATCHes `{ isSample: false }` |

### C. **Pickers that do NOT filter — the gap**

Every one of these feeds an assignment control and passes `where: { orgId, status: 'active' }`
with **no `isSample`** (and, on the client queries, no `deletedAt` either):

| File | Lines | Surface | Tables left unfiltered |
|---|---|---|---|
| `app/(owner)/carrier/loads/new/page.tsx` | 17, 22, 32 | **Create Load** — client, driver, truck pickers | `clients`, `carrier_drivers`, `carrier_trucks` |
| `app/(owner)/carrier/loads/[id]/page.tsx` | 33, 38, 49 | **Load detail** — reassign client/driver/truck | all three |
| `app/(owner)/carrier/templates/new/page.tsx` | 20, 25, 30 | **Create Route Template** | all three |
| `app/(owner)/carrier/templates/[id]/page.tsx` | 45, 50, 55 | **Edit Route Template** | all three |
| `app/(owner)/carrier/trips/[id]/page.tsx` | 179, 184 | **Trip detail** — expenses panel + `trucksForAttach` | `carrier_drivers`, `carrier_trucks` |
| `app/(owner)/carrier/loads/page.tsx` | 14 | Loads list client filter | `clients` |
| `api/mobile/owner/drivers/route.ts` | 65 | Mobile owner driver list (`tx.user`, legacy) | `User` |
| `api/mobile/owner/trucks/route.ts` | 147 | Mobile owner truck list (`tx.truck`, legacy) | `Truck` |

**Not defects** (checked and excluded from the above): `trips/page.tsx:20,25` builds
`driverMap`/`truckMap` — display-only label lookups. Filtering there would render "Unknown
Driver" on a trip that legitimately has a sample assigned. `fleet-trucks.ts` /
`fleet-drivers.ts` / `clients.ts` are the management grids, which are *supposed* to show samples
(that is where `SamplePill` renders).

## 2. Is the filtering consistent? **No. And the axis of inconsistency is the surface, not the table.**

The brief asked specifically whether a picker filters sample trucks but not sample drivers. It
does not — **the split is per page, and each page is internally consistent.**

| Surface | client | driver | truck |
|---|:--:|:--:|:--:|
| Import assignment screen (Phase 8) | n/a | ✅ | ✅ |
| New Trip | n/a | ✅ | ✅ |
| Import client resolution | ✅ | n/a | n/a |
| Legacy Route driver picker | n/a | ✅ | n/a |
| **Create Load** | ❌ | ❌ | ❌ |
| **Load detail** | ❌ | ❌ | ❌ |
| **Create Route Template** | ❌ | ❌ | ❌ |
| **Edit Route Template** | ❌ | ❌ | ❌ |
| **Trip detail** (expenses / attach truck) | n/a | ❌ | ❌ |
| **Mobile owner drivers / trucks** | n/a | ❌ | ❌ |

**Sharpest single instance:** `carrier/trips/new/page.tsx` filters, with an explicit comment
citing the ticket —

```ts
// Excluding is_sample keeps seeded demo records out of operational dropdowns
// (TKT-0076); deletedAt guards against soft-deleted rows lingering.
where: { orgId, status: 'active', isSample: false, deletedAt: null },
```

— while `carrier/trips/[id]/page.tsx`, the **same feature one route segment away**, does not:

```ts
// Fetch all active drivers and trucks for the expenses panel
where: { orgId, status: 'active' },
```

So TKT-0076 was applied to the surfaces that existed when it was written and never backfilled.
Phase 8's import screen got it because it was built after, and by someone who copied the trips/new
pattern.

**Two further asymmetries, both user-visible:**

1. **`SamplePill` renders on all four carrier grids; `ConvertSampleRecord` is mounted on TRUCKS
   ONLY** (`fleet/trucks/[id]/page.tsx:174` — the sole call site). A sample **driver** or
   **client** therefore shows a SAMPLE badge, is hidden from the pickers that do filter, and has
   **no way to be converted**. The component's own copy promises otherwise: *"Convert it to a
   real record to keep and use it."* Database-wide that traps **26 sample drivers** with no
   escape hatch.
2. **`excludeSamples` is opt-in and default-off** (`actions/drivers.ts:246`
   `...(opts?.excludeSamples ? { isSample: false } : {})`) — the inverse of every other site,
   where exclusion is the hard-coded default.

## 3. What the banner implies, and is picker-hiding deliberate?

**Deliberate design, incompletely rolled out.** Not an accident of one query — the opposite.

The banner (`components/onboarding/sample-data-banner.tsx:31`) reads *"These are sample records
to help you explore. Add your own to get started."* It appears only when
`Tenant.sampleDataSeeded` is true **and** at least one `isSample` row still exists across the
four carrier tables (`carrier/dashboard/page.tsx:29–39`), so it disappears on its own once the
samples are converted or deleted. It is dismissible per-session via `sessionStorage`.

Its implication is *explorable, not operational* — and the product states that explicitly rather
than leaving it to inference. `ConvertSampleRecord`'s doc comment:

> Explains, on a seeded sample record's detail page, why it carries the SAMPLE badge and lets the
> user promote it to a real record (clears is_sample). Answers TKT-0075 ("why does this show as
> sample? how to change it to normal"). **Once converted, the record drops the SAMPLE badge and
> reappears in the operational pickers that hide sample data (TKT-0076).**

and its on-screen copy:

> This is a **sample truck** created to help you explore. **It's hidden from operational pickers.**
> Convert it to a real record to keep and use it.

So there is a named ticket, a documented intent, a user-facing explanation of the hiding, and a
first-class escape hatch. **The truck picker's behaviour is correct and SAMPLE-1's absence is
working as designed.** The defect is the inverse: the four pickers in §1C that let a sample record
onto a real dispatch, and the missing Convert button on drivers and clients.

**One honest gap in the design as shipped:** the *picker* is silent. A dispatcher looking for
SAMPLE-1 in the Truck picker sees no row and no explanation — the same complaint that produced
quick-536's Finding 1, and the reason that finding was believable. The explanation exists only on
the record's own detail page, which is not where the user is standing when they miss it.

## 4. Is `facilities` lacking the column deliberate or an omission?

**Neither, today — the concept has no instances.** `lib/onboarding/seed-sample-data.ts` contains
**zero** facility creates (`grep -c Facility` → `0`). It seeds carrier trucks, clients, users,
drivers and loads, plus their legacy twins. The sample load it creates is a stub with no
itinerary:

```ts
tx.carrierLoad.create({ data: {
  orgId: tenantId, clientId: sampleClients[0].id, loadType: 'ftl',
  status: index === 0 ? 'delivered' : 'in_transit',
  referenceNumber: `SAMPLE-${index + 1}`, isSample: true,
}})
```

No stops, no facility references. So there has never been a sample facility to mark, and the
column would have no rows.

**Confirmed against production** — facility counts per seeded tenant do not track sample counts;
several seeded orgs have `facilities = 0` and the rest have counts that match real usage
(2, 3, 4, and 24 for the main org), never the seeder's fixed 1/3 shape:

```
org a802496e…  seeded  s_trucks 3  s_drivers 3  s_clients 2  s_loads 3  facilities 0
org c0c88679…  seeded  s_trucks 3  s_drivers 3  s_clients 2  s_loads 3  facilities 3
org 7e9eca25…  seeded  s_trucks 1  s_drivers 1  s_clients 1  s_loads 2  facilities 24
```

**It becomes a real omission the moment the seeder gains a facility**, which it must if sample
loads are ever given stops — a sample load with an itinerary needs somewhere to go. At that point
sample facilities would be indistinguishable from real ones exactly as the brief fears, and worse
than the other four tables, because Phase 4's ladder *learns* from facilities: a sample facility
would acquire `facility_external_references` and start silently auto-linking real manifests at T1
and T2. **Recorded as the pre-condition to watch, not a change made** — adding the column is DDL
and explicitly out of scope.

## Part A verdict

Nothing changed. **Zero behaviour changes to `is_sample` handling**, per instruction — confirmed
by the diff: `ca6a1f8f` touches one new test file and nothing else.

The product decision the brief reserved for itself is: **should the four unfiltered pickers be
brought in line with TKT-0076, or should TKT-0076 be reconsidered?** The evidence points at the
former — the intent is documented, ticketed and promised to the user in on-screen copy — but two
things should be fixed alongside it or the change makes the trap worse:

1. `ConvertSampleRecord` on drivers and clients (26 sample drivers currently have no way out).
2. Something in the *picker* that says why a record is missing, since the current silence is what
   made this look like a bug twice.

---

# PART B — Closing the out-of-service verification

## 5 & 6. The test

**`apps/web/tests/carrier/document-import-commit-out-of-service.test.ts`** — commit `ca6a1f8f`.

```
 ✓ tests/carrier/document-import-commit-out-of-service.test.ts (3 tests) 17480ms
   ✓ returns the out-of-service truck from the assignment picker, flagged and blocked  2180ms
   ✓ answers 422 with a structured block code and creates no trip                      8070ms
   ✓ stops blocking once the same truck returns to service                             2605ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
```

Nothing is mocked — no `vi.mock`, `vi.fn` or `vi.spyOn` in the file. `getCommitPreview` and
`handleCommitImport` run for real against a real connection over a disposable tenant.

**The fixture is a `flatbed` on purpose.** The production out-of-service truck is a flatbed, and
`flatbed` is one of the three tractor types quick-536 removed from `TRAILER_TYPES`. Both defects
sat on the same row, so the same fixture now guards both: repopulate that set and this suite goes
red.

**Item 5 — the picker OFFERS it:**

```ts
const oos = truckOption(view, OOS_UNIT);
expect(oos).toBeDefined();                                  // ← what the quick-536 fix bought
expect(oos.id).toBe(oosTruckId);
expect(view.trailers.some((t) => t.unitNumber === OOS_UNIT)).toBe(false);
expect(view.trailers).toHaveLength(0);

expect(oos.blocked).toBe(true);
expect(oos.complianceFlags).toContain('Out of service');
expect(oos.status).toBe('out_of_service');

// A healthy truck of the SAME truck_type is not blocked, so `blocked` tracks
// status rather than being stuck on for this fixture.
expect(healthy.blocked).toBe(false);
expect(healthy.complianceFlags).toEqual([]);

const oosBlock = blocks.find((b) => b.code === 'TRUCK_OUT_OF_SERVICE');
expect(oosBlock.message).toContain(OOS_UNIT);
expect(oosBlock.message).toBe(`Truck ${OOS_UNIT} is out of service`);
expect(view.validation.canCommit).toBe(false);
expect(view.validation.blockedReason).toBe(blocks[0].message);
```

**Item 6 — the server refuses it:**

```ts
const res = await handleCommitImport(tenantId, userId, importId, { …, truckId: oosTruckId, … }, null);
expect(res.status).toBe(422);
expect(data.ok).toBe(false);
expect(data.reason).toBe('BLOCKED');
expect(codes).toContain('TRUCK_OUT_OF_SERVICE');
expect(blocks.find(b => b.code === 'TRUCK_OUT_OF_SERVICE').message).toBe(`Truck ${OOS_UNIT} is out of service`);
expect(data.validation.canCommit).toBe(false);
```

The route contributes nothing to the status but auth and serialisation — its whole POST body
after the session check is `handleCommitImport(...)` then
`NextResponse.json(result.body, { status: result.status })` — so `res.status` **is** the HTTP
status. Testing the handler tests the endpoint's answer without standing up a server and a
Supabase session, which would be testing the auth stack.

**Zero row delta, read back off the database — both as a delta and as an absolute:**

```ts
expect(after.trips).toBe(before.trips);   expect(after.trips).toBe(0);
expect(after.stops).toBe(before.stops);   expect(after.stops).toBe(0);
expect(after.loads).toBe(before.loads);   expect(after.loads).toBe(0);
expect(after.documents).toBe(before.documents); expect(after.documents).toBe(0);
expect(after.importStatus).toBe('READY'); // a blocked commit is not an attempted commit
```

### The finding that came out of writing it: **"writes nothing" is not literally true**

The first run failed on `expected 2 to be +0`. **`commitImport` runs the four pre-transaction
mutation boundaries (`ensureAllCommitted`, `commit-service.ts:800`) BEFORE it validates**, so a
*refused* commit has already written 2 `facility_external_references` rows — one per consignment
carrying an external code.

That is deliberate, and is the same behaviour the rollback suite documents: those are decisions
the dispatcher already saw on screen, and un-learning a facility mapping because a truck turned
out to be in the shop would be the wrong trade. It is also definitely the POST's doing —
`getCommitPreview` does **not** call `ensureAllCommitted`; only `commitImport` does, so the picker
call in the previous case cannot account for it.

**The assertion was sharpened rather than relaxed to match.** The suite now asserts the exact
count, and then issues a **second refused POST** requiring the count not to move — proving it is a
one-time learning write and not per-attempt accumulation, which is the failure mode that would
actually matter (a dispatcher retrying a blocked commit inflating a reference table):

```ts
expect(before.externalRefs).toBe(0);
expect(after.externalRefs).toBe(2);
const second = await handleCommitImport(…);      // same refused request again
expect(second.status).toBe(422);
expect(afterSecond.externalRefs).toBe(after.externalRefs);   // ← does not grow
```

The test's name was changed from "writes nothing" to **"creates no trip"** so the name does not
claim more than the assertions do.

### Vacuity probe

Replacing the condition at `commit.ts:337` with `if (false)`:

```
 × returns the out-of-service truck from the assignment picker, flagged and blocked
 × answers 422 with a structured block code and creates no trip
 × stops blocking once the same truck returns to service

AssertionError: expected undefined to be defined
AssertionError: expected 200 to be 422 // Object.is equality
AssertionError: expected true to be false // Object.is equality

 Tests  3 failed (3)
```

`expected 200 to be 422` is the one that matters — with the block removed the endpoint *commits
the trip*, which is precisely the outcome this suite exists to prevent. Restored;
`git diff --quiet src/lib/document-import/commit.ts` → identical to HEAD, suite green again.

The suite also carries its own built-in control (case 3): the same truck returned to service stops
blocking and `canCommit` goes true, so "everything is blocked" cannot pass either.

## 7. The exact block strings, beside their siblings

All from `src/lib/document-import/commit.ts`. The block is
`{ code, message, severity: 'BLOCK' }`; `blockedReason` is `blocks[0].message`.

| Code | Line | Message template | Rendered example |
|---|---|---|---|
| **`TRUCK_OUT_OF_SERVICE`** | **338** | **`` `Truck ${truck.unitNumber} is out of service` ``** | **`Truck Qqq is out of service`** |
| `TRUCK_OUT_OF_SERVICE` | 340 | `` `Truck ${truck.unitNumber} is in the shop` `` | `Truck Qqq is in the shop` |
| `TRUCK_OUT_OF_SERVICE` | 342 | `` `Truck ${truck.unitNumber} is inactive` `` | `Truck TX-1006 is inactive` |
| `TRUCK_INSPECTION_OVERDUE` | 352 | `` `Truck ${unitNumber}'s registration expired on ${fmtDate(...)}` `` | `Truck TRK-001's registration expired on 14 Mar 2027` |
| `TRUCK_INSPECTION_OVERDUE` | 361 | `` `Truck ${unitNumber}'s insurance expired on ${fmtDate(...)}` `` | `Truck TRK-001's insurance expired on 1 Aug 2026` |
| `LICENCE_EXPIRED` | 316 | `` `${driver.name}'s CDL expired on ${fmtDate(driver.cdlExpiry)}` `` | `Dana Okoro's CDL expired on 12 Jul 2026` |
| `MEDICAL_EXPIRED` | 327 | `` `${driver.name}'s medical certificate expired on ${fmtDate(...)}` `` | `Dana Okoro's medical certificate expired on 3 Jun 2026` |
| `DRIVER_OVERLAP` | 286 | `` `${driver.name} is already on a trip that day (departs ${fmtTime(...)})` `` | `Dana Okoro is already on a trip that day (departs 06:00)` |
| `TRUCK_OVERLAP` | 298 | `` `Truck ${unitNumber} is already on a trip that day (departs ${fmtTime(...)})` `` | `Truck TRK-001 is already on a trip that day (departs 06:00)` |
| `NO_DRIVER` | 264 | `Pick a driver for this trip` | — |
| `NO_TRUCK` | 265 | `Pick a truck for this trip` | — |
| `NO_START_TIME` | 267 | `Set a planned start time` | — |
| `STOPS_NOT_READY` | 277 | `issue.message` (from stop review) | — |

**Consistency verdict — good, with one wrinkle worth a decision.**

Consistent: every compliance and overlap block **names the subject first** (`Truck X…`,
`Dana Okoro…`), states the condition in plain present tense, and adds the *date or time that makes
it actionable* where one exists. Trucks are prefixed with the literal word `Truck`; drivers use
the bare name, which reads correctly because a person's name needs no noun. All are sentence-case
with no terminal full stop — right for a single line under a button. The missing-input blocks are
deliberately imperative (`Pick a driver…`) rather than declarative, and sort first, so the sentence
under a disabled button is the most actionable one.

**The wrinkle:** `TRUCK_OUT_OF_SERVICE` is **one code carrying three different conditions** —
out of service, in the shop, and inactive. The messages distinguish them correctly for a human,
but a caller branching on the code cannot tell "in the shop" (temporary, wait for it) from
"inactive" (an administrative state, pick another truck). That mirrors `TRUCK_INSPECTION_OVERDUE`
covering both registration and insurance, which is documented in place as a deliberate mapping
because there is no `next_inspection_due` column. The status case has no such excuse —
`carrier_trucks.status` has three distinct values and they collapse into one code on the way out.
**Reported, not changed:** splitting it is an API-surface change to a structured code that clients
may already branch on, and this task's Part B was scoped to verification.

---

# Gates

## tsc — probed in both apps, demonstrably not blind

| App | Errors | Probe | Result |
|---|---|---|---|
| `apps/web` | **0** | `const __probe537: number = 'not-a-number'` appended to the new test file | `tests/carrier/document-import-commit-out-of-service.test.ts(653,7): error TS2322: Type 'string' is not assignable to type 'number'.` — the injected error, at the exact line, **and the only error**. Removed. |
| `apps/mobile` | **0** | same probe in `lib/api-with-queue.ts` | `lib/api-with-queue.ts(31,7): error TS2322: …` — likewise the only error. Restored via `git checkout --`. |

No `__probe*` files remain; `git status` clean.

## Full suite — diffed against the pre-task commit, not counted

| | Tests | Passed | Failed |
|---|---|---|---|
| Baseline `90cb56aa` | 1361 | 1237 | **66** |
| After `ca6a1f8f` | 1364 | 1240 | **66** |

```
NEWLY FAILING (regressions): 0
NO LONGER FAILING: 0
failure sets byte-identical: true
new tests added: 3
```

The 66 are the pre-existing workflow-engine failures, **proven** unchanged by set comparison
rather than asserted. +3 is exactly this task's additions.

**Worktree method:** created at `<repo>/.baseline-537` (inside the root, so Node resolution walks
up to the hoisted `node_modules` — the `%TEMP%` placement fails, as established in quick-536).
**`git worktree remove --force` used, never `Remove-Item`.** It deregistered the worktree and
reported `Permission denied` on part of the tree; before clearing the 197-file residue it was
scanned for reparse points —
`Get-ChildItem -Recurse -Force -Attributes ReparsePoint` returned nothing, and `find -type l`
returned nothing — so it was a plain directory with no junction to follow. Cleared, then
`git worktree prune`. Main checkout verified after: **4,052 tracked files**, `git status` clean,
still on `feature/document-import`.

## Test-isolation discipline

`tests/isolation/setup.ts`'s contract, matching the three suites already in this family:

- Throwaway tenant named `ZZ-THROWAWAY-PHASE8-OOS-<stamp>`.
- `assertDisposable()` before every scoped write; explicit by-name refusal of
  `PROTECTED_TENANT_ID = 7e9eca25-1f97-46ed-9365-e67be49436d5`.
- `afterAll` deletes children-first, then **re-counts ten tables and throws** if anything survived.
- `describe.skip` when `DATABASE_URL` is unset.

**Verified independently of the suite's own check, after the final run:**

```sql
leftover_test_tenants   0
protected_trip          1     -- 53e002c8-… still present
protected_stops         6
protected_docs          6
protected_org_trucks   15     -- tenant 7e9eca25 untouched
oos_trucks              1     -- the one production out_of_service row, unchanged
```

No DDL. `is_sample` was **not** added to `facilities`. Every Supabase MCP call in this task was a
`SELECT`.

---

# Per-item audit

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Every query filtering on `is_sample` — file, surface, excludes/includes | **IMPLEMENTED** | Part A §1 — three tables: 16 excluding sites, 10 including/selecting sites, and an eighth-table correction (the column is on 8 tables, not 4). Non-defects called out separately so the list is not padded |
| 2 | Is filtering consistent across the tables that have the column; name any picker filtering trucks but not drivers | **IMPLEMENTED** | Part A §2 — **not consistent**, and the specific asymmetry asked about does **not** exist: the split is per-surface and each surface is internally consistent. 10-row matrix. Sharpest case is `trips/new` (filters, with a TKT-0076 comment) vs `trips/[id]` (does not) — same feature, one route segment apart. Two further asymmetries found: `ConvertSampleRecord` mounted on trucks only (26 sample drivers trapped), and `excludeSamples` being opt-in/default-off |
| 3 | What the banner implies about usability; is picker-hiding deliberate or an accident of one query | **IMPLEMENTED** | Part A §3 — **deliberate**, and the opposite of an accident: TKT-0075/TKT-0076, a doc comment that states the picker behaviour, and on-screen copy that promises it *"It's hidden from operational pickers. Convert it to a real record to keep and use it."* SAMPLE-1's absence is working as designed; the defect is the four pickers that don't filter. One honest gap named: the picker itself is silent, which is why this looked like a bug twice |
| 4 | Is `facilities` lacking the column deliberate or an omission | **IMPLEMENTED** | Part A §4 — neither today: the seeder creates **zero** facilities (`grep -c Facility` → 0) and its sample loads carry no stops, so no sample facility has ever existed. Confirmed against production (facility counts per seeded org do not track sample counts). Becomes a real omission the moment sample loads gain stops — and worse than the other four tables, because Phase 4's ladder *learns* from facilities and a sample one would start auto-linking real manifests at T1/T2 |
| — | Part A report-only, zero behaviour change | **HONOURED** | `ca6a1f8f` touches one new test file and nothing else. No `is_sample` query altered |
| 5 | Integration test: out-of-service truck RETURNED by the picker, `blocked = true`, block message names truck and reason. Real rows, disposable tenant, per `tests/isolation/setup.ts` | **IMPLEMENTED** | Part B §5, `ca6a1f8f` — 3 passed. Nothing mocked. Also asserts it is absent from the trailer list and that a healthy truck of the same `truck_type` is unblocked, so `blocked` tracks status not the fixture. Fixture is a `flatbed` so the quick-536 classification fix is guarded by the same test |
| 6 | Same block enforced server-side: POST returns 422 with a structured code and writes nothing; zero row delta from the DATABASE | **IMPLEMENTED — with a correction to the premise** | Part B §6 — 422, `reason: 'BLOCKED'`, code `TRUCK_OUT_OF_SERVICE`, zero trips/stops/loads/documents as both delta and absolute, import still READY. **"Writes nothing" is not literally true:** a refused commit writes 2 `facility_external_references`, because `ensureAllCommitted` runs before validation. Deliberate, and the assertion was sharpened rather than relaxed — exact count asserted, plus a second refused POST proving the write does not accumulate. Test renamed to "creates no trip" so the name does not overclaim |
| 7 | Report the block's exact code and message string for comparison against expired-CDL and overlap | **IMPLEMENTED** | Part B §7 — 13-row table of every block with template and rendered example. Verdict: wording is consistent (subject first, plain present tense, actionable date/time where one exists, imperative for missing input and sorted first). One wrinkle reported not changed: `TRUCK_OUT_OF_SERVICE` carries three distinct conditions under one code, so a caller cannot distinguish "in the shop" from "inactive" |

**7 of 7 IMPLEMENTED. None partial, none skipped.**

---

# Deviations and things deliberately not done

1. **Item 6's "writes nothing" was corrected, not satisfied.** A refused commit does write facility
   external references. Reported with the mechanism, the justification, and a stronger assertion
   in its place.
2. **Three of the brief's survey facts were wrong** (column on 8 tables not 4; the org does have a
   sample driver and client, both soft-deleted; picker-hiding is deliberate rather than possibly
   accidental). All corrected with evidence rather than worked around.
3. **No `is_sample` behaviour changed**, per instruction — including the four unfiltered pickers,
   which are a real gap and are left for the product decision the brief reserved.
4. **`TRUCK_OUT_OF_SERVICE`'s three-conditions-one-code wrinkle reported, not fixed** — changing a
   structured code is an API-surface change and Part B was scoped to verification.
5. **`is_sample` not added to `facilities`** — DDL, explicitly out of scope. The pre-condition that
   would make it necessary is recorded instead.
6. **Not browser-verified, not deployed, not pushed.**

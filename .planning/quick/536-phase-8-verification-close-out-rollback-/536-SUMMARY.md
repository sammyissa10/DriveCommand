# quick-536 (brief's label: quick-535) — Phase 8 verification close-out

**Date:** 2026-08-25 · **Branch:** `feature/document-import` · **Baseline:** `0f6d037a`
**Commits:** `0ab06abe`, `50260000`, `1cf1edfc`, `83e40953`
**Not deployed, not pushed. NOT browser-verified.**

> **Numbering.** The brief calls this quick-535. `535` was already taken by
> `42b7c3b4 docs(quick-535): diagnose the CarrierFacility deletedBy error`, so GSD allocated
> **536**. Stated rather than silently renumbered.

---

## The headline

**Part C's premise was false, and Part C's finding was real.** Out-of-service trucks were never
filtered by `status`. They were being filed as *trailers* by `truck_type`. Two of the four items
in this task were answered by reading `pg_constraint` and `information_schema` rather than by
writing code, which is the third time this project has been bitten by inferring a column's
vocabulary instead of reading it (DEC-1, DEC-14, and now this).

---

# PART A — Rollback test audit (verify checks 1 and 2)

**Report only. No file under audit was modified; both probes were reverted and proven identical
to HEAD by `git diff --quiet`.**

## 1. The assertions, quoted in full

The suite is `apps/web/tests/carrier/document-import-commit-rollback.test.ts`. The forced-failure
cases are generated from one loop over six steps:

```ts
const STEPS: CommitStep[] = [
  'EXTERNAL_REFS', 'TRIP', 'STOPS', 'LOADS', 'DOCUMENTS', 'IMPORT_UPDATE',
];

for (const step of STEPS) {
  it(`rolls back completely when the transaction fails at ${step}`, async () => {
    await resetImport();

    const outcome = await commitImport(tenantId, userId, importId, ASSIGNMENT, null, {
      failAtStep: step,
    });

    // The service reports the failure honestly rather than pretending.
    expect(outcome.ok).toBe(false);
    if (!outcome.ok && outcome.reason === 'FAILED') {
      expect(outcome.failedStep).toBe(step);
      expect(outcome.message.length).toBeGreaterThan(0);
    } else {
      throw new Error(`expected a FAILED outcome at ${step}, got ${JSON.stringify(outcome)}`);
    }

    // ---- THE ASSERTIONS THAT MATTER. Real rows, counted after the fact. ----
    const after = await countRows();
    expect(after.trips).toBe(0);
    expect(after.stops).toBe(0);
    expect(after.loads).toBe(0);
    expect(after.documents).toBe(0);
    expect(after.externalRefs).toBe(0);

    // And the import is back in review, with the trip link never set.
    expect(after.importRow.status).toBe('NEEDS_REVIEW');
    expect(after.importRow.createdTripId).toBeNull();
    expect(after.importRow.committedAt).toBeNull();
    expect(after.importRow.failureCode).toBe(`COMMIT_${step}`);
  }, 60_000);
}
```

### The exact queries behind those counts

`countRows()` — every one a real query against a real table, inside an RLS-bypass transaction:

```ts
async function countRows() {
  return bypass(async (tx) => {
    const trips = await tx.trip.count({ where: { orgId: tenantId } });
    const stops = await tx.carrierStop.count({ where: { dispatch: { orgId: tenantId } } });
    const loads = await tx.carrierLoad.count({ where: { orgId: tenantId } });
    const documents = await tx.carrierDocument.count({ where: { dispatch: { orgId: tenantId } } });
    const externalRefs = await tx.facilityExternalReference.count({ where: { orgId: tenantId } });
    const importRow = await tx.documentImport.findUnique({
      where: { id: importId },
      select: { status: true, createdTripId: true, committedAt: true, failureCode: true },
    });
    return { trips, stops, loads, documents, externalRefs, importRow };
  });
}
```

So, **per forced-failure case, the query issued and the count asserted** — the same five row
counts fire in all six cases, because rollback is all-or-nothing and a step-specific expectation
would be weaker, not stronger:

| Case | Query | Asserted |
|---|---|---|
| every step | `trip.count({ where: { orgId } })` | `0` |
| every step | `carrierStop.count({ where: { dispatch: { orgId } } })` | `0` |
| every step | `carrierLoad.count({ where: { orgId } })` | `0` |
| every step | `carrierDocument.count({ where: { dispatch: { orgId } } })` | `0` |
| every step | `facilityExternalReference.count({ where: { orgId } })` | `0` |
| every step | `documentImport.findUnique({ where: { id: importId } })` | `status='NEEDS_REVIEW'`, `createdTripId=null`, `committedAt=null`, `failureCode='COMMIT_<step>'` |

What *differs* per case is what each step would have stranded had rollback failed, and the suite's
own header enumerates it: EXTERNAL_REFS a `facility_external_references` row; TRIP a `dispatches`
row; STOPS a trip plus its stops; LOADS a trip, stops and a load; DOCUMENTS all of those plus
documents; IMPORT_UPDATE all of it plus the import flipped to COMMITTED.

### The control case

```ts
it('writes the trip, its stops, its load and its documents when nothing fails', async () => {
  await resetImport();
  const outcome = await commitImport(tenantId, userId, importId, ASSIGNMENT, null);
  if (!outcome.ok) throw new Error(`expected a successful commit, got ${JSON.stringify(outcome)}`);

  const after = await countRows();
  expect(after.trips).toBe(1);
  expect(after.stops).toBe(2);          // two consignments, end stop policy NONE
  expect(after.loads).toBe(1);
  expect(after.documents).toBe(3);      // one trip-level source file + one page slice per stop
  expect(after.externalRefs).toBe(2);   // both consignments carry an external code

  expect(after.importRow.status).toBe('COMMITTED');
  expect(after.importRow.createdTripId).toBe(outcome.tripId);
  expect(after.importRow.committedAt).not.toBeNull();
  // …then sequence order [1,2], page slices [0] and [1], isEndStop false on both,
  // podRequired/bolRequired per stop, pieces 10/12, weight 800/900, load ltl with
  // 22 pieces and 1700 lbs, clientId, and each stop document's fileUrl matching /-p[01]\.png$/
});
```

## 2. How each case would FAIL if rollback were broken

The mechanism is the same in every case, so the concrete message differs only in which count
moves first. Taking `failAtStep: 'STOPS'` as the worked example: by the time the tripwire fires,
step 2 has already issued `INSERT INTO dispatches`. If someone moved trip creation outside
`$transaction`, wrapped a step in a `try/catch` that continued, or replaced the transaction with a
plain sequence of `await`s, that INSERT survives the throw.

| Forced step | First assertion to fail | Concrete expected-vs-actual |
|---|---|---|
| `EXTERNAL_REFS` | `expect(after.externalRefs).toBe(0)` | `AssertionError: expected 2 to be +0` |
| `TRIP` | `expect(after.trips).toBe(0)` | `AssertionError: expected 1 to be +0` |
| `STOPS` | `expect(after.trips).toBe(0)` | `AssertionError: expected 1 to be +0` (then `after.stops` `expected 2 to be +0`) |
| `LOADS` | `expect(after.trips).toBe(0)` | `AssertionError: expected 1 to be +0` (then stops `2`, loads `1`) |
| `DOCUMENTS` | `expect(after.trips).toBe(0)` | `AssertionError: expected 1 to be +0` (then stops `2`, loads `1`, documents `3`) |
| `IMPORT_UPDATE` | `expect(after.trips).toBe(0)` | `AssertionError: expected 1 to be +0`, and `after.importRow.status` `expected 'COMMITTED' to be 'NEEDS_REVIEW'` |

A second, independent failure mode covers "the service lies about what happened": if the throw
were swallowed and the commit reported success, `expect(outcome.ok).toBe(false)` fails with
`expected true to be false` before any row is counted. The observed shape of that message is
confirmed by probe 2 below, which produced exactly `expected true to be false` at line 574.

## 3. Does any assertion inspect a mock, spy, or stubbed client?

**No. Verified by reading every `expect(` in the file.** There is no `vi.mock`, no `vi.fn`, no
`vi.spyOn` and no stub anywhere in it. Every assertion resolves to one of:

- a `count()` / `findMany()` / `findUnique()` against the real Prisma client over a real Postgres
  connection (`countRows`, and the `detail` block in the control case), or
- a field of `CommitOutcome`, the real return value of the real `commitImport`.

The single injected thing is `opts.failAtStep`, which makes the *service* throw at a named point
— it is not a mock of the database, and every query before the injected throw really executes
inside the real transaction, which is what makes the counts afterwards mean anything. The suite's
own header states this and the code matches the claim.

Two supporting details worth recording because they are the usual way a "real DB test" turns out
not to be one:

- Both `prisma` and `commitImport` are **dynamically** imported, after a hand-rolled `.env.local`
  loader runs. A static import would be hoisted above the loader and pin an undefined connection
  string, and the suite would skip silently on a machine that has a perfectly good `DATABASE_URL`
  in the file next to it.
- The client is the **app's** singleton, not `new PrismaClient()`. Prisma 7 here runs on a driver
  adapter, so a bare constructor throws — which is incidental proof that
  `tests/isolation/setup.ts`'s bare constructor has not run in a long time.

## 4. The real output

```
 ✓ tests/carrier/document-import-commit-rollback.test.ts > … > starts from a clean database for this tenant
 ✓ … > rolls back completely when the transaction fails at EXTERNAL_REFS
 ✓ … > rolls back completely when the transaction fails at TRIP
 ✓ … > rolls back completely when the transaction fails at STOPS
 ✓ … > rolls back completely when the transaction fails at LOADS       4972ms
 ✓ … > rolls back completely when the transaction fails at DOCUMENTS   5549ms
 ✓ … > rolls back completely when the transaction fails at IMPORT_UPDATE 5330ms
 ✓ … > writes the trip, its stops, its load and its documents when nothing fails 5777ms
 ✓ … > refuses a direct call that names a driver with an expired licence 8343ms

 Test Files  1 passed (1)
      Tests  9 passed (9)
   Duration  56.70s
```

Each forced case logs its rollback through the real error path, e.g.:

```
ERROR: [document-import] commit failed — rolled back
{"importId":"513bfb28-…","step":"DOCUMENTS","err":{"stack":"Error: Injected failure at DOCUMENTS
    at tripwire (…/commit-service.ts:287:37)
    at db.$transaction.timeout (…/commit-service.ts:986:9)
    at Proxy._transactionWithCallback (…/generated/prisma/runtime/client.js:79:4390)
    at commitImport (…/commit-service.ts:774:20)","message":"Injected failure at DOCUMENTS",
    "name":"Error"}}
```

— the throw really does leave the transaction callback and really is caught outside it.

## 5. Anti-vacuity control — **two** probes, both reverted

### Probe 1 — empty `commitImport`'s body (the brief's ask)

```ts
): Promise<CommitOutcome> {
  // ANTI-VACUITY PROBE (quick-536) — TEMPORARY
  return { ok: false, reason: 'FAILED', message: 'probe', failedStep: 'TRIP' };
  const initial = await getImportRecord(orgId, importId, userId);
```

**RED:**
```
 FAIL  tests/carrier/document-import-commit-rollback.test.ts > Phase 8 commit — atomic rollback…
Error: warm-up should have been BLOCKED, got {"ok":false,"reason":"FAILED","message":"probe","failedStep":"TRIP"}
 Test Files  1 failed (1)
      Tests  9 skipped (9)
```

The suite goes red, but it dies in `beforeAll`'s warm-up guard and skips all nine cases — so it
proves the file is not vacuous without ever exercising a row assertion. **Recorded as a weaker
result than it looks**, and the reason a second probe was run rather than stopping here.

### Probe 2 — gut only the transaction, so the warm-up still passes

```ts
    // ANTI-VACUITY PROBE 2 (quick-536) — TEMPORARY: the transaction never runs.
    return { ok: true, tripId: '00000000-…', stopCount: 0, loadCount: 0, documentCount: 0, warnings: [] };
    const result = await db.$transaction(
```

**RED, on the assertions themselves:**
```
     ✓ starts from a clean database for this tenant                    686ms
     × rolls back completely when the transaction fails at EXTERNAL_REFS
     × rolls back completely when the transaction fails at TRIP
     × rolls back completely when the transaction fails at STOPS
     × rolls back completely when the transaction fails at LOADS
     × rolls back completely when the transaction fails at DOCUMENTS
     × rolls back completely when the transaction fails at IMPORT_UPDATE
     × writes the trip, its stops, its load and its documents when nothing fails
     × refuses a direct call that names a driver with an expired licence

AssertionError: expected true to be false // Object.is equality      ← the six forced cases
AssertionError: expected +0 to be 1      // Object.is equality      ← THE CONTROL CASE
AssertionError: expected false to be true

 Test Files  1 failed (1)
      Tests  8 failed | 1 passed (9)
```

`expected +0 to be 1` on the control is the exact message the suite's own header promises. The
one passing test is "starts from a clean database", which is *supposed* to pass on an empty
tenant.

### Restored, and proven restored

```
$ git diff --quiet src/lib/document-import/commit-service.ts && echo "FILE IDENTICAL TO HEAD"
FILE IDENTICAL TO HEAD

 Test Files  1 passed (1)
      Tests  9 passed (9)

$ git status --short
(no changes to any source file)
```

---

# PART B — Notification isolation (verify check 5)

## 6. A failing notification cannot roll back a committed trip

New suite: **`apps/web/tests/carrier/document-import-commit-notification-isolation.test.ts`**.

`sendDispatchAssignedNotification` is replaced with a function that rejects with a named error.
**That mock is the injection, not the evidence** — the same role `failAtStep` plays in the
rollback suite. Every assertion that decides the result is a query against a real table:

```ts
const outcome = await commitImport(tenantId, userId, importId, ASSIGNMENT, null);
expect(outcome.ok).toBe(true);

// Let the detached afterResponse fallback actually run and reject, so this is not
// passing merely because the throw had not happened yet.
await new Promise((r) => setTimeout(r, 250));
expect(notif.calls).toBe(1);
expect(notif.lastErrorName).toBe('ForcedNotificationFailure');

// ---- THE ASSERTIONS THAT MATTER. Real rows, counted after the fact. ----
const after = await countRows();
expect(after.trips).toBe(1);
expect(after.stops).toBe(2);
expect(after.loads).toBe(1);
expect(after.documents).toBe(3);
expect(after.importRow.status).toBe('COMMITTED');
expect(after.importRow.createdTripId).toBe(outcome.tripId);
expect(after.importRow.committedAt).not.toBeNull();
expect(after.importRow.failureCode).toBeNull();

// …and the rows are the real thing, not empty shells
expect(detail.map((s) => s.sequenceOrder)).toEqual([1, 2]);
expect(detail[0].pageNumbers).toEqual([0]);
expect(detail[1].pageNumbers).toEqual([1]);
expect(detail.every((s) => s.facilityId !== null)).toBe(true);
```

A **control case** runs the identical commit with the notification succeeding and asserts
identical counts, so the suite cannot pass vacuously and cannot pass on a notification that was
never wired up at all.

```
 ✓ tests/carrier/document-import-commit-notification-isolation.test.ts (2 tests) 18947ms
   ✓ commits the trip, its stops, its load and its documents though the notification throws  8142ms
   ✓ writes exactly the same rows when the notification succeeds                             6443ms

 Test Files  1 passed (1)
      Tests  2 passed (2)
```

**How it would fail if the notification were inside the transaction:** the rejection would reach
`commitImport`'s catch, which rolls the import to NEEDS_REVIEW and returns
`{ ok: false, reason: 'FAILED' }`. `expect(outcome.ok).toBe(true)` fails with
`expected false to be true`, and behind it `after.trips` `expected +0 to be 1`, `after.stops`
`expected +0 to be 2`, `after.documents` `expected +0 to be 3`.

## 7. Is the failure logged with its name and message, or swallowed into a generic string?

**It was swallowed into a generic string. Found, then fixed.**

The live run captured this before any change:

```
ERROR: sendDispatchAssignedNotification: failed Error: [object Object]
    at Object.error (…/src/lib/logger.ts:52:55)
    at sendDispatchAssignedNotification (…/src/lib/carrier/notifications.ts:210:12)
```

The cause — `logger.error(message, error, context)`, and the **context** was passed in the
**error** slot:

```ts
logger.error('sendDispatchAssignedNotification: failed', {
  orgId, dispatchId, driverId, error: err,
});
```

`logger.ts:52` does `error instanceof Error ? error : new Error(String(error ?? message))`, so the
context object became `Error: [object Object]`, and **that** is what went to
`Sentry.captureException` — name, message and stack destroyed, and every notification failure in
production collapsed into one indistinguishable Sentry group. The `error: err` copy inside the
context did not save it either: `JSON.stringify(new Error(...))` is `{}`, so it printed as
`"error":{}`. **Both copies of the error were lost.** This is DEC-11 §3, and it is the exact bug
`commit-service.ts`'s own `afterResponse` guard documents and avoids — but the guard never runs
for this function, because `sendDispatchAssignedNotification` catches internally and never
rethrows.

Fixed in `50260000`; the same live path now logs:

```
ERROR: sendDispatchAssignedNotification: failed
{"orgId":"415f7ead-…","dispatchId":"16ed3965-…","driverId":"e7401f5c-…","err":{
 "stack":"Error: `headers` was called outside a request scope…
    at getTenantId (…/src/lib/context/tenant-context.ts:12:29)
    at requireTenantId (…/src/lib/context/tenant-context.ts:21:26)
    at getTenantPrisma (…/src/lib/context/tenant-context.ts:48:26)",
 "message":"`headers` was called outside a request scope…","__NEXT_ERROR_CODE":"E251","name":"Error"}}
```

**With the real error visible, a residual finding is legible for the first time and is reported,
not fixed:** `sendDispatchAssignedNotification` reaches `getTenantPrisma()` — the *header-reading*
variant — which throws `E251` outside a request scope. Under a real HTTP request the store is
present and this works, which is why the browser verification saw no problem. It does mean **the
real notification path can never be exercised from a test, a script or a cron handler**, and it is
pre-existing behaviour of `notifications.ts` rather than anything Phase 8 introduced. The
commit-service side is already correct here — it uses `getTenantPrismaForOrg(orgId, userId)` per
DEC-11.

The `after()` path is also confirmed working end to end. The forced rejection is caught by
`afterResponse`'s guard and logged with full fidelity:

```
ERROR: [document-import] driver notification failed
{"importId":"57698f60-…","err":{"stack":"ForcedNotificationFailure: ZZ-FORCED: push service unreachable
    at sendDispatchAssignedNotification (…/notification-isolation.test.ts:88:21)
    at …/commit-service.ts:1156:13
    at guarded (…/commit-service.ts:262:13)
    at afterResponse (…/commit-service.ts:281:10)
    at commitImport (…/commit-service.ts:1155:5)",
 "message":"ZZ-FORCED: push service unreachable","name":"ForcedNotificationFailure"}}
```

---

# PART C — Finding 1: out-of-service trucks

## 8. Where the filter is applied, and why out_of_service diverges from inactive

**It does not diverge, and there is no status filter.** The brief's premise is falsified; the
finding it came from is real and has a different cause.

Read in `apps/web/src/lib/document-import/commit-service.ts`:

```ts
db.carrierTruck.findMany({
  where: { orgId, deletedAt: null, isSample: false },   // ← no status predicate
  select: { id, unitNumber, displayName, truckType, status,
            registrationExpiry, insuranceExpiry },
  orderBy: { unitNumber: 'asc' },
})
```

and `toTruckOption` already gives out-of-service exactly the treatment the brief asked for:

```ts
if (t.status === 'out_of_service') { flags.push('Out of service'); blocked = true; }
else if (t.status === 'maintenance') { flags.push('In the shop'); blocked = true; }
else if (t.status === 'inactive')    { flags.push('Inactive');    blocked = true; }
```

The divergence was in `truck_type`, one line further down:

```ts
trucks:   truckRows.filter((t) => !TRAILER_TYPES.has(t.truckType)).map(toTruckOption),
trailers: truckRows.filter((t) =>  TRAILER_TYPES.has(t.truckType)).map(toTruckOption),
```

`TRAILER_TYPES` was `{ trailer, reefer, flatbed, dry_van, tanker, step_deck }`. Read off
`pg_constraint`:

```
carrier_trucks_truck_type_check
  CHECK (truck_type = ANY (ARRAY['semi','box_truck','flatbed','reefer','tanker','day_cab',
                                 'straight_truck','cargo_van','sprinter_van','pickup','car']))
```

**Every admissible value is a power unit. None is a trailer.** All six entries were wrong, in two
distinct ways:

- `trailer`, `dry_van`, `step_deck` — **cannot exist on this table.** They are
  `route_templates.equipment_type`'s vocabulary (`dry_van|flatbed|reefer|tanker|step_deck|other`).
  The set was assembled from the wrong enum — the same class of mistake as DEC-1 and DEC-14.
- `flatbed`, `reefer`, `tanker` — ordinary **tractors**, filed as trailers because the word also
  names a trailer body style.

And the two facts met: the **only** `out_of_service` row in the entire database is a `flatbed`.

```sql
SELECT id, org_id, unit_number, truck_type, status FROM carrier_trucks WHERE status='out_of_service';
-- da285609-…  61c48b49-…  'Qqq'  flatbed  out_of_service   (1 row)
```

Two independent reasons it was invisible during verification, both now on the record: it is a
`flatbed`, so it rendered under **Trailer** rather than Truck; and it belongs to tenant
`61c48b49-…`, not the tenant that was browser-verified — which had **no** out-of-service truck at
all. Consistent with everything else the check saw: its `TX-1006` is `inactive` and appeared, and
its `TRK-001` has `insurance_expiry = 2026-08-01` (expired) and appeared flagged.

**The real user-visible defect is larger than the finding:** every flatbed, reefer and tanker
tractor in every fleet was missing from the Truck picker, out of service or not.

## 9. The change

```diff
-// `dispatches.trailer_id` points at `carrier_trucks`, so a trailer is a truck
-// row with a trailer-ish `truck_type`. Filtered here rather than by a second
-// table that does not exist.
-const TRAILER_TYPES = new Set(['trailer', 'reefer', 'flatbed', 'dry_van', 'tanker', 'step_deck']);
+/**
+ * Trailers cannot be told apart from tractors on `carrier_trucks` today.
+ * … [full rationale, the pg_constraint reading, and the reported gap] …
+ */
+export const TRAILER_TYPES = new Set<string>([]);
+
+/** `carrier_trucks_truck_type_check`, verbatim, read off `pg_constraint`. */
+export const CARRIER_TRUCK_TYPES = [
+  'semi', 'box_truck', 'flatbed', 'reefer', 'tanker', 'day_cab',
+  'straight_truck', 'cargo_van', 'sprinter_van', 'pickup', 'car',
+] as const;
```

An out-of-service truck is now **listed** (no status predicate, and no longer diverted by type),
**flagged** (`complianceFlags: ['Out of service']` → the `AlertTriangle` on `PickerRow`),
**selectable** (`PickerRow`'s `<button>` has no `disabled`), and **blocks the primary action with
its reason named** (`blocked: true` → `TRUCK_OUT_OF_SERVICE` block → `Create trip` disabled on
`!v.canCommit`, with `v.blockedReason` rendered under it: *"Truck Qqq is out of service"*).

**That is the expired-CDL driver's treatment exactly, and structurally so** — both rows are the
*same component*, `PickerRow`, receiving the same `blocked` prop and the same `complianceFlags`
join, and both blocks land in the same `validation.blocks` array read by the same footer line.

Nothing else changed. `blocked` rows were already selectable, the flag icon already existed, and
the named reason under the button was already there — the truck simply was not in the list to
receive any of it.

**The trailer picker is a reported gap, not a silent removal.** The set is empty, and stated as
empty, so the Trailer section (already conditional on `trailers.length > 0`) stops rendering.
`trailerId` still round-trips through `AssignmentInput` and still writes `dispatches.trailer_id`.
`0 of 301` dispatches have ever set it, so nothing in use is lost — and the picker it replaces was
offering tractors as trailers, which is worse than offering nothing. Restoring it needs a signal
the schema does not carry (an `is_trailer` column, or a trailer value in the CHECK); the constant
is the single place to change when one arrives.

Guardrail test `truck-picker-classification.test.ts` (3 cases) pins the invariant — **no
admissible `truck_type` may be classified as a trailer** — and imports the vocabulary from the
module rather than restating it, so the two cannot drift.

## 10. Does any other picker in this screen filter rather than flag?

**Yes, one: the driver picker.**

```ts
db.carrierDriver.findMany({
  where: { orgId, deletedAt: null, status: 'active', isSample: false },
  …
})
```

`carrier_drivers_status_check` admits `active | inactive | suspended | on_leave | terminated`.
Four of those five are filtered out silently, with no row and no explanation — the same shape as
the reported finding, on the other picker. An expired-CDL driver is flagged and blocked; a
*suspended* driver simply is not there.

**Latent today, not observable:** all 36 non-sample, non-deleted drivers in the database are
`active`, so no dispatcher can currently hit it.

**Deliberately not changed here.** The brief scopes Part C to the truck picker and names it as the
only application-behaviour change, and unlike the truck case there is a defensible argument for
filtering a terminated driver rather than listing them. Recorded as the follow-up decision.

For completeness, the two predicates that are *correctly* filters on both pickers:
`isSample: false` (per the standing rule that sample data must never appear in an assignment
selector) and `deletedAt: null`.

---

# PART D — Finding 2: window materialisation

## 11. The test

New suite: **`apps/web/tests/carrier/document-import-commit-windows.test.ts`**.

```
 ✓ tests/carrier/document-import-commit-windows.test.ts (2 tests) 20962ms
   ✓ writes scheduledDeparture + offsetMin * 60000 into every stop window   7547ms
   ✓ leaves the window null on a stop the template gave no offsets          8331ms
```

It creates a real `route_templates` row with real `route_template_stops` carrying MKE-NORTH-2's
offsets, links it to the import (`document_imports.route_template_id`), commits, and asserts on
real rows:

```ts
expect(trip.scheduledDeparture.getTime()).toBe(DEPARTURE.getTime());
expect(trip.routeTemplateId).toBe(templateId);      // the state the browser check could not produce
expect(stops).toHaveLength(4);

for (let i = 0; i < OFFSETS.length; i++) {
  const [startMin, endMin] = OFFSETS[i];
  expect(stops[i].appointmentStart).not.toBeNull();
  expect(stops[i].appointmentStart.getTime()).toBe(DEPARTURE.getTime() + startMin * MINUTE);
  expect(stops[i].appointmentEnd.getTime()).toBe(DEPARTURE.getTime() + endMin   * MINUTE);
}
```

**MKE-NORTH-2's offsets, read off production and kept in the template's own order:**

```sql
MKE-NORTH-2  seq 1  630 / 720
MKE-NORTH-2  seq 2  480 / 600
MKE-NORTH-2  seq 3  750 / 840
MKE-NORTH-2  seq 4  870 / 960
```

That order is **not** ascending by time — stop 1 opens at 630, stop 2 at 480. Kept unsorted on
purpose: a bug that sorted, re-indexed or paired offsets to positions by order would produce a
plausible set of windows on the *wrong* stops, and a sorted fixture cannot see it. An explicit
check pins it:

```ts
expect(stops[0].appointmentStart.getTime()).toBeGreaterThan(stops[1].appointmentStart.getTime());
```

The anchor is tomorrow at **07:23:00.000Z**, not midnight or on the hour, so an implementation
that truncated to the hour or fell back to start-of-day cannot land on the expected instant by
luck.

**The vacuity control** commits a second import in which stop 2 carries no offsets, and asserts
that stop is `null` while its neighbours materialised — so neither "stamp a window on everything"
nor "stamp nothing" passes, and a zero-offset fallback (a plausible, wrong 07:23 appointment)
fails too.

**Probed, not assumed.** Disabling the offset branch of `materialiseWindow`:

```
 × writes scheduledDeparture + offsetMin * 60000 into every stop window
 × leaves the window null on a stop the template gave no offsets
AssertionError: expected null not to be null
AssertionError: expected null not to be null
 Tests  2 failed (2)
```

then restored — `git diff --quiet src/lib/document-import/commit.ts` → identical to HEAD, suite
green again.

## 12. Is `appointment_is_firm` carried through from the template?

**No — and it cannot be. There is nothing to carry.**

`route_template_stops` has **no firmness column at all**. Read off `information_schema.columns`,
the complete list is:

```
id · route_template_id · sequence_order · stop_type · facility_id · contact_name · contact_phone
appt_window_start_offset_min · appt_window_end_offset_min · expected_dwell_minutes
commodity_description · bol_required · pod_required · special_instructions
created_at · created_by_id
```

So `materialiseWindow`'s `isFirm: false` on the offset branch is **the only truthful value, not a
dropped field**, and its existing comment gives the right reason: a window derived from a
template's standing offsets is a plan, not a commitment the consignee made, and marking it firm
would hand Phase 7's optimiser a hard ordering constraint nobody agreed to.

Firmness reaches a stop only from a window **printed on today's document**
(`consignment.appointment.isFirm`), which takes the *other* branch of `materialiseWindow` — the
branch that wins outright when a printed window exists. The test asserts `appointmentIsFirm ===
false` on all four stops and documents why, so a future change that starts inventing firmness from
a template has to argue with the assertion.

Incidental, worth recording next to the CLAUDE.md note that `stops."bolRequired"` / `"podRequired"`
are camelCase: on `route_template_stops` the same two columns are **snake_case**
(`bol_required` / `pod_required`). Two tables, opposite conventions, one more reason to read
`information_schema` rather than infer.

---

# Gates

## tsc — probed in both apps, and demonstrably not blind

Per the standing rule that a clean run is worthless unless the gate is proven live.

| App | Errors | Probe | Result |
|---|---|---|---|
| `apps/web` | **0** | `const __probe536: number = 'not-a-number'` appended to `commit-service.ts` | `src/lib/document-import/commit-service.ts(1205,7): error TS2322: Type 'string' is not assignable to type 'number'.` — the injected error, at the exact line, **and the only error**. Removed; `git diff --quiet` → identical to HEAD. |
| `apps/mobile` | **0** | same probe in `lib/api-with-queue.ts` | `lib/api-with-queue.ts(31,7): error TS2322: Type 'string' is not assignable to type 'number'.` — likewise the only error. Restored via `git checkout --`. |

The web gate also caught four real errors in the new windows suite before the probe
(`TS18046: 'stops' is of type 'unknown'` ×4, from an unannotated `bypass<T>` call), fixed in
`83e40953` — which is independent evidence that semantic checking was running on the new files.

No `__probe*.ts` files remain anywhere: `git status` is clean apart from the untracked
`.planning/quick/536-…/` directory.

## Full suite — diffed against the pre-task commit, not counted

| | Tests | Passed | Failed |
|---|---|---|---|
| Baseline `0f6d037a` | 1354 | 1230 | **66** |
| After `83e40953` | 1361 | 1237 | **66** |

```
NEWLY FAILING (regressions): 0
NO LONGER FAILING: 0
failure sets byte-identical: true
new tests added: 7
```

The 66 failures are **proven** pre-existing by set comparison, not asserted — `diff
before-fails.txt after-fails.txt` is empty. They are the workflow-engine suites
(`workflows-complete-step`, `workflows-dispatch-enforcement`, `workflows-fail-inspection`,
`workflows-fire-event`, `workflows-instance`, …), untouched by this task. The +7 is exactly the
work: 3 truck classification + 2 notification isolation + 2 window materialisation.

**Baseline run method, stated because the first attempt did not work.** `git worktree add
--detach` into `%TEMP%` produced a tree that could not resolve the monorepo's hoisted
`node_modules` (`Cannot find package '@/lib/db/prisma'`, then `MODULE_NOT_FOUND` on the vitest
config). It was removed with `git worktree remove --force` and recreated at
`<repo>/.baseline-536`, inside the root so Node's resolution walks up. **`git worktree remove` was
used, never `Remove-Item`.** Removal reported `Permission denied` on part of the tree and
deregistered the worktree anyway; before clearing the 197-file residue it was checked for reparse
points — `Get-ChildItem -Recurse -Force -Attributes ReparsePoint` returned **nothing**, and `find
-type l` returned nothing, so it was a plain directory with no junction to follow. Cleared, then
`git worktree prune`. Main checkout verified afterwards: 4,049 tracked files, `git diff HEAD`
empty, still on `feature/document-import` at `83e40953`.

## Test-isolation discipline

Both new DB suites follow `tests/isolation/setup.ts`'s contract exactly, matching the rollback
suite:

- Throwaway tenant with an unmistakable name — `ZZ-THROWAWAY-PHASE8-NOTIF-<stamp>` and
  `ZZ-THROWAWAY-PHASE8-WINDOWS-<stamp>`.
- `assertDisposable()` before every scoped write, plus an explicit by-name refusal of
  `PROTECTED_TENANT_ID = 7e9eca25-1f97-46ed-9365-e67be49436d5`.
- `afterAll` deletes children-first, then **re-counts twelve tables and throws** if anything
  survived.
- The whole suite is `describe.skip` when `DATABASE_URL` is unset.

**Cleanup verified independently of the suites' own checks**, after every run:

```sql
SELECT count(*) FROM "Tenant" WHERE name LIKE 'ZZ-THROWAWAY%';                        -- 0
SELECT count(*) FROM dispatches       WHERE id = '53e002c8-722b-4f36-a6a8-1c9428a294b0'; -- 1
SELECT count(*) FROM stops            WHERE dispatch_id = '53e002c8-…';                  -- 6
SELECT count(*) FROM carrier_documents WHERE dispatch_id = '53e002c8-…';                 -- 6
```

No DDL, no schema change, no Supabase write of any kind — every MCP call in this task was a
`SELECT`. Trip `53e002c8-722b-4f36-a6a8-1c9428a294b0` and its rows are untouched.

---

# Per-item audit

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Quote the rollback test's assertions in full; per case, the exact query and the exact row count | **IMPLEMENTED** | Part A §1 — the generated loop and the control quoted verbatim, `countRows()` quoted verbatim, plus a per-case query/count table |
| 2 | State per case how the test would fail if rollback were broken, with expected-vs-actual | **IMPLEMENTED** | Part A §2 — six-row table; the `expected true to be false` and `expected +0 to be 1` shapes are confirmed empirically by probe 2, not predicted |
| 3 | Confirm no assertion inspects a mock, spy or stub; name any that does | **IMPLEMENTED** | Part A §3 — none. No `vi.mock`/`vi.fn`/`vi.spyOn` in the file; every `expect` resolves to a real query or to `CommitOutcome` |
| 4 | Run the test and paste the real output | **IMPLEMENTED** | Part A §4 — 9 passed, 56.70s, plus a real rollback log line |
| 5 | Anti-vacuity: empty `commitImport`, confirm RED, restore, confirm GREEN, paste both, restore fully, confirm with `git status` | **IMPLEMENTED** | Part A §5 — **two** probes. Probe 1 is the brief's ask (RED, but only via the warm-up guard, stated as the weaker result). Probe 2 gutted the transaction so the row assertions themselves failed: 8 failed / 1 passed with `expected +0 to be 1` on the control. Restored, GREEN, `git diff --quiet` identical to HEAD, `git status` clean |
| 6 | Force the notification to throw; assert from the DATABASE that trip, stops and documents persist; real rows not mocks | **IMPLEMENTED** | Part B §6 — new suite, 2 passed. Assertions are `count()`/`findMany()` on `dispatches`, `stops`, `carrier_loads`, `carrier_documents`, `document_imports`; the mock is only the injection. Control case asserts identical counts on success |
| 7 | Report whether the failure is logged with name and message via `serializeError`, or swallowed | **IMPLEMENTED** (+ fixed) | Part B §7 — **swallowed**: `Error: [object Object]`, captured live. Context passed in `logger.error`'s error slot; both copies of the error lost. Fixed in `50260000`; the after-log is pasted. Fixing exceeded "report" and is flagged deliberately — it is diagnostic plumbing, not application behaviour, and without it item 6's failure is unreportable. A residual E251 finding is reported, not fixed |
| 8 | Report where the filter is applied and why `out_of_service` diverges from `inactive` | **IMPLEMENTED — premise falsified** | Part C §8 — there is **no status filter** and no divergence; `toTruckOption` already flagged and blocked out-of-service. The real cause is `TRAILER_TYPES` over `truck_type`, proven against `pg_constraint` and against the one `out_of_service` row in the database (a `flatbed`, in a different tenant from the one verified) |
| 9 | Change it so an out-of-service truck is listed, flagged, selectable, and blocks with its reason named — matching the expired-CDL driver exactly | **IMPLEMENTED** | Part C §9, commit `0ab06abe` — diff shown. Match is structural: both rows are the same `PickerRow` with the same `blocked` prop, and both blocks land in the same `validation.blocks` read by the same footer. Larger defect fixed than the one reported (all flatbed/reefer/tanker tractors). Trailer picker degradation reported, not hidden. 3-case guardrail test added |
| 10 | Report whether any other picker in this screen filters rather than flags | **IMPLEMENTED** | Part C §10 — **yes, the driver picker** (`status: 'active'` drops `inactive`/`suspended`/`on_leave`/`terminated`). Latent today: all 36 real drivers are `active`. Deliberately not changed — out of the brief's stated scope, and the trade-off differs from the truck case |
| 11 | Integration test committing an import WITH a route template, asserting `appointment_start`/`_end` = `scheduledDeparture + offsetMin * 60000` on real rows, using MKE-NORTH-2's offsets | **IMPLEMENTED** | Part D §11, commit `1cf1edfc` — 2 passed. Real `route_templates` + `route_template_stops` rows, `dispatches.route_template_id` asserted set, MKE-NORTH-2's real offsets kept **unsorted** so a re-pairing bug is visible, 07:23 anchor so truncation cannot pass, vacuity control on a no-offset stop, and the whole thing probed RED by disabling `materialiseWindow`'s offset branch |
| 12 | Report whether `appointment_is_firm` is carried through from the template | **IMPLEMENTED** | Part D §12 — **no, and it cannot be**: `route_template_stops` has no firmness column at all (full `information_schema` column list quoted). `false` is the only truthful value, not a dropped field. Asserted in the test with the reason recorded |

**12 of 12 IMPLEMENTED. None partial, none skipped.**

Two items came back with a different answer than the brief anticipated (8 falsified, 12 answered
by the schema); both are reported as found rather than worked around.

---

# Deviations and things deliberately not done

1. **Item 7 was a "report" item and a fix was made anyway.** Flagged, not buried. `logger.error`
   argument order is diagnostic plumbing rather than application behaviour, and leaving a
   provably-broken error log in place after proving it broken — in the same file whose failure
   handling item 6 exists to characterise — would have made the finding unactionable.
2. **The driver picker's `status: 'active'` filter was left in place** (item 10). Reported as the
   follow-up decision; changing it is outside the brief's stated scope for Part C.
3. **The trailer picker now renders nothing.** Stated as a gap with its cause, its blast radius
   (0 of 301 dispatches ever set `trailer_id`) and the schema change that would restore it.
4. **The E251 `getTenantPrisma()` call inside `sendDispatchAssignedNotification`** is reported,
   not fixed — pre-existing, works under a real request, and out of scope.
5. **Not browser-verified, not deployed, not pushed.** Part C's change is worth clicking: open the
   assignment screen for tenant `61c48b49-…` and confirm truck `Qqq` now appears under **Truck**
   with an "Out of service" flag and a disabled `Create trip` reading *"Truck Qqq is out of
   service"*.

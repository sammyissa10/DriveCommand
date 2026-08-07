---
status: resolved
trigger: "doc-import-t1-not-firing-on-learned-refs"
created: 2026-08-06T07:00:00.000Z
updated: 2026-08-06T07:00:00.000Z
mode: diagnose_only -> fixed in quick-511
---

## Current Focus

hypothesis: CONFIRMED — the stop view loads external references with
`record.clientId` straight off the `document_imports` row. On a fresh (or
correction) import whose client merely *auto-resolves*, that column is still
null, because `buildClientSlot`'s deterministic branches return `state:
'RESOLVED'` for display without writing (the quick-508 shape, still true).
`loadExternalReferences` short-circuits on a null client and returns an EMPTY
Map, so T1 has nothing to consult and every stop falls through to T2.
test: read the four functions in the chain, then confirmed against production —
the second import row has `client_id = null`, and all seven refs are stored
under `client_id = ea7f605d-…` (DEALER TIRE - CHICAGO WHSE).
expecting: confirmed by reading plus two SELECTs; no further test needed.
next_action: none — diagnose_only mode, report back to orchestrator.

## Symptoms

expected: Second import of the Dealer Tire manifest, with all seven consignee
codes already confirmed in `facility_external_references`, should resolve every
stop at T1 with "saved code for this client" as the why.
actual: Every stop resolves silently but shows ADDRESS MATCH (T2) at score 100%.
errors: none — nothing failed, the wrong rung simply answered first.
reproduction: Import the Dealer Tire manifest a second time (as a correction)
after the first import's seven facilities were created and confirmed. Open the
summary card, expand Facilities, tap any stop's `why`.
started: Immediately — this is the first second-import ever run against the
Phase 4 ladder (commit 32d57306).

## Eliminated

- **Ladder ordering.** T1 is evaluated first, unconditionally, and returns before
  any address work happens. T2 cannot pre-empt it. See Evidence 3.
- **Missing / unconfirmed / duplicate references.** Seven rows, all
  `confirmed_by_id` set, all `resolved_via = 'T4'`, one per code, no duplicates.
- **Source-code normalisation drift.** Stored codes are bare digits and
  `normaliseSourceCode` is applied identically on write and on read.
- **A dangling-reference filter.** The `candidates.some(...)` guard would only
  matter if the map had entries; it does not.

## Evidence

- timestamp: investigation
  checked: `apps/web/src/lib/document-import/facility-ladder.ts:265-286`
  found: The T1 lookup is **not a database query**. It is an in-memory
  `Map.get` against a map the caller supplies:
  ```ts
  const code = normaliseSourceCode(stop.sourceCode);
  if (code) {
    const facilityId = context.referencesByCode.get(code);
    if (facilityId && context.candidates.some((c) => c.id === facilityId)) {
      return { tier: 'T1', autoLink: true, facilityId, ... };
    }
  }
  ```
  implication: whether T1 can fire is decided entirely by what
  `context.referencesByCode` was built from — not by the ladder.

- timestamp: investigation
  checked: `apps/web/src/lib/document-import/facility-lookup.ts:202-220`
  found: the query behind that map, and its guard:
  ```ts
  export async function loadExternalReferences(db, orgId, clientId: string | null) {
    const out = new Map<string, string>();
    if (!clientId) return out;            // <-- short-circuit, no SQL issued
    const rows = await db.facilityExternalReference.findMany({
      where: { orgId, clientId },         // <-- scoped by BOTH
      select: { sourceCode: true, facilityId: true },
    });
    ...
  }
  ```
  implication: the lookup **is** scoped by `client_id`, and with a null client it
  returns an empty map without ever issuing the `findMany`.

- timestamp: investigation
  checked: `facility-lookup.ts:414-421` (`resolveStops`) and
  `facility-resolution.ts:225-237` (`loadContext` / `viewOf`), plus
  `facility-resolution.ts:547-555` (`getStopResolution`)
  found: both call sites pass `record.clientId` — the raw column off the
  `DocumentImport` row returned by `getImportRecord`. Neither the GET view nor
  `resolveStopCounts` calls `ensureClientCommitted` first (correctly — the view
  path must not write).
  implication: the value T1 is scoped by is the **persisted** client, not the
  computed/display one.

- timestamp: investigation
  checked: `apps/web/src/lib/document-import/resolution.ts:697-750`
  found: `buildClientSlot` branch 1 requires `record.clientId` to already be set.
  Branches 2 and 3 (`PROFILE_ALIAS`, `EXACT_MATCH`) return `state: 'RESOLVED'`
  built from `resolveClientDeterministic` and **write nothing** — the quick-508
  finding, unchanged and still correct for the view.
  implication: a card can display a fully resolved client while the column
  backing every reference lookup is null. That is exactly this bug's setup.

- timestamp: investigation
  checked: `grep ensureClientCommitted(` — call sites are
  `resolution.ts:1367` (`ensureContractCommitted`), `:1458` (`assignContract`),
  `:1595` (`createAndAssignContract`), and `facility-resolution.ts:262` /
  `:356` / `:475` (`ensureStopsCommitted`, `confirmStopFacility`,
  `createStopFacility`).
  found: every one is a mutation. On a correction import where the client and
  contract both auto-resolve and the user taps nothing, none of them fires.
  implication: `client_id` stays null for the whole viewing session.

- timestamp: production, read-only SELECT
  checked: `document_imports`, newest 8 rows
  found: newest row `8002f056-5e2d-4fe7-b38a-5ccbba172b90` (`page-1.jpg`,
  created `2026-08-06 06:42:59+00`, i.e. after the Phase 4 commit at ~06:14):
  ```
  client_id      = NULL
  contract_id    = NULL
  client_via     = NULL      (no provenance -> nothing ever committed it)
  stop_records   = 0         (resolution_provenance -> 'stops' is absent)
  ```
  implication: **direct confirmation.** The import that showed T2 has a null
  client, and nothing was written to it at all.

- timestamp: production, read-only SELECT
  checked: `facility_external_references`, grouped
  found: 7 rows, every one under
  `client_id = ea7f605d-7848-453a-8bdd-80e085ba4c3e` (DEALER TIRE - CHICAGO
  WHSE), codes `43775, 44892, 47755, 49307, 51230, 52901, 60418`,
  `resolved_via = 'T4'` for all, `confirmed_by_id` set on all, no duplicates.
  implication: the refs are perfect. They are simply unreachable from an import
  row whose `client_id` is null — and note the first import
  (`d379270d-…`, `manifest-3page.pdf`) DOES carry that same client id, which is
  why day one wrote them successfully.

- timestamp: investigation
  checked: `facility-resolution.ts:257-316` (`ensureStopsCommitted`) and
  `:180-196` (`writeExternalReference` guard)
  found: the committer calls `ensureClientCommitted` **first**, then builds its
  ladder context from the returned record:
  ```ts
  const withClient = await ensureClientCommitted(orgId, userId, record);
  const { candidates, referencesByCode } = await loadContext(orgId, userId, withClient);
  ```
  implication: **the write path and the view path do not see the same context.**
  Had any mutation fired, the client would have been committed first and the
  same seven stops would have resolved T1. The divergence is in the context, not
  the ladder.

## Answers to the five questions

### 1 — The T1 lookup, and the filter it applies

`facility-ladder.ts:272-286` is a `Map.get`, not SQL. The SQL that fills the map
is `facility-lookup.ts:210-213`:

```sql
SELECT source_code, facility_id
  FROM facility_external_references
 WHERE org_id = $1 AND client_id = $2
```

**Yes, it scopes by `client_id`** — and it must, because the table's key is
`UNIQUE (org_id, client_id, source_code)` and `client_id` is `NOT NULL`.

**The value it received in this flow: `null`.** And to be exact about it — *the
query never executed at all.* `loadExternalReferences` returns an empty `Map` at
the `if (!clientId) return out;` guard on line 208, before the `findMany` is
issued. So T1 consulted an empty map for all seven codes.

### 2 — Where that client value comes from

`record.clientId` — **the `DocumentImport` column read from the database**, not
the computed/display resolution. Chain:

```
GET /[id]/stops
  -> getStopResolution        facility-resolution.ts:547
  -> getImportRecord                              (fresh DB read)
  -> viewOf -> loadContext                        :225
  -> loadExternalReferences(db, orgId, record.clientId)   :229
```

and identically for the summary card's counts via
`resolveImport -> resolveStopCounts -> resolveStops` (`facility-lookup.ts:418`).

That column is null whenever the client was auto-resolved and no mutation has
fired — the post-quick-508 shape, confirmed above as `client_id = NULL` with
`client_via = NULL`.

### 3 — Ladder ordering

**T1 is evaluated first, unconditionally, and T2 cannot pre-empt it.** The T1
block is lines 271-286 and `return`s out of the function on a hit;
`normaliseAddress(stop.address)` — the first line of T2 work — is line 288,
after it. There is no ordering bug. `facility-ladder.test.ts` pins this with a
stop whose *address* matches facility B while its *code* is confirmed against
facility A, and asserts A wins.

### 4 — Backfill and dedupe on the second pass

**No backfill was attempted, and no dedupe was exercised.** `stop_records = 0` on
the second import proves `writeStopProvenance` never ran, which means
`ensureStopsCommitted` never ran — it has only two callers, `confirmStopFacility`
and `createStopFacility`, and the user tapped neither because every stop resolved
silently.

Where dedupe lives, for the record: `writeExternalReference`
(`facility-resolution.ts:199-200`) is an `upsert` keyed on
`orgId_clientId_sourceCode`, so the database's unique constraint is the dedupe —
a repeat write updates in place rather than inserting. Two further guards would
have made a duplicate impossible regardless:
`if (!code || !args.clientId) return false` (:196), and the fact that
`ensureStopsCommitted` only backfills on `auto.tier === 'T2'` — a T1 stop writes
no reference at all, because the reference is what resolved it.

"No duplicates were written" is therefore true but is not evidence the dedupe
worked: **nothing was written.**

### 5 — Root cause, in plain English

The T1 reference lookup is scoped by `(org_id, client_id)` and reads
`client_id` straight off the `document_imports` row, but on this import that
column is `NULL` — the client auto-resolved for display only and no mutation had
fired to commit it — so `loadExternalReferences` short-circuited and returned an
empty map without ever issuing the query, leaving T1 nothing to match and every
stop falling through to T2, which then matched exactly on address because the
facilities had been created from this very document the day before. The seven
references are stored correctly under `client_id = ea7f605d-…` and were simply
unreachable from an import row that had no client on it. **The T1 query executed
with no `client_id` at all — it did not execute.**

## Secondary finding, worth recording

**The view and the commit path build different ladder contexts**, which breaks
the property Phase 4 was designed around ("the read-only view and the mutation
boundary run the identical decision"). `ensureStopsCommitted` calls
`ensureClientCommitted` *before* loading references, so it would have resolved
these same seven stops as **T1 / EXTERNAL_REF**, while the card was showing
**T2 / NORMALISED_ADDRESS**. The ladder is identical in both; the context is not.

Consequences if left as-is:
- The `why` affordance misattributes the reason (the user-visible symptom).
- The stop provenance eventually written would say `EXTERNAL_REF` while the card
  said "Address match" — the same class of untruth quick-509 was about.
- `resolvedVia` on any backfilled reference is written from the tier the
  *committer* computed, so the existing rows' `T4` is not at risk here; but a T2
  path reached with a committed client would rewrite `T4` to `T2` on those rows,
  losing the record that a human created them.

No fix applied — diagnose_only.

---

## Fix — quick-511, scope by the effective client (2026-08-06)

status: fixed (not browser-verified, not deployed, not pushed)

### What changed

The ladder context is now scoped by the **effective** client — persisted if
there is one, otherwise whatever `resolveClientDeterministic` reaches — instead
of by `record.clientId` alone.

**`facility-lookup.ts`** — `resolveStops` and `resolveStopCounts` no longer read
`record.clientId`. They take `effectiveClientId` as a parameter and pass it to
`loadExternalReferences`. The null short-circuit inside `loadExternalReferences`
is unchanged and deliberate: `client_id` is `NOT NULL` on the table, so a
genuinely unresolvable client has no key to look anything up by, and an empty map
is the right answer rather than an error — the stop falls to T2/T3/T4 and a
person decides, which is the ladder working.

**`resolution.ts`** — owns the derivation, because `resolveClientDeterministic`
lives there and `facility-lookup.ts` importing it would close a cycle
(`resolution.ts` already imports `facility-lookup.ts` for the stop counts).

- `effectiveClientIdOf(record, deterministic)` — pure, the single definition of
  "effective client".
- `resolveEffectiveClientId(db, orgId, record)` — exported and self-sufficient,
  for callers with no client slot in hand. **Early-returns before touching the
  database when `record.clientId` is set**, which is every call from the commit
  path.
- `resolveImport` hoists the one query that loads the client list
  (`scoreClients`) and shares it with `buildClientSlot`, then computes the
  effective client from inputs already in hand. `resolveClientDeterministic` is
  pure, so calling it a second time costs nothing; only the query is shared.
- `buildClientSlot` takes `scored` as a **required** parameter now. Required, not
  optional-with-a-fallback: an optional parameter would be two code paths that
  can answer differently, and "the client the card shows and the client the
  references are scoped by are the same one" is the entire point.

**`facility-resolution.ts`** — `loadContext` calls `resolveEffectiveClientId` and
passes the result down. This file was outside the task's stated modify list, and
it is named here rather than glossed: it is where `GET /[id]/stops` builds its
context, it is the route on which the bug was actually seen, and the change is
two lines of context assembly. Fixing only `facility-lookup.ts` would have left
the observed path broken.

### Why the view and the commit path now agree — by construction

`ensureStopsCommitted` runs `ensureClientCommitted` **before** building its
context. That writes `clientId` from `resolveClientDeterministic`. Its
`resolveEffectiveClientId` then early-returns that same id. The view runs the
same resolver and reaches the same id without writing. Same function, one
answer — not two implementations kept in step by discipline.

### Read-only preserved

No write was added to any view path. `resolveEffectiveClientId` resolves and
never commits; committing remains `ensureClientCommitted`'s job and it is called
from mutations only. A test asserts `documentImport.updateMany` is never called
during a resolve.

### Tests

`facility-effective-client.test.ts` — **NEW**, 9 tests, with the real
`resolution.ts` unmocked so the actual resolver and the actual
`ensureClientCommitted` are exercised; only the database is faked.

The regression fixture is deliberately built so **T2 cannot mask the bug**: the
consignment's address matches no facility, so only a correctly scoped reference
lookup can produce a link. This is what hid the live fault — the real addresses
DID match, so an empty reference map still produced a silent link that looked
fine and merely attributed itself wrongly.

- persisted client returns without any query (the early return)
- deterministic client derived when nothing is persisted
- ambiguous client returns null and does not throw
- resolving never writes
- `getStopResolution` on a null-`clientId` record yields **tier T1**,
  `via: EXTERNAL_REF`, `matchedText: '43775'`, `persisted: false`
- the reference query is issued as `{ orgId, clientId: <derived> }`, not null
- unresolvable client → T4, `requiresHumanTap`, and **no query issued at all**
- **view context and commit context issue identical reference `where` clauses**
  for a record with a null `clientId`
- **both reach tier T1**, and the provenance the commit writes says
  `EXTERNAL_REF` — the card cannot promise what the write will not do

`facility-ladder.test.ts` — 2 added: a populated map reaches T1 with a
non-matching address; an empty map skips the rung, lands on T4, and does not
throw.

### Verification

```
apps/web    npx tsc --noEmit   -> 0 errors (exit 0)
apps/mobile npx tsc --noEmit   -> 0 errors (exit 0)
vitest run src/lib/document-import -> 20 files, 300 passed (was 19 / 289)
full web suite -> 14 failed | 1003 passed  (failing set byte-identical to the
                  standing pre-existing baseline; passing +11)
```

Nothing installed, no DDL, no schema change, no UI change.

### Still true after the fix

The existing seven reference rows still read `resolved_via = 'T4'`, correctly —
they record how each link came to exist (a human created the facility on day
one), and T1 resolutions write no reference because the reference is what
resolved them.

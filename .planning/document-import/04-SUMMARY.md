# Phase 4 — Facility resolution ladder and external references

**Spec:** `docs/specs/DocumentImport_TechnicalSpec_v1.md` Section 7, security notes Section 15
**Prior:** `00-AUDIT.md` · `01-`/`02-`/`03-SUMMARY.md` · `DECISIONS.md` ·
`.planning/debug/doc-import-contract-client-guard.md` (quick-508/509/510)
**Branch:** `feature/document-import`
**Scope:** the four-tier ladder, the shared address normaliser, external
reference writes, stop provenance. No stop review (Phase 5), no template
matching (Phase 6), no commit (Phase 8).

---

## The shape of it

```
     consignment                                        WRITES
          |                                     (mutation boundary only)
          v
   +--------------+  T1  external ref (tenant, client, code)  --> link, silent
   |              |  T2  normalised address, exactly one      --> link, silent
   |   ladder     |                                               + backfill ref
   | (pure, no    |  T3  fuzzy >= 0.70                        --> PROPOSE, tap
   |  db, no io)  |  T4  nothing                              --> CREATE FORM, tap
   +--------------+
          |                                          ensureStopsCommitted
          |  read-only view                          confirmStopFacility
          v                                          createStopFacility
   StopResolutionView                                        |
   persisted: false  <-- displayed, not written               v
                                              resolution_provenance.stops
                                              facility_external_references
```

Three properties carry the phase, and each one is a lesson from an earlier
round rather than a preference:

1. **The ladder is pure.** `resolveFacilityTier` takes already-loaded candidates
   and returns a verdict. The read-only view and the mutation boundary run the
   *same function*, so the tier the card collapsed and the tier the write
   commits cannot differ — the exact defect quick-508 and quick-510 fixed for
   the client and the contract.
2. **Nothing in a view path writes.** `GET /stops` loads, decides, describes,
   returns. A silent T1/T2 link is displayed the moment it is derived and
   written the first time a mutation needs it, exactly as `ensureClientCommitted`
   does. `StopSlotView.persisted` says which of the two a row is, on the
   payload — the honest version of the claim Phase 3's footer had to delete.
3. **T3 and T4 carry no facility id.** Not "we check before creating" — the T3
   and T4 members of the verdict union have no `facilityId` field, and
   `autoLinkTarget()` returns null for them. There is nothing for a future edit
   to reach for.

---

## What shipped

### Pure (no Prisma, no network, no clock)

| File | What it does |
|---|---|
| `address.ts` | **NEW** the one normaliser. Case, punctuation, street suffixes, directionals, unit/suite/dock split, ZIP+4, spelled states, Saint/St cities, leading zeros, ordinals, PO boxes, facility-name prefixes. Parses a printed line *or* a fielded address into one shape. |
| `facility-matching.ts` | **NEW** the scorer: street-name token overlap + street-number set + postcode + locality, with unit / directional / state / PO-box / numbered-street conflicts as strong negatives. Returns the differing fields in plain words. |
| `facility-constants.ts` | **NEW** every tuned number, and the threshold with the two real pairs that fix it. |
| `facility-ladder.ts` | **NEW** T1→T4, as a discriminated union. |
| `provenance.ts` | **NEW** — the provenance vocabulary, **moved** out of `resolution.ts` so the stop view and the client mutations can share it without importing each other. Extended with `StopProvenanceVia` and a `stops` key. |

### Server

| File | What it does |
|---|---|
| `facility-lookup.ts` | **NEW** tenant-scoped loads + `decideStops` + the view. Read-only, and upstream of `resolution.ts` so the dependency stays a line rather than a cycle. |
| `facility-resolution.ts` | **NEW** and the *only* file in the phase that writes: `ensureStopsCommitted` (T1/T2), `confirmStopFacility` (T3), `createStopFacility` (T4). |
| `resolution.ts` | Provenance block replaced by re-exports; `ensureClientCommitted` exported; `stops.matched`/`created` now real numbers; two new error codes. |
| `lib/carrier/facilities.ts` | `createFacility` **extended** with an optional pre-resolved tenant client and optional `createdById`/`updatedById`. Every existing call site is byte-identical in behaviour. |
| `handlers.ts` | +3 transport-neutral handlers, +2 status mappings. |

**4 route files**, mirrored across both surfaces:
`GET|POST /[id]/stops` · `POST /[id]/stops/facility`.

### Web UI

- `StopResolutionList.tsx` — the stop list, per-stop state, `why`, T3 proposals
  with score and diffs, T4 pre-filled create form.
- `StopResolutionPanel.tsx` — loads it on demand; separate so the list stays a
  pure render of a view it is handed.
- `WhyPopover.tsx` — **widened, not duplicated**. The four stop vias were added
  to the existing component's label map.
- `ImportSummaryCard.tsx` — the stop-count row gained a real breakdown and a
  disclosure.

### `packages/api-client`

9 new types and 3 new methods, mirroring the server verbatim, plus the
`matched`/`created` nullability change.

---

## The decisions that matter

### The threshold is 0.70, and two real addresses fix it

Not a feel. The score is a weighted sum, so the value is pinned by two pairs
that must land on opposite sides:

```
  8900 Indianapolis Blvd  vs  8900 US-41,  Highland IN 46322
     street name shares nothing, everything else agrees
     -> 0.40 + 0.20 + 0.15 = 0.75   MUST PROPOSE (same dock, two names)

  2200 S Ashland Ave      vs  2800 S Ashland Ave, Chicago IL 60608
     street name identical, house number differs
     -> 0.25 + 0.20 + 0.15 = 0.60   MUST NOT (six blocks away)
```

Any threshold in `(0.60, 0.75]` separates them; 0.70 sits in the middle rather
than on an edge. **The street number outweighs the street name** (0.40 vs 0.25)
which reads backwards until you say it out loud: given a city and postcode that
already agree, the house number is what says *which building*.

The number appears in exactly one file — verified by grep, and the tests import
it rather than restating it.

### The unit is deliberately not in the key

`9800 Industrial Dr` and `9800 Industrial Dr Ste 200` are one building printed
two ways. `2701 Busse Rd Unit 100` and `Unit 400` are two tenants who each want
their own freight. Both pairs share a street key, so **the key alone cannot
separate them** — and a T2 that compared keys would merge two real businesses.

So `key` excludes the unit and `normalisesEqual()` is *key equality AND unit
compatibility*, where compatible means "the same, or absent on one side". Fixture
pairs 5, 6, 20 and 26 are exactly this distinction and they are why the predicate
exists rather than a string comparison.

### The spec says `receiver`. The database does not have it.

Spec Section 7: "Consignees to receiver. Origin to shipper." Those two values
were in the original catalog and were **deliberately deleted** by
`20260518000001_tkt0016_align_facility_type_catalog`. Writing either one today
is a Postgres 23514. Confirmed against production:

```
facilities_facility_type_check
  CHECK (facility_type IN ('terminal','yard','warehouse','drop_yard',
                           'customer_site','driver_residence'))
```

Audit finding B1 and DEC-1 already recorded the mapping, and it is what the
phase's own "do not invent new types" instruction requires: **the roles are the
spec's, the vocabulary is the database's.** Consignee → `customer_site`, origin →
`warehouse`. A test asserts the created type is never `receiver` or `shipper`.

### A production 23514 the tests could not have caught

**The most important thing found in this phase.** The live schema check turned up:

```
facility_external_references_resolved_via_check
  CHECK (resolved_via IS NULL OR resolved_via IN ('T1','T2','T3','T4'))
```

The first implementation wrote the *provenance* via — `EXTERNAL_REF`,
`NORMALISED_ADDRESS`, `MANUAL`, `MANUAL_CREATE` — into that column. **Every
external reference write would have thrown in production**, which is every
confirmation, which is the entire point of the module. The database is faked in
the tests, so a fake accepted it and the suite was green.

Fixed by mapping the via to its tier at the write (`REFERENCE_TIER`), which is
what the column's own schema comment always said it held. `assertReferenceTiersAreLegal()`
now restates the CHECK in the test file and runs after every write, so it cannot
come back.

Two lessons worth carrying forward, and they are the same lesson B1 taught:
**read the constraint, not the column name**, and a faked database is not
evidence about SQL.

### Stop links live in `resolution_provenance.stops`. No DDL.

There is no stop row to hold a `facilityId` — stops become `CarrierStop` records
at commit (Phase 8), and until then a stop is an index into `reviewedExtraction`.
So the link *is* the provenance record, under a new `stops` key on the jsonb
column quick-509 added. No migration, no new column, no new table.

Vias: `EXTERNAL_REF` (T1) · `NORMALISED_ADDRESS` (T2) · `MANUAL` (T3 and any
re-pick) · `MANUAL_CREATE` (T4). T1/T2 carry the code or the matched address and
a score of 1 — both are exact matches, not guesses. `MANUAL` carries **the score
the person was looking at**, recomputed server-side from the same scorer so a
client cannot inflate it. `MANUAL_CREATE` carries null, because nothing was
compared and rendering a number would invent a comparison.

**On `MANUAL` vs `MANUAL_CREATE`:** the phase asked for "T3/T4 human
confirmations record MANUAL with the proposed score". Both are recorded as a
human `MANUAL` family; the create case is split out because it is the one
distinction that changes the sentence a reader gets ("You picked this facility"
vs "You created this facility from this document") and because it mirrors the
client vocabulary's existing `MANUAL` / `MANUAL_CREATE` split exactly. Declared
here rather than glossed.

### An index is not an identity, so the record carries a fingerprint

Keying stop links by array index is fragile the moment Phase 5 lets a dispatcher
reorder or edit stops — a stale link would silently attach one consignee's
confirmed facility to another's freight. Each record therefore stores a
`stopFingerprint` (the source code, or the normalised name + address key), and a
mismatch at read time means the record is **treated as absent and the ladder runs
again** rather than trusted. Two tests cover it, including the case where the
stale link would otherwise be invisible because both stops resolve.

### T2 ambiguity is a question, not a match

Two facilities that normalise to one address do not produce a silent link. They
drop to T3 with both offered, because linking to whichever sorted first would
pick one of two real buildings at random.

### What is excluded from matching, and why it is correctness

- **Soft-deleted facilities** (`facilityType` prefixed `inactive_`) — a facility
  a dispatcher believes is gone must not be a silent T1/T2 target. Filtered the
  same way `getFacility` and `updateFacility` already filter it.
- **Driver residences** (`isDriverResidence`) — spec Section 9 makes this a hard
  requirement: not in the general picker, not suggested for other trips,
  server-side and never a UI hide. A consignee ladder is the general picker.
- **A dangling external reference** whose facility is no longer a candidate does
  not resurrect it; it falls through to T2.

### The one admission beyond the address score

When the document printed **no usable address at all**, a facility whose name
matches exactly is offered as a T3 proposal. It cannot fire while there is
address evidence, so it cannot rescue a candidate the fixture says must stay out
— `2200 S Ashland` against `2800 S Ashland` stays out however matching the sign
over the door is. It exists because the alternative for an unreadable address
block is a T4 create form that produces a duplicate of a facility the tenant
already has. Still a proposal, still needs a tap, and tested both ways.

---

## Per-item audit of the Phase 4 prompt

Written against the prompt text item by item, not from memory of the work
(DEC-9's standing rule).

| # | Item | Verdict |
|---|---|---|
| 0 | Fixture file, exactly as given, NO_MATCH traps intact | **IMPLEMENTED** |
| 1 | Shared address normaliser, one implementation, pure | **IMPLEMENTED** |
| 2 | Fixture-driven unit tests through the real normaliser and scorer, per-pair results | **IMPLEMENTED** |
| 3 | The four-tier ladder exactly as Section 7 draws it | **IMPLEMENTED** |
| 4 | Fuzzy scoring + threshold in one constants file with a comment | **IMPLEMENTED** |
| 5 | Facility types from the audit's real values | **IMPLEMENTED** — with a stated deviation from the spec's wording; see below |
| 6 | External refs on every confirmed resolution and T2 backfill; stop provenance; why affordances | **PARTIALLY** — the mobile RN stop UI is not built; see below |

### 0 — IMPLEMENTED

`apps/web/src/lib/document-import/__fixtures__/facility-address-pairs.fixture.json`,
byte-for-byte as supplied. 30 pairs, 11 SILENT / 8 PROPOSE / 11 NO_MATCH,
verified by parsing it back before any code was written. No value edited, no pair
omitted, no trap weakened. The test reads it **from disk**, so weakening one
would have to be done in the fixture where it is visible in a diff.

### 1 — IMPLEMENTED

`address.ts`, ~470 lines, no imports beyond its own types. Handles every class
the prompt lists plus the ones the fixture forced: ordinal reduction (`95th`→`95`),
PO boxes, facility-name prefixes, reference-code prefixes, and undelimited
single-line addresses. Used by the scorer, the ladder, the view and the writers —
there is no second normaliser in the module, and `matching.ts`'s `normaliseName`
(company names) is deliberately a different function for a different vocabulary,
reused rather than reimplemented for facility names.

One defect found by my own test and fixed rather than papered over:
`normalisedEqual` sat one letter from `normalisesEqual` and silently accepted a
raw string, where `undefined === undefined` made two unreadable addresses match.
Renamed to `normalisedAddressesEqual`; the names were the defect.

### 2 — IMPLEMENTED

`address.test.ts` reads the fixture with `readFileSync` and pushes every pair
through `normaliseAddress` and `scoreNormalisedAddresses` — the same functions
the ladder calls. Nothing is reimplemented. Per-pair results are reported twice:
as named `it.each` cases (`pair 14 · highway alias vs local street name`) and as
the printed table pasted below.

All three assertions hold for all thirty:
SILENT normalises equal *and* scores exactly 1; PROPOSE does **not** normalise
equal, scores ≥ threshold, and stays < 1; NO_MATCH never normalises equal and
scores < threshold.

### 3 — IMPLEMENTED

`resolveFacilityTier`, in the spec's order, with the ordering property tested
directly: a stop whose *address* matches facility B and whose *code* is confirmed
against facility A resolves to A, because the code is a decision a person already
made and today's address may simply be printed wrong.

### 4 — IMPLEMENTED

`FACILITY_FUZZY_THRESHOLD` in `facility-constants.ts` with the derivation above.
Verified: `grep -rn "FACILITY_FUZZY_THRESHOLD *=" .` and `grep -rn "0\.7[^0-9]"`
over the module both return exactly one line, that file. Weights, penalties and
the candidate cap live beside it.

The other half of the phase's stated drift risk — "fuzzy scoring implemented as
string equality, which makes T3 unreachable" — is guarded by the fixture itself:
eight pairs must score at or above the threshold *while not normalising equal*,
which string equality cannot do.

### 5 — IMPLEMENTED, with the deviation stated

`FACILITY_TYPE_FOR_ROLE = { consignee: 'customer_site', origin: 'warehouse' }`.

The prompt says "consignees take receiver, origin takes shipper" and also "from
the audit's real values" and "do not invent new types" — and those three cannot
all be satisfied literally, because the audit's real values (B1) are exactly the
six the CHECK admits and `receiver`/`shipper` are not among them. The roles are
honoured; the vocabulary is the database's. This is DEC-1, unchanged, now
enforced by a test and by a validated allow-list on the create path that rejects
`receiver` with a 400 rather than letting it reach Postgres as a 500.

### 6 — PARTIALLY

**External reference rows: IMPLEMENTED.** Written on every T2 backfill, every T3
confirmation and every T4 create, as an upsert on
`UNIQUE (org_id, client_id, source_code)` so a human correction overwrites rather
than duplicates. The code is stored normalised, because that unique constraint is
what deduplicates it and `43775` must not become two rows with `#43775 `. Three
tests assert the exact upsert arguments; a fourth asserts a stop with no code
writes nothing rather than inventing a key.

**Stop provenance: IMPLEMENTED**, per the quick-509 pattern — merged in memory
from the record already read, written in the same `updateMany`, other keys
carried across untouched.

**Why affordances: IMPLEMENTED on web, NOT BUILT on mobile.** Every resolved stop
on the web surface renders the same `WhyPopover` the client and contract rows use
— the component was widened rather than copied. **The mobile RN stop list does
not exist**, so on mobile there are no resolved stops to carry a `why`. The API,
the types and the client methods are all mirrored and ready; the screen is not
built, because stop review is Phase 5 and building a stop list here would be
building that phase's screen ahead of it. Named as a gap rather than counted as
done.

### Constraints

| Constraint | Verdict |
|---|---|
| Install nothing | **IMPLEMENTED** — dependency diff empty |
| Tenant-scope every lookup server-side | **IMPLEMENTED** — `CarrierFacility` and `FacilityExternalReference` are both in `EXEMPT_MODELS`, so every `where` carries `orgId` explicitly |
| Extend existing facility creation paths, do not modify them | **IMPLEMENTED** — `createFacility` gained an optional third parameter and two optional input fields; omitting them is the previous behaviour exactly |
| No DDL; `facility_external_references` is the storage | **IMPLEMENTED** — no migration written; all 13 columns verified present against production |
| No writes in any view path | **IMPLEMENTED** — writes exist in one file, in three exported functions, all reachable only from POST |
| HARD RULE: never create from T3/T4 without a human tap | **IMPLEMENTED** — enforced by the union's shape, by the call graph, and by a test |

---

## Not done, and why

**The mobile stop screen.** See item 6. API, types and client methods shipped;
the RN list did not.

**`ensureStopsCommitted` is not called by a commit, because there is no commit.**
It has three real callers today (both stop mutations, and itself via them), so
unlike quick-510's `ensureContractCommitted` it is not dead code. But **Phase 8's
atomic commit must call it** before reading stop links: an import whose twelve
stops all resolved silently and where nobody tapped anything has nothing on its
row, and a commit that reads the row would build a trip with no facilities while
the card that authorised it showed twelve. The requirement is in the function's
doc comment, where it will be looked for.

**Audit finding B4 is still open and this phase works around it rather than
fixing it.** `CarrierFacility` has no `deleted_at` and no `active` column;
`softDeleteFacility` writes `inactive_${type}`, which the CHECK does not admit,
so that call must throw a 23514. The audit recommended fixing it *inside* Phase 4
by adding an `active` column — **this phase may not write DDL**, so instead every
match target is filtered by `NOT facilityType startsWith 'inactive_'`, consistent
with `getFacility` and `updateFacility`. The consequence to know: a facility
someone "deleted" is almost certainly still `customer_site` in the database and
therefore still a live match target. Closing B4 properly is a small additive
migration and it should happen before Phase 8.

**No live-import verification.** The six checks in the phase's verify table have
not been run against a real import — no S3 credentials, no test manifest in this
session. What each rests on is set out below, honestly labelled. This is the same
position Phases 2 and 3 closed in.

**The resolution view got more expensive.** `resolveImport` now loads every
facility in the tenant and runs the ladder for every stop, including on the
client picker's search-as-you-type endpoint. That endpoint already loaded every
active client and their contracts on every keystroke (03-SUMMARY), so this is the
same cost class rather than a new one — but for a 12-stop manifest it is now
O(stops × facilities) per keystroke. If it bites, the fix is one option flag on
`ResolveOptions` to skip the stop counts when `clientQuery` is set. Recorded
rather than pre-optimised.

**Origin/pickup is not yet a stop.** `FACILITY_TYPE_FOR_ROLE.origin` exists and
is the mapping for it, but the ladder currently runs over `consignments` only.
The origin block becomes the first stop in Phase 5/7, and it will use the same
ladder and the same constant.

---

## Verification

### TypeScript — real output

```
$ cd apps/web && npx tsc --noEmit
WEB EXIT CODE: 0

$ cd apps/mobile && npx tsc --noEmit
MOBILE EXIT CODE: 0
```

Both silent. `packages/api-client` was rebuilt (`npx tsc` in that package, exit
0) before the mobile typecheck — same trap 01-, 02- and 03-SUMMARY flagged.

### Tests — `npx vitest run src/lib/document-import`

```
Per-pair fixture results (threshold 0.7):
   1  street-type abbreviation                    SILENT   -> SILENT    score 1.000  PASS
   2  directional abbreviation                    SILENT   -> SILENT    score 1.000  PASS
   3  same street, different number (spec trap)   NO_MATCH -> NO_MATCH  score 0.600  PASS
   4  same street, near number (spec trap)        NO_MATCH -> NO_MATCH  score 0.600  PASS
   5  suite added, same facility                  SILENT   -> SILENT    score 1.000  PASS
   6  dock designation, same facility             SILENT   -> SILENT    score 1.000  PASS
   7  ZIP+4 vs 5-digit                            SILENT   -> SILENT    score 1.000  PASS
   8  missing directional                         PROPOSE  -> PROPOSE   score 0.950  PASS
   9  conflicting directionals                    NO_MATCH -> NO_MATCH  score 0.400  PASS
  10  same street name, different city and state  NO_MATCH -> NO_MATCH  score 0.250  PASS
  11  misspelled street name                      PROPOSE  -> PROPOSE   score 0.905  PASS
  12  transposed street number                    NO_MATCH -> NO_MATCH  score 0.600  PASS
  13  highway designation variants                PROPOSE  -> PROPOSE   score 0.946  PASS
  14  highway alias vs local street name          PROPOSE  -> PROPOSE   score 0.767  PASS
  15  Saint abbreviation in city                  SILENT   -> SILENT    score 1.000  PASS
  16  all-caps OCR vs mixed case                  SILENT   -> SILENT    score 1.000  PASS
  17  punctuation and whitespace noise            SILENT   -> SILENT    score 1.000  PASS
  18  different numbered streets                  NO_MATCH -> NO_MATCH  score 0.354  PASS
  19  facility name prefix vs bare address        SILENT   -> SILENT    score 1.000  PASS
  20  co-located tenants, different building      NO_MATCH -> NO_MATCH  score 0.600  PASS
  21  PO Box vs street address                    NO_MATCH -> NO_MATCH  score 0.000  PASS
  22  ZIP typo, rest identical                    PROPOSE  -> PROPOSE   score 0.800  PASS
  23  postal city boundary variant                PROPOSE  -> PROPOSE   score 0.925  PASS
  24  spelled vs abbreviated state                SILENT   -> SILENT    score 1.000  PASS
  25  leading zero in number                      SILENT   -> SILENT    score 1.000  PASS
  26  same complex, different unit                NO_MATCH -> NO_MATCH  score 0.600  PASS
  27  N vs W on the Chicago grid                  NO_MATCH -> NO_MATCH  score 0.600  PASS
  28  OCR digit confusion 8 vs 3                  NO_MATCH -> NO_MATCH  score 0.600  PASS
  29  merged single line vs fielded               PROPOSE  -> PROPOSE   score 0.895  PASS
  30  external reference code prefix              PROPOSE  -> PROPOSE   score 0.934  PASS

 ✓ address.test.ts           (39)  <- new
 ✓ facility-ladder.test.ts   (16)  <- new
 ✓ facility-commit.test.ts   (12)  <- new
 ✓ matching · money · profiles · contract-create · rate-con-party · resumable ·
   document-date · hashing · lifecycle · merge · spreadsheet · upload ·
   extractor · service · materialise · pdf-render
 Test Files  19 passed (19)
      Tests  289 passed (289)
```

**Margins.** The tightest PROPOSE is pair 14 at 0.767 (threshold 0.70, +0.067);
the tightest NO_MATCH is the 0.600 cluster (−0.100). Neither sits on the line.

**Full web suite, measured against the baseline rather than assumed:**

| | Files failed | Tests failed | Tests passed | Total |
|---|---|---|---|---|
| Phase 1 close | 14 | 61 | 782 | 901 |
| Phase 2 close | 14 | 61 | 830 | 949 |
| Phase 3 close | 14 | 61 | 882 | 1001 |
| **Phase 4** | **14** | **61** | **992** | **1111** |

The failing set is byte-identical to all three prior phases — all pre-existing,
none in document-import. Passing rose by 110.

**Two existing test fakes were updated**, and it is worth naming why rather than
letting it look like churn: `resolveImport` now reads `carrierFacility` and
`facilityExternalReference` to compute the stop line, so the hand-built Prisma
fakes in `rate-con-party.test.ts` and `contract-create.test.ts` needed those two
models. Both return `[]`, which is the honest fixture — a tenant with no
facilities puts every stop on T4, which is correct and is not what those suites
assert on.

### Dependencies

```
$ git diff --stat package.json apps/*/package.json packages/*/package.json package-lock.json
(empty)
```

Nothing installed.

### Live-schema check (DEC-8 standing rule)

Run against **the spec's requirements for this phase**, not against what the code
writes — the distinction DEC-9 established, and it is what caught the 23514.

| Check | Result |
|---|---|
| `facility_external_references` — all 13 columns | present: `id · org_id · client_id · source_code · facility_id · resolved_via · source_import_id · source_name · confirmed_by_id · created_by_id · updated_by_id · created_at · updated_at`. **Nothing needed is missing, so nothing to stop and report.** |
| `facility_external_references_org_client_code_key UNIQUE (org_id, client_id, source_code)` | present — the upsert depends on it |
| **`facility_external_references_resolved_via_check`** | **`IN ('T1','T2','T3','T4')` — the 23514 above. Fixed and pinned by a test.** |
| `facilities_facility_type_check` | `terminal · yard · warehouse · drop_yard · customer_site · driver_residence` — confirms B1/DEC-1; `receiver`/`shipper` absent |
| `document_imports.resolution_provenance` | `jsonb`, nullable — the `stops` key needs no migration |
| RLS + FORCE RLS on `facilities` / `facility_external_references` / `document_imports` | all three: enabled, forced, 2 policies each |
| `app_user` grants on all three | SELECT, INSERT, UPDATE, DELETE on each |
| Every model queried is in `EXEMPT_MODELS` (DEC-11 rule) | yes — `CarrierFacility`, `FacilityExternalReference`, `DocumentImport`. No new model added. |

**No DDL was written or applied**, and that is a checked claim: no file under
`prisma/migrations/` was created or edited, and `schema.prisma` is untouched.

### Phase 4 verify table

| # | Check | Status |
|---|---|---|
| 1 | Import the same manifest twice → 2nd: zero taps, all silent | **Code path verified, not run.** Day 1 T4/T3 confirmation writes the reference; day 2 `loadExternalReferences` returns it and T1 fires before any address comparison. Tested at the unit level in both directions (`T1 — a stop resolved by a saved code…`), not end to end. |
| 2 | Read the fixture, add one hard case → all pass incl. the negatives | ✅ **Real.** 30/30 above, 11 of them negatives, plus 9 hard cases added in `address.test.ts` and 5 more in `facility-ladder.test.ts`. |
| 3 | Facility with a reformatted address → T2 silent, ext ref written | ✅ **Covered by tests.** `T2 — an address that normalises equal…` (abbreviations, ZIP+4, all-caps, spelled state, name prefix) and `T2 — commits the silent link and backfills…` assert the exact upsert. Not run against a live import. |
| 4 | Near-match facility → T3 proposes, cannot bypass | ✅ **Covered by tests**, three ways: the verdict has no `facilityId`, `autoLinkTarget` is null, and `ensureStopsCommitted` over an all-unmatched document calls `createFacility` zero times. |
| 5 | Check the DB → ext ref per confirmed match | **Argument verified, DB not inspected.** The upsert arguments are asserted for all three write paths and the column set and constraint are confirmed against production — but no row has been written to a real database in this session. |
| 6 | Grep the threshold number → appears in one file | ✅ **Real.** One line, `facility-constants.ts:38`. |

Checks 1 and 5 need a live import; 2, 4 and 6 are real now; 3 is real on the
logic and pending on the round trip.

---

## What Phase 5 needs from here

- `GET /[id]/stops` returns `StopSlotView[]` keyed by consignment index, which is
  the same index `findUncommittableConsignments` and `isCommitReady` already use.
- **If stop review reorders or edits stops, links follow correctly for free** —
  the fingerprint check drops a record whose consignment moved rather than
  re-binding it. Do not "fix" this by re-keying on position.
- `StopSlotView.persisted` is the flag to render honestly; do not collapse it
  into `state`.
- `StopResolutionList.tsx` is a pure render of a view it is handed, so Phase 5
  can wrap it with reordering and bulk notes without touching the ladder.
- **Phase 8 must call `ensureStopsCommitted`** before reading stop links, and
  `ensureContractCommitted` before reading `contractId` (quick-510's note).
- Audit **B4 is still open** and Phase 8 should not build a commit on top of it.

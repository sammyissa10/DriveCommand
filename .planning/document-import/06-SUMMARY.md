# Phase 6 — Route template matching and creation

**Spec:** `docs/specs/DocumentImport_TechnicalSpec_v1.md` Section 8, design rules Section 15
**Prior:** `00-AUDIT.md` · `01-`…`05-SUMMARY.md` · `DECISIONS.md` ·
`.planning/debug/doc-import-contract-client-guard.md` (quick-508/509/510) ·
`.planning/debug/doc-import-t1-not-firing-on-learned-refs.md` (quick-511) ·
`.planning/quick/512-…` · `.planning/quick/513-…`
**Branch:** `feature/document-import`
**Scope:** candidate selection, the scorer, the three presentations, application
and diff handling, the post-commit offer, auto-creation and its guard, and the
one-tap save. No end stop or optimisation (Phase 7), no commit (Phase 8).

---

## The shape of it

```
                       decideStops (Phase 4)          route_templates
                       resolved facility IDs           on contract,
                              |                        widened to client
                              v                              |
                     facilitySetForImport  <-----------------+
                              |
                              v
                      scoreFacilitySets      Jaccard, order ignored,
                              |              x0.8 when counts differ >30%
                              v
                          bandFor
             +----------------+----------------+
             |                |                |
          >= 0.75         0.45-0.75         < 0.45
          collapse        top 3 + diff     continue without
             |                |                |
             +----------------+----------------+
                              |
                   SELECTION            <- ensureTemplateCommitted
                   (one column)            (mutation boundary, quick-508 shape)
                              |
                   APPLICATION          <- applyTemplate
                   (rewrites the order)     always an explicit tap
                              v
              reviewed_extraction.consignments
            + resolution_provenance.template
            + resolution_provenance.stops (permuted)
```

Three properties carry the phase, and each is a lesson from an earlier round
rather than a preference.

1. **The scorer never sees a name.** `facilitySetForImport` reads `facilityId`
   and nothing else, so the phase's stated drift risk is closed by the shape of
   the input rather than by a comment asking nicely. Two dealerships called
   "RUSS DARROW HONDA" forty minutes apart is the case the facility ladder
   exists for, and the matcher does not undo its work.
2. **Nothing in a view path writes.** `buildTemplateSlot` loads, scores,
   describes, returns. The 0.75 collapse is displayed the moment it is derived
   and written the first time a mutation needs it — `persisted: false` says
   which is which, on the payload.
3. **Selection and application are two different things.** Collapsing the
   decision is one column; merging the template rewrites twelve stops. A card
   that displayed a template and silently reordered the running order on a GET
   would be the largest write-in-a-view-path in the module.

---

## What shipped

### Pure (no Prisma, no network, no clock)

| File | What it does |
|---|---|
| `template-constants.ts` | **NEW** both thresholds with the derivation of each, the >30% tolerance and its factor, the candidate cap, and the three `route_templates` CHECK vocabularies read off production. |
| `template-matching.ts` | **NEW** the id-set bridge, Jaccard + downweight, `bandFor`, ranking and the ambiguity refusal, the diff, the merge, the appointment arithmetic, `stopTypeForTemplate`, `templateStopsFrom`, `templateDrifted`. |

### Server

| File | What it does |
|---|---|
| `template-lookup.ts` | **NEW** read-only: contract-then-client candidate loading, `buildTemplateSlot` (the three presentations), `bestExistingScore` (the auto-create guard's predicate). Upstream of `resolution.ts`, so the dependency is a line and not a cycle. |
| `template-service.ts` | **NEW** and the only file in the phase that writes: `ensureTemplateCommitted`, `assignTemplate`, `declineTemplate`, `applyTemplate`, `saveImportAsRouteTemplate`, `runPostCommitTemplateStep`, `respondToTemplateOffer`. |
| `lib/carrier/route-template-save.ts` | **NEW**, and it is the *existing* save path — see below. |
| `actions/carrier/save-route-template.ts` | Body lifted out; now a ten-line wrapper. |
| `provenance.ts` | `TemplateProvenance` + `TemplateOfferRecord` + `templateProvenanceOf` + `stampTemplate`. A `template` key on the existing jsonb column. |
| `facility-lookup.ts` | `resolveStopDecisions` split out of `resolveStops`, so one run of the ladder feeds both the stop line and the template row. |
| `resolution.ts` | The `templateSlot()` stub is gone; the row is real. |
| `stop-review.ts` | Three fields on `StopReviewRow`, `skipped` on `StopPatch`, and skipped rows excluded from validation. |
| `handlers.ts` | +4 transport-neutral handlers, plus `skipped` on the stop patch with a boolean-only guard. |

**4 route files**, mirrored across both surfaces:
`GET|POST /[id]/template` · `GET|POST /[id]/template/offer`.

### `packages/validation`

Three additive keys on `consignmentSchema` — `templateOrigin`, `skipped`,
`templateStandingNotes` — plus `templateOriginEnum`. All on an existing jsonb
column. **No DDL.**

### Web UI

- `TemplateDecision.tsx` — the three presentations, the why, the ranked
  candidates with per-candidate stop diffs, the apply confirmation.
- `TemplateOfferCard.tsx` — the post-commit question.
- `ImportSummaryCard.tsx` — the stub row is replaced.
- `StopReviewRow.tsx` / `StopReviewScreen.tsx` — the New and Not-on-manifest
  badges and the keep/skip tap.

### Mobile

- `ImportTemplate.tsx` — the same three presentations and `ImportTemplateOffer`.
- `ImportResolution.tsx` — the stub row is replaced; a template write reloads
  the whole resolution.
- `StopReview.tsx` — the same badges and the same keep/skip tap.

### `packages/api-client`

11 new types, 3 new row fields, 1 new edit field, 6 new methods.

---

## The decisions that matter

### The two thresholds, and where each number comes from

**0.75 is fixed by the spec's own worked example.** Section 8 draws a 7-stop
template against an import sharing 6 facilities, union 8, and calls it 0.75 —
the loosest case anyone wants collapsed. One more difference is 5/8 = 0.625, a
route that changed enough to ask about. The comparison is `>=`, so the drawn
case collapses. A test reproduces it exactly.

**0.45 is a statement about halves.** Jaccard is bounded above by
`min/max`, so a score below 0.45 means the two sets cannot overlap on as much as
half the larger one however generously you read them. A ranked list of three of
those is worse than no list.

### The downweight cannot reach the collapse threshold, and that is arithmetic

Exceeding the 30% tolerance means `min/max < 0.7`, and Jaccard is bounded by
`min/max` — so a mismatched pair is already below 0.7 *before* the multiplier,
and no factor in `(0,1]` can push it back over 0.75. **A template with a
materially different stop count can never auto-collapse, whatever the factor
is.** Asserted over every shape up to 20×20 rather than argued.

So the factor's only real job is the 0.45 line, and 0.8 is pinned by two cases:

```
  template 6 stops, today 10, all 6 present   J = 0.60  ->  0.48   OFFER
      four new stops on a known run — exactly "append, badged New"

  template 5 stops, today 10, all 5 present   J = 0.50  ->  0.40   DO NOT
      half of today is unaccounted for; that is a different run
```

Any factor in `(0.75, 0.9)` separates them; 0.8 sits in the middle rather than on
an edge. A multiplier rather than a subtraction, so a strong match with a count
mismatch still outranks a weak one — which is what makes the list an ordering.

### An unresolved stop counts as a member that cannot match

The single most consequential line in the scorer, and it is stated because the
obvious alternative is wrong. Dropping unresolved stops from the set means a
manifest that resolved four-and-four, against a four-stop template covering
exactly those four, scores **1.0 and collapses** — the card saying "this is last
week's run" about a run it has seen half of. Each unknown therefore contributes
`unresolved:<index>`, which can never intersect, and the honest answer is 4 of 8.

The synthetic key is built at the bridge, not inside the scorer, so
`scoreFacilitySets` really is "Jaccard over two id lists" as Section 8 specifies.

### Selection auto-collapses; application never does

Section 8 says the template "collapses into the summary card" at 0.75. That is a
claim about *which* template. Applying one supplies order, windows, documents
and standing notes — it rewrites the running order, adds rows and appends
others. Reading "collapse" as "apply" would put the module's biggest write on a
GET.

So `ensureTemplateCommitted` commits the *selection* at the mutation boundary,
composing `ensureContractCommitted` (which composes `ensureClientCommitted`), so
one call commits all three slots in the right order — the quick-508/510 shape,
unchanged. `TemplateProvenance.appliedAt` stays null until a person taps **Use
this template**, so the two states are distinguishable on the row rather than
inferred from it.

**Phase 8's commit must call `ensureTemplateCommitted`** before reading
`record.routeTemplateId`, for the same reason quick-510 recorded for the
contract. The requirement is in the function's own doc comment.

### The import wins the appointment window. Stated, not glossed.

Three of the template's four supplied fields are ones the import cannot have —
there is no running order on a document, extraction never writes
`requiredDocuments`, and a standing note is by definition not today's. For those
the split is simply "the template fills them" and nothing is at risk.

**Appointment is the one field both sides can carry, and a literal reading of
"template supplies appointment windows" would overwrite it.** A window printed
on today's manifest is a fact a customer agreed to; the template's offset is a
habit. Silently replacing the first with the second changes a delivery time
nobody asked to change, invisibly, on the stop most likely to have a firm
window. The template fills an **empty** window; the ones it left alone are
counted and reported in the confirmation as `windowsKept`.

The standing note goes to its own key for the same reason: one field holding
both would make application destructive the moment a dispatcher had typed
anything.

### A template-only stop carries no facility provenance, deliberately

Its name and address are copied from the facility itself, so keeping it resolves
at **T2 — "Address match"** on the next read, which is *literally* what
happened. The alternative was a fifth `StopProvenanceVia`, which would have
rippled through the tier map, the why labels and the api-client mirror, and
would have made every earlier build treat the value as absent
(`slotProvenance` drops an unrecognised via). One less vocabulary, and the "why"
stays true.

### `route_template_stops` admits FOUR stop types. `stops` admits five.

The DEC-14 finding of this phase, read off production before a line was written:

```
route_template_stops_stop_type_check
  CHECK (stop_type IN ('pickup','delivery','fuel_stop','layover'))

stops_stop_type_check
  CHECK (stop_type IN ('pickup','delivery','fuel_stop','layover','relay_handoff'))
```

**`relay_handoff` is legal on one and illegal on the other.** Phase 5 lets a
dispatcher set it — correctly, because the trip-stop commit target admits it —
and saving that list as a template without a guard is a Postgres 23514 on the one
row that carried it, at the end of a multi-statement write, on the success
screen. `stopTypeForTemplate` narrows it and the caller counts how many it had
to; a test pins the two lists apart so a future edit cannot unify them.

It degrades rather than throwing: refusing to save a whole template because one
stop is a relay handoff is a worse answer than saving it with that stop as a
delivery, which is what the template's vocabulary can express.

Also read and honoured: `schedule_type ∈ fixed_days|frequency|on_call` and
`equipment_type ∈ dry_van|flatbed|reefer|tanker|step_deck|other`. An auto-created
template takes `on_call` and `other`, the two values that claim nothing —
`dry_van` would be right most of the time, which is exactly what makes it
dangerous, because a reefer load defaulted to a dry van is a claim nobody
checked.

### The save path was lifted, not forked

`saveRouteTemplate` was a `'use server'` action reading a session cookie and a
header-scoped Prisma client — neither of which exists on `/api/mobile/*`
(DEC-11). Its body moved verbatim to `lib/carrier/route-template-save.ts`
(same validation order, same messages, same transaction, same delete-then-
recreate edit strategy) and the action is now a wrapper over it. Same shape
Phase 4 used when it needed `createFacility` from a header-less context. There
is one place a template gets written, and the Templates screen and document
import are both callers of it.

### "Offered once, never silent" is stored, not derived

An import whose trip differs from its template looks identical whether the
dispatcher was asked and declined or was never asked. Without
`TemplateOfferRecord` the offer either nags on every visit or is skipped, and
both are worse than asking once. The record is written by the commit step, not
by someone opening the screen — which is the half that makes it *never silent*.

### The auto-create guard uses the same predicate as the collapse

Section 8: *"skip creation when the stop set already scores above 0.75 against an
existing template."* Same sentence, so `bestExistingScore` calls the same
`rankTemplates`/`bandFor` the card does. A second definition of "already
covered" that happened to use the same number is exactly how the guard quietly
stops guarding, which the phase names as its other drift risk.

`runPostCommitTemplateStep` sits **outside** the commit transaction and swallows
every failure with a log. Creating a template is not part of committing a trip,
and a template write that failed must never roll back a trip a driver is waiting
on — the same trade `attachSourceDocument` makes under DEC-13.

---

## Per-item audit of the Phase 6 prompt

Written against the prompt text item by item, not from memory of the work
(DEC-9's standing rule).

| # | Item | Verdict |
|---|---|---|
| 1 | Candidate selection: contract, widened to client, widened visibly labelled | **IMPLEMENTED** |
| 2 | Scoring exactly as specified, thresholds in one constants file, tests import the constants | **IMPLEMENTED** |
| 3 | Presentation: collapse / top 3 with diffs / continue-without; Section 15 throughout | **IMPLEMENTED** |
| 4 | Application and diff handling per the diagram; mutation through the commit-boundary functions; template provenance | **IMPLEMENTED** |
| 5 | Post-commit offer to update the template when the trip differed, once, never silent | **PARTIALLY** — built end to end and reachable on `COMMITTED`; no commit exists to fire it. See below. |
| 6 | Auto-creation gated on `autoCreateRouteTemplatesFromImports`, source import ref, Suggested section, near-duplicate guard | **PARTIALLY** — same reason; the guard and the creation are real and unit-reachable, the trigger is Phase 8's. See below. |
| 7 | One-tap Save as route template on the commit success screen when the setting is off | **PARTIALLY** — same reason. See below. |
| 8 | Unit tests for the scorer, five named properties | **IMPLEMENTED** |

### 1 — IMPLEMENTED

`loadTemplateCandidates` queries `(orgId, clientId, active: true, contractId)`
first and falls through to the client only when that returns nothing. Widening
is a fallback for the empty case, never a merge — a client with a Chicago
contract and a Milwaukee contract runs two different sets of docks, and offering
the Milwaukee templates against a Chicago manifest is how a dispatcher applies
an order for the wrong lane.

`widened` rides on **every candidate**, not only on the batch, because it is a
property of that row that has to render next to its name: `Other contract` as an
`outline` badge on web and a neutral chip on mobile, plus a sentence above the
list. Words, not colour.

Inactive templates are excluded, the same exclusion `loadFacilityCandidates`
applies to soft-deleted facilities and for the same reason.

The client is the **effective** client via `resolveEffectiveClientId`
(quick-511), never `record.clientId` — that column is null on exactly the day-two
import this phase exists for, and scoping candidates by it would return an empty
list every time.

### 2 — IMPLEMENTED

Facilities resolved first (`decideStops`), then Jaccard over the id sets,
ordering ignored, weighted down past 30%. Both thresholds and both tuning
numbers are in `template-constants.ts` with the derivation of each.

**Verified by grep**, not asserted:

```
$ grep -rn "TEMPLATE_AUTO_APPLY_THRESHOLD *=\|TEMPLATE_CANDIDATE_THRESHOLD *=" apps/web/src/lib
template-constants.ts:39:export const TEMPLATE_AUTO_APPLY_THRESHOLD = 0.75;
template-constants.ts:55:export const TEMPLATE_CANDIDATE_THRESHOLD = 0.45;
```

Every other occurrence of `0.75` or `0.45` under `lib/document-import`,
`components/carrier/imports` and `apps/mobile/components/imports` is **prose in a
comment**, with two exceptions in the test file that are the *arithmetic* under
test rather than the tuned number — `expect(score.jaccard).toBe(6 / 8)`, written
as a fraction, and `expect(score.union).toBe(8)`. The score itself is asserted
against the imported constant. (`facility-constants.ts` has an unrelated
`numberedStreet: 0.45` penalty from Phase 4 — a coincidence of value, not a
restatement.)

Tests import `TEMPLATE_AUTO_APPLY_THRESHOLD`, `TEMPLATE_CANDIDATE_THRESHOLD`,
`TEMPLATE_STOP_COUNT_TOLERANCE`, `TEMPLATE_COUNT_MISMATCH_FACTOR`,
`TEMPLATE_MAX_CANDIDATES` and `ROUTE_TEMPLATE_STOP_TYPES`.

### 3 — IMPLEMENTED

One `switch` on `bandFor`, server-side. Neither surface compares a score to a
number; both receive `state` and render it. `slot.thresholds` is on the payload
only so copy can *say* a number it was given.

- **≥ 0.75** — one row, the template name, the diff note, and a `why` carrying
  the score, the matched template and the arithmetic in words ("6 of 8
  facilities in common"). Section 4.2 asks for the matched text and the score;
  both are there, plus an honest line when the selection is not yet persisted.
- **0.45–0.75** — up to three, ranked, each with `scorePercent`, its stop count,
  its diff note, a chip list of the actual differing stops (`+ Wilde Honda`,
  `− Hall Ford`), and a line when the score was weighted down.
- **< 0.45** — one sentence and `Continue without a template`. Nothing else is
  offered.

**Section 15, item by item.** No borders — every surface is `bg-muted/40` on web
and `surfaceElevated` on mobile; rows separate by contrast. One accent on one
primary action — the only `variant="default"` in `TemplateDecision` is the
single **Use this template**, and the only `c.brand` fill on mobile is its twin;
Continue-without, Change and Look-again are all `ghost`/plain. Spacing on
8/12/16/20/24 (Tailwind 2/3/4/5/6; the mobile `spacing` token is exactly that
scale). Status is colour + icon + text. **Red only for errors** — the New badge,
the Not-on-manifest badge, Suggested and Other-contract are all `outline` or
`secondary`, which is Section 15's own named example. Identical field order
between the two surfaces. Text never clips: `truncate` + `title` on web,
`numberOfLines` on mobile.

**quick-513's lesson, applied.** Every actionable thing is a real control.
Candidate rows are `<button>`/`Pressable` with **no interactive descendants** —
the badges inside them are inert `Badge` divs and `Chip` views, so there is
nothing to nest. The keep/skip affordance on a stop row is a real `<button>`
carrying `relative` (so it paints above quick-513's overlay) and
`stopPropagation` (so keeping a stop does not also open it). Nothing on these
screens is a `div` with a click ambition.

### 4 — IMPLEMENTED

`applyTemplateToConsignments` implements Section 8's box exactly:

- **Matched** rows take the template's sequence, its appointment windows (into
  an empty window only — see above), its required documents and its standing
  note. `totals`, `lineItems`, `references` and `notes` are **untouched**, which
  is the whole value of day two.
- **Import-only** rows are appended at the end in document order, badged `New`,
  and draggable — the existing dnd-kit list on web, the existing arrows on
  mobile. They are *not* slotted in near a neighbour: where a new stop belongs
  is a routing decision and Section 8 says the user makes it.
- **Template-only** rows are included in their template position, badged
  `Not on today's manifest`, `skipped: true`, with a one-tap **Keep this stop**.
  A skipped row is excluded from validation (a block nobody can clear is worse
  than no check) and from any template saved off this list.

**Application routes through the commit-boundary functions.** `applyTemplate`
opens with `ensureTemplateCommitted` then `ensureStopsCommitted`, so the silent
T1/T2 links are real rows before the merge moves them.

**Facility links move with their stops**, carried to their new key with the
`stopFingerprint` **untouched** — so a link that was already stale is still
dropped after the merge. Same argument and same code shape as Phase 5's reorder,
and tested directly.

**Template provenance** records `via`, `score` and `templateId` (plus
`templateName`, `appliedAt` and the offer), under `resolution_provenance.template`.
**No new column.**

No stop is reordered beyond the template's own order. Nothing is sorted,
optimised or tidied — that is Phase 7, it is a suggestion there and never a
mutation.

### 5 — PARTIALLY

`runPostCommitTemplateStep` computes drift (`templateDrifted` over the ordered
facility ids, so a reorder counts and a quantity change does not), records the
offer once, and never overwrites an existing record. `getTemplateOffer` reads
it, `respondToTemplateOffer` answers it and stamps `respondedAt` so it is never
asked twice, and `UPDATED` rewrites the template's stops through the same
`saveRouteTemplateCore` in edit mode. `TemplateOfferCard` and
`ImportTemplateOffer` render it on both surfaces and are wired to the
`COMMITTED` status.

**What is missing is the caller, because there is no commit in this codebase.**
`runPostCommitTemplateStep` has no call site today, exactly as
`ensureContractCommitted` had none when quick-510 wrote it — wiring it into a
path that does not need it would be a write nobody asked for. The requirement is
in the function's own doc comment in capitals, where it will be looked for. The
UI is data-driven rather than flag-driven, so it lights up the moment Phase 8
calls it, without either component changing.

Named as a gap rather than counted as done.

### 6 — PARTIALLY

The tenant setting **already exists and was verified live** —
`Tenant."autoCreateRouteTemplatesFromImports" boolean NOT NULL DEFAULT false`,
read off production 2026-08-07. No DDL, and nothing to stop and report.
(Note the column is camelCase in a PascalCase table, `"Tenant"`, like every
other Tenant column — the same read-don't-infer trap as Phase 5's `"bolRequired"`.)

Everything else is built: `tenantAutoCreates` reads it, `writeTemplateFromImport`
creates with `sourceImportId: record.id` and `isSuggested: true`, the name comes
from `groupLabel + client + date` as Section 8 asks, and the guard skips
creation when `bestExistingScore(...).band === 'AUTO'` using the identical
predicate as the collapse.

`isSuggested` and `sourceImportId` are real columns with a real
`@@index([orgId, isSuggested])`, so a Suggested section is a filter on the
existing template list.

**Two gaps, both named.** The trigger is Phase 8's, as in item 5. And **the
Templates screen does not yet render a separate "Suggested templates"
section** — `listRouteTemplates` returns suggested and hand-built rows together,
ordered by `createdAt`. The data to split them is on every row and the index for
it exists; the list UI change was not made, because that screen is outside this
phase's surface and changing how the Templates page groups its rows on the
strength of a feature that cannot yet fire would be building ahead. Stated as
the remaining work rather than implied to be done.

### 7 — PARTIALLY

`saveImportAsRouteTemplate` is built, exposed at
`POST /[id]/template/offer { action: 'save' }`, and rendered as one tap on both
surfaces with an honest result line that names what was left out
(`skippedUnresolved`, `skippedNotToday`). `isSuggested: false` — a human asked
for this one, so it belongs with the hand-built templates; "Suggested" exists to
quarantine rows nobody chose.

**"When the setting is off" is enforced server-side, not in the component:**
`runPostCommitTemplateStep` records a save-as offer only on the `!autoCreate`
branch, so the card has nothing to render when the setting is on.

Same gap as 5 and 6 — the commit success screen is Phase 8's.

### 8 — IMPLEMENTED

`template-matching.test.ts`, **57 tests**. Every property the prompt names:

| Property | Where |
|---|---|
| Hand-checkable Jaccard on both sides of 0.75 | `6/8 = 0.75 → AUTO` and `5/8 = 0.625 → CANDIDATE` |
| Hand-checkable Jaccard on both sides of 0.45 | `4/6 ×0.8 = 0.533 → CANDIDATE` and `3/7 = 0.4285 → NONE` |
| The >30% downweight | fires past the tolerance, **does not fire at exactly 0.3** (the rule is "more than"), multiplies rather than subtracts, is symmetric, and **can never reach AUTO** — asserted over every shape up to 20×20 |
| Order-insensitivity | forwards, backwards and shuffled all score identically, on a full match and a partial one |
| **Scores on IDs, not names** | two facilities with **identical names and different ids** intersect once, not twice — and the diff names the right one as extra. Plus the converse: one building printed two ways scores 1.0 |

Plus the boundaries (`bandFor` is inclusive at both constants), duplicate
collapse, the empty-template division-by-zero, unresolved-stop handling, the
ambiguity refusal, the diff's one-to-one claiming, the whole merge (order
applied, quantities/references/notes preserved, windows filled vs kept vs
unavailable, appended at the end, template-only skipped, provenance carried),
the appointment arithmetic including day and month carry, `templateStopsFrom`'s
exclusions, and **the two stop-type vocabularies pinned apart**.

### Constraints

| Constraint | Verdict |
|---|---|
| Do not reorder stops automatically on application | **IMPLEMENTED** — matched rows take the template's sequence, new rows go to the end in document order, template-only rows hold their template position. Nothing is sorted or optimised. Tested. |
| Reuse the existing route template save path, do not fork it | **IMPLEMENTED** — the action's body was lifted into `route-template-save.ts` and the action now calls it. One save path, two callers. |
| Install nothing | **IMPLEMENTED** — `git diff --stat` over every `package.json` and the lockfile is empty. |
| No DDL | **IMPLEMENTED** — no migration written, `schema.prisma` byte-unchanged (`git status --porcelain apps/web/prisma` empty), drift scan reports **0 missing columns**. Nothing needed was missing, so there was nothing to stop and report. |
| Money stays Decimal | **IMPLEMENTED** — nothing in this phase is money. No `parseFloat` on a currency value was introduced; `baseRate` and `totalRate` are untouched by every path here. |
| Rebuild `packages/api-client` dist before the mobile typecheck | **IMPLEMENTED** — and it bit again: the first mobile run failed with 8 errors, all from the three new `StopReviewRow` fields and `StopEditInput.skipped` missing from the mirror. `packages/validation` needed the same, and failed the *web* typecheck first with 5 errors. |
| No writes in any view path | **IMPLEMENTED** — `template-lookup.ts` has no `update` of any kind; every write is in `template-service.ts`, in seven exported functions, all reachable only from POST. |
| Commits at mutation boundaries | **IMPLEMENTED** — `ensureTemplateCommitted` composes `ensureContractCommitted` composes `ensureClientCommitted`. |
| Provenance recorded truthfully at write time; extend `resolution_provenance` | **IMPLEMENTED** — a `template` key on the existing jsonb column. `score` is recomputed server-side from the same scorer and never taken from the request. `persisted`/`applied` are rendered honestly on both surfaces. |
| Ladder/matching context derives its effective client via the shared resolver | **IMPLEMENTED** — `loadContext` and `resolveImport` both call `resolveEffectiveClientId`; `record.clientId` is read nowhere in this phase. |
| Anything actionable is a real control | **IMPLEMENTED** — every affordance is a `<button>`/`Pressable`; the pressable candidate rows contain no interactive descendants. |
| Read `pg_constraint` before writing enum-ish columns | **IMPLEMENTED** — four CHECKs read off production before the code was written, and one of them (`relay_handoff`) was a real 23514 avoided. |

---

## Not done, and why

**The commit, and therefore the trigger for items 5, 6 and 7.** Phase 8's. All
three are built, routed, rendered and reachable; none can fire yet. Marked
PARTIALLY rather than IMPLEMENTED.

**A separate "Suggested templates" section on the Templates screen.** See item 6.
The columns and the index exist; the list UI was not changed.

**Mobile drag for the appended New stops.** They are draggable on web and use
Phase 5's arrows on mobile, because `react-native-gesture-handler` is still not
installed and this phase installs nothing. Unchanged from 05-SUMMARY's finding.

**Appointment windows on the template are offsets from a departure time the
template may not have.** When `scheduledDepartureTime` is null the windows are
not applied and `windowsUnavailable` says so on both surfaces. Inventing a
departure time would invent an appointment.

**No live-import verification.** None of the phase's six verify-table checks has
been run against a real import — no S3 credentials and no test manifest in this
session. What each rests on is set out below, honestly labelled. Same position
Phases 2, 3, 4 and 5 closed in.

**The resolution view got more expensive again.** `resolveImport` now issues one
more query (the candidate templates) — but **only when the client and the
contract are both RESOLVED**, which is never true on the client picker's
search-as-you-type endpoint. So the keystroke cost 04-SUMMARY flagged is
unchanged. Recorded rather than pre-optimised.

**`applyTemplate` runs the ladder twice** — once inside `ensureStopsCommitted`
and once to build its context. Same shape, and same size, as the double run
05-SUMMARY recorded for every stop mutation.

---

## Verification

### TypeScript — real output

```
$ cd apps/web && npx tsc --noEmit
npm warn config ignoring workspace config at C:\Users\sammy\Projects\DriveCommand\apps\web/.npmrc
WEB EXIT CODE: 0

$ cd apps/mobile && npx tsc --noEmit
MOBILE EXIT CODE: 0
```

Both silent. `packages/validation` and `packages/api-client` were rebuilt
(`npx tsc` in each, exit 0) before the typechecks — the trap 01- through
05-SUMMARY flagged, and it bit twice more this phase.

### Tests — `npx vitest run src/lib/document-import`

```
 ✓ src/lib/document-import/__tests__/stop-review.test.ts (32 tests) 66ms
 ✓ src/lib/document-import/__tests__/address.test.ts (40 tests) 39ms
 ✓ src/lib/document-import/__tests__/facility-ladder.test.ts (18 tests) 54ms
 ✓ src/lib/document-import/__tests__/merge.test.ts (20 tests) 19ms
 ✓ src/lib/document-import/__tests__/lifecycle.test.ts (29 tests) 14ms
 ✓ src/lib/document-import/__tests__/template-matching.test.ts (57 tests) 39ms   <- new
 ✓ src/lib/document-import/__tests__/extractor.test.ts (26 tests) 31ms
 ✓ src/lib/document-import/__tests__/spreadsheet.test.ts (17 tests) 188ms
 ✓ src/lib/document-import/__tests__/service.test.ts (22 tests) 116ms
 ✓ src/lib/document-import/__tests__/facility-effective-client.test.ts (9 tests) 25ms
 ✓ src/lib/document-import/__tests__/hashing.test.ts (21 tests) 12ms
 ✓ src/lib/document-import/__tests__/facility-commit.test.ts (12 tests) 32ms
 ✓ src/lib/document-import/__tests__/matching.test.ts (16 tests) 11ms
 ✓ src/lib/document-import/__tests__/profiles.test.ts (6 tests) 6ms
 ✓ src/lib/document-import/__tests__/money.test.ts (7 tests) 24ms
 ✓ src/lib/document-import/__tests__/upload.test.ts (6 tests) 6ms
 ✓ src/lib/document-import/__tests__/contract-create.test.ts (9 tests) 74ms
 ✓ src/lib/document-import/__tests__/rate-con-party.test.ts (15 tests) 23ms
 ✓ src/lib/document-import/__tests__/resumable.test.ts (5 tests) 4ms
 ✓ src/lib/document-import/__tests__/document-date.test.ts (8 tests) 17ms
 ✓ src/lib/document-import/__tests__/materialise.test.ts (8 tests) 3648ms
 ✓ src/lib/document-import/__tests__/pdf-render.test.ts (7 tests) 3966ms

 Test Files  22 passed (22)
      Tests  390 passed (390)
```

**Full web suite, measured against the baseline rather than assumed:**

| | Files failed | Tests failed | Tests passed | Total |
|---|---|---|---|---|
| Phase 1 close | 14 | 61 | 782 | 901 |
| Phase 2 close | 14 | 61 | 830 | 949 |
| Phase 3 close | 14 | 61 | 882 | 1001 |
| Phase 4 close | 14 | 61 | 992 | 1111 |
| Phase 5 close | 14 | 61 | 1036 | 1155 |
| **Phase 6** | **14** | **61** | **1093** | **1212** |

The failing set is byte-identical to all five prior phases — all pre-existing,
none in document-import. Passing rose by exactly 57, which is exactly the new
tests.

**One existing test fake was updated, and it is worth naming rather than letting
it look like churn.** `contract-create.test.ts`'s hand-built Prisma fake gained
`routeTemplate: { findMany: async () => [] }`, because `resolveImport` now reads
that model once the client and contract resolve. `[]` is the honest fixture — a
tenant with no saved routes gets the "nothing looks like today's run" band, which
is correct and is not what that suite asserts on. Identical in kind to the two
fakes Phase 4 had to extend. **No test assertion was changed.**

### Dependencies

```
$ git diff --stat package.json apps/*/package.json packages/*/package.json package-lock.json
(empty)
```

Nothing installed.

### Live schema check against production (DEC-8 / DEC-9 standing rule)

Run against **the spec's requirements for this phase**, not against what the code
writes — the distinction that caught the 23514 in Phase 4, and it earned its keep
again.

| Check | Result |
|---|---|
| **`Tenant."autoCreateRouteTemplatesFromImports"`** | **present** — `boolean NOT NULL DEFAULT false`. Item 6's setting exists; **no DDL needed and nothing to stop and report.** Note the table is `"Tenant"` (PascalCase) and the column is camelCase, unlike its snake_case neighbours elsewhere. |
| `route_templates` — `source_import_id`, `is_suggested`, `last_applied_at`, `application_count`, `end_stop_policy` | all present (Phase 1) |
| `route_templates` FK `source_import_id → document_imports(id) ON DELETE SET NULL` | present |
| `document_imports.route_template_id` | `uuid`, nullable — present |
| `document_imports.resolution_provenance` | `jsonb`, nullable — the `template` key needs no migration |
| **`route_template_stops_stop_type_check`** | **`IN ('pickup','delivery','fuel_stop','layover')` — FOUR, not five. `relay_handoff` is admitted by `stops` and REJECTED here.** Guarded by `stopTypeForTemplate`; a test pins the two lists apart. |
| `route_templates_schedule_type_check` | `fixed_days · frequency · on_call` — auto-create writes `on_call` |
| `route_templates_equipment_type_check` | `dry_van · flatbed · reefer · tanker · step_deck · other` — auto-create writes `other` |
| `route_templates_end_stop_policy_check` / `Tenant_defaultEndStopPolicy_check` | both `RETURN_TO_ORIGIN · HOME_BASE · DESIGNATED_PARKING · DRIVER_RESIDENCE · NONE` — Phase 7's, not written here |
| `route_template_stops_route_template_id_sequence_order_key UNIQUE` | present — which is why `templateStopsFrom` closes gaps rather than leaving holes |
| `route_template_stops` — every column the save path writes | all present |
| `RouteTemplate` / `RouteTemplateStop` / `Tenant` in `EXEMPT_MODELS` (DEC-11 rule) | yes, all three — so every `where` carries `orgId` explicitly |
| **`full-schema-drift-scan.ts` against production** | **94 models scanned · 0 columns missing in DB · 0 missing tables.** The 78 "extra" columns are all `USER-DEFINED` Postgres enum types the scanner cannot map, unchanged from the Phase 4 and 5 runs and unrelated to this phase. |

**Drift: none.** No column this phase needs is missing.

**No DDL was written or applied**, and that is a checked claim:
`git status --porcelain apps/web/prisma` is empty and `schema.prisma` is
byte-unchanged. The drift scan rewrites its own draft SQL file as a side effect;
that artefact was reverted and is not in the commit.

### Phase 6 verify table

| # | Check | Status |
|---|---|---|
| 1 | Compute one score by hand → system matches | ✅ **Real.** The spec's own 7-vs-8 example: intersection 6, union 8, 0.75, collapse. Asserted term by term, not just on the result. |
| 2 | 0.9 / 0.6 / 0.2 → collapse / 3 shown / none | ✅ **Real at the unit level.** `1.0` and `0.75` collapse; `0.625` and `0.533` land in CANDIDATE; `0.4285` and `0.4` fall to NONE. `topCandidates` is capped at `TEMPLATE_MAX_CANDIDATES`. Not exercised in a browser. |
| 3 | Apply a template → order kept, quantities correct | ✅ **Covered by tests.** Template order applied over a differently-ordered document, with `totals`, `references` and `notes` asserted unchanged. Not run end to end. |
| 4 | Extra stop, missing stop → New at end / skipped badge | ✅ **Covered by tests.** Import-only appended last with `templateOrigin: 'IMPORT_ONLY'`; template-only kept in place with `skipped: true`. Both badges render off those two fields on both surfaces. |
| 5 | Setting on, near-match set → **no duplicate template** | **Argument verified, not run.** The guard calls `bestExistingScore` and returns before `writeTemplateFromImport` when the band is `AUTO` — the same predicate as the collapse, and `bandFor` is directly tested. **The whole path needs a commit, which does not exist**, so no template has been auto-created in this session. This is the check most in need of a live run once Phase 8 lands. |
| 6 | Grep 0.75 and 0.45 → one file | ✅ **Real.** Two declarations, both in `template-constants.ts`. Full grep output above; every other hit is prose or test arithmetic. |

Checks 1, 2, 4 and 6 are real now; 3 is real on the logic and pending on the
round trip; 5 needs Phase 8.

---

## What Phase 7 needs from here

- **`ensureTemplateCommitted` must be called by Phase 8's commit** before reading
  `record.routeTemplateId`, alongside `ensureContractCommitted` and
  `ensureStopsCommitted`. The doc comment says so.
- **`runPostCommitTemplateStep(orgId, userId, importId)` must be called by Phase 8
  after the commit transaction succeeds, outside it.** It is all three of Section
  8's post-commit behaviours in one function, and it swallows its own failures
  so it can never roll back a trip.
- **`route_templates.end_stop_policy` and `Tenant."defaultEndStopPolicy"` both
  exist and both have a CHECK admitting Section 9's five policies exactly.**
  Phase 7 needs no DDL for the end stop; the resolution order (tenant default →
  template override → per-trip) maps onto columns that are already there.
- **The running order after application is still `reviewed_extraction.consignments`
  array order**, and `skipped` rows are in it. Phase 7's optimiser must exclude
  them, and Phase 8's commit must not create stops for them.
- `templateStandingNotes` is the template's note and `notes` is the import's.
  Phase 8 commits the second to `stops.notes`; the first belongs to the template.
- **`stops.stop_type` admits five values and `route_template_stops.stop_type`
  admits four.** Do not unify them.
- Audit **B4 is still open** (`CarrierFacility` has no `active` column;
  `softDeleteFacility` writes a type the CHECK rejects). Unchanged by this phase.

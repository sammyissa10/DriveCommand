# Phase 5 — Stop review, with bulk apply

**Spec:** `docs/specs/DocumentImport_TechnicalSpec_v1.md` Section 10, design rules Section 15
**Prior:** `00-AUDIT.md` · `01-`/`02-`/`03-`/`04-SUMMARY.md` · `DECISIONS.md` ·
`.planning/debug/doc-import-contract-client-guard.md` (quick-508/509/510/511)
**Branch:** `feature/document-import`
**Scope:** the stop list, the detail editor, bulk apply, blocking validation, and
making **Review stops** live on both surfaces. No template matching (Phase 6), no
optimisation (Phase 7), no commit (Phase 8).

---

## The shape of it

```
                          reviewedExtraction.consignments
                                     |
   GET /stops/review  ---------------+---------------  decideStops (Phase 4)
        read-only                    |                  re-derived every read
                                     v
                          buildStopReview
                          rows · rollups · blocks · warnings
                                     |
        +----------------------------+----------------------------+
        |                            |                            |
   POST /order                 PATCH /review                POST /bulk
   full permutation            one stop, one edit           SELECTION[] -> fields
        |                            |                            |
        +----------------------------+----------------------------+
                                     |
                            ensureStopsCommitted     <- every mutation opens here
                                     v
                    reviewedExtraction  +  resolution_provenance.stops
```

Three properties carry the phase, and each is the answer to something the phase
itself said usually goes wrong.

1. **Bulk apply cannot see a viewport.** `applyBulkToStops` takes `number[]` and
   maps over the whole consignment array. There is no rendered-row list anywhere
   below the component layer to accidentally intersect with, on either surface.
   Phase 5's stated drift risk — "bulk apply hitting only visible rows" — is
   closed by the shape of the request, not by a component being careful.
2. **Reorder is persistence, not local state.** The order lives in
   `reviewed_extraction.consignments`, and the array order IS the running order
   — the same construction Phase 2 used for `sourceFileKeys`. Leave the page,
   come back, the order is there. The optimistic move in the UI is reverted on
   failure and can never silently stick.
3. **Nothing in a view path writes.** `getStopReview` loads, decides, describes,
   returns. It does not commit the silent T1/T2 links it displays and it does not
   initialise `reviewedExtraction`. Every mutation opens with
   `ensureStopsCommitted`, exactly as Phase 4 requires and quick-508/510
   established.

---

## What shipped

### Pure (no Prisma, no network, no clock)

| File | What it does |
|---|---|
| `stop-review.ts` | **NEW** rollups from line items with a per-field override mark · the Section 10 block/warning validator · `applyStopPatch` · `applyBulkToStops` · `reorderConsignments` · `restampStopLink` · `assertPermutation`. |

### Server

| File | What it does |
|---|---|
| `stop-review-service.ts` | **NEW** and the only file in the phase that writes: `getStopReview` (read-only), `reorderStops`, `updateStop`, `bulkApplyStops`. |
| `handlers.ts` | +4 transport-neutral handlers, plus boundary validation of every enum-ish value against the live CHECK vocabularies. |

**6 route files**, mirrored across both surfaces:
`GET|PATCH /[id]/stops/review` · `POST /[id]/stops/order` · `POST /[id]/stops/bulk`.

### `packages/validation`

Four additive keys on `consignmentSchema` — `stopType`, `requiredDocuments`,
`overriddenTotals`, `bulkAppliedFields` — plus their enums. All on an existing
jsonb column. **No DDL.**

### Web UI

- `StopReviewScreen.tsx` — the screen: dnd-kit list, selection, mutations, the
  one dismissible warning summary, the single primary action with its reason.
- `StopReviewRow.tsx` — one row, exactly the five things Section 10 draws.
- `StopDetailEditor.tsx` — all eleven fields, one `FIELDS` array driving both modes.
- `StopBulkBar.tsx` — the bar and its confirmations.
- `TruncatedText.tsx` — truncate, full value on tap.
- `StopResolutionList.tsx` — `StopDecision` **exported** as `StopFacilityDecision`
  and `StopStatus` exported, so the review screen reuses them rather than
  redrawing the hard rule and the badge palette.
- `ImportSummaryCard.tsx` — **Review stops** is live and links to the new page.

### Mobile

- `app/(owner)/imports/review/[id].tsx` — the route.
- `components/imports/StopReview.tsx` — list, bulk bar, detail sheet, same field
  order, same eleven fields.
- `ImportResolution.tsx` — **Review stops** is live and navigates.

### `packages/api-client`

16 new types and 4 new methods. Also **9 Phase 4 types that had never been added
to the package index** — see below.

---

## The decisions that matter

### Reorder moves the facility links with the stops. That is not the re-keying Phase 4 warned about.

Phase 4 keys stop links by index and stores a `stopFingerprint` so a stale link
is *dropped* rather than re-bound. Its summary concluded reordering therefore
works "for free". That is true for safety and false for the dispatcher: someone
who confirms Hall Ford on stop 3 and drags it to position 1 would find their
confirmation gone — and gone again after every subsequent drag.

So `reorderConsignments` permutes `resolution_provenance.stops` by the same
permutation. This is the opposite of re-keying on position: position is exactly
what changed, and we were *handed* the permutation, so we know precisely how. The
fingerprint is carried **untouched**, so it still validates against the
consignment it was always about — a record that would have been dropped before the
move is still dropped after it. Both properties hold at once, and both are tested
(`a human's confirmed facility moves with its stop`, `a link that was ALREADY
stale is dropped, not resurrected by the move`).

`restampStopLink` is the same argument for an edit rather than a move: correcting
a typo in a stop's name changes its fingerprint, and making someone re-confirm the
facility they confirmed a minute ago teaches them to stop reading the question. An
edit re-stamps the record that is already there, and only when it matched before
the edit. The `via` and the score are untouched — what the person decided has not
changed, only how the stop is spelled.

### Typing a rollup IS the override

There is no separate toggle to fall out of step with the value. A number in the
box sets `overriddenTotals`; clearing the box reverts to the line items. The mark
on screen reads off `overriddenTotals` and nothing else, so it cannot disagree
with what is stored. The computed figure is shown *beside* the override rather
than replaced by it, so the disagreement is visible and not merely flagged.

Two smaller calls, both stated rather than glossed:

- **An absent sum is `null`, never `0`.** A manifest whose line items print no
  weight has an unknown weight, and "0 lbs" is a claim about the freight. Same
  distinction Phase 3 drew refusing to show "0 matched".
- **An extracted total with no line items is used but is NOT marked as an
  override.** Nobody typed it. Calling it "typed" would misattribute the
  decision — the same class of untruth as a "why" claiming a person chose.
- **`pallets` cannot be overridden**, and is absent from `rollupFieldEnum`. Line
  items carry no pallet marker, so there is nothing to differ from; a pallet
  count is only ever a typed value. Marking it "overridden" would claim a
  comparison that never happened, the same reason `MANUAL_CREATE` carries a null
  score in Phase 4.

### Copy-quantities reads the ORIGINAL array, so it does not cascade

Selecting stops 1, 2 and 3 copies from 0, 1 and 2 **as they were**, not from
values that cascaded down from 0. Cascading is a plausible reading and it is the
wrong one: it turns one mistake on stop 0 into four. Tested directly
(`[10,20,30,40]` → `[10,10,20,30]`).

Copied quantities *are* marked as overrides, because a person asserted them and
this stop's own line items may say something else — showing a number the line
items contradict with no sign anyone put it there is exactly the confusion the
override mark exists to prevent.

### "Clear" only takes back what the bar put on

The whole reason `bulkAppliedFields` is stored per field. Without the marker,
clear either wipes hand-typed work or does nothing — both worse than not offering
it. A hand edit removes that field's mark, so a note someone typed on stop 4
survives a later bulk clear, and the stop is reported in `skipped` rather than
silently passed over. Two tests cover both halves.

### "Duplicate facility at the same sequence" — the reading, declared

Section 10's phrase admits two readings and choosing silently would be a guess
presented as a rule. Taken as **adjacent**: two stops next to each other in the
running order resolving to the same building. That is a routing error a reorder
can create and a driver cannot execute. The same facility appearing twice further
apart is legitimate — a pickup and a later delivery at one warehouse — and is a
**warning**, not a block.

### Two of Section 10's five blocks are Phase 8's, and are NOT emitted as permanent blocks

Section 10 blocks on *unresolved facility · missing name · duplicate facility at
the same sequence · no driver or truck · hard compliance failure.* The first three
are properties of the stop list and are evaluated here, for real. The last two are
properties of an assignment that does not exist yet — there is no driver field, no
truck field and no compliance read on an import until Phase 8.

They are deliberately **not** emitted, because a block nobody can clear is a
disabled button with no way forward, which is worse than the check being absent.
`validateStops` is already shaped for them. This is a stated partial, not a
silent omission.

### The vocabularies were read off production before a line was written

DEC-1 and DEC-14's lesson, applied preventatively rather than after a 23514:

```
stops_stop_type_check
  CHECK (stop_type IN ('pickup','delivery','fuel_stop','layover','relay_handoff'))
```

`stopTypeEnum` is exactly those five, and `handlers.ts` rejects anything else with
a 400 at the boundary. A jsonb column would have happily stored "dropoff" for a
fortnight and thrown it at Phase 8 as a 500 nobody could retry.

**A live-schema finding worth carrying forward:** `stops` carries `"bolRequired"`
and `"podRequired"` in **camelCase**, where every neighbour on that table is
snake_case (Prisma declares them without an `@map`). `bol_required` does not
exist. Phase 8 writing raw SQL against the snake_case name would be an
undefined-column error. Found by checking rather than inferring from the
convention around it — the first draft of these comments had it wrong.

`requiredDocuments` is therefore only `BOL | POD`, and that is a constraint of the
target row rather than a shortcut: those two booleans are all `stops` has. Letting
a dispatcher require "photo of the seal" would be a promise the commit cannot
carry and the driver flow cannot enforce.

### 9 Phase 4 types were never exported from `packages/api-client`

`packages/api-client/src/index.ts` has an explicit export list, not
`export *`. Phase 4 added `StopSlotView`, `FacilityProposal`,
`StopResolutionView` and six others to `owner-imports.ts` but not to that list, so
they were unreachable from `@drivecommand/api-client`. Nothing caught it because
Phase 4 deliberately built no mobile stop screen to import them — the gap surfaced
the moment Phase 5 built one. Added under a Phase 4 heading, because they are
Phase 4's.

---

## Per-item audit of the Phase 5 prompt

Written against the prompt text item by item, not from memory of the work
(DEC-9's standing rule).

| # | Item | Verdict |
|---|---|---|
| 1 | Stop list per Section 10, drag to reorder, reorder persists | **IMPLEMENTED** |
| 2 | Detail editor, every Section 10 field, identical order, line items add/remove, overridable marked rollups | **IMPLEMENTED** |
| 3 | Bulk apply bar, operates on the selection, every action confirms with the count | **IMPLEMENTED** |
| 4 | Blocking validation, reason named inline, warnings one dismissible summary | **PARTIALLY** — three of Section 10's five blocks; the other two are Phase 8's. See above. |
| 5 | Section 15 design rules | **IMPLEMENTED** |
| 6 | Mobile RN screen using the Phase 4 routes/types/client, reorder via the existing gesture handler | **PARTIALLY** — screen built; **reorder is arrows, not gestures.** See below. |
| 7 | Review stops live, wired, summary card stays the entry step | **IMPLEMENTED** |

### 1 — IMPLEMENTED

`StopReviewRow.tsx` renders facility name, resolution badge, quantity rollup and
reference count, with a drag handle and a sequence number — the five things
Section 10 draws. `@dnd-kit/sortable`, already installed and already doing exactly
this in `StopBuilder.tsx`; nothing was installed.

Reorder persists to `reviewed_extraction` through `POST /stops/order`, so
navigating away and back shows the same order. The request is the **full
permutation**, not a move delta: idempotent under retry, and validated as a
permutation server-side, so a stale client cannot move the wrong stop.

### 2 — IMPLEMENTED

All eleven fields Section 10 lists, in Section 10's order: facility · sequence ·
type · references · line items · rollups · appointment · required documents ·
contact · notes · document pages.

**Field order identical between view and edit is structural, not a convention.**
`FIELDS` is ONE array and both modes are a `.map` over it, on web and on mobile.
There is no second list to fall out of step.

References and line items both add and remove. Rollups compute from line items,
are overridable, and the override is marked in both modes.

`sequence` and `pages` are read-only in both modes and say why: sequence is
changed by the list (a second way to set it would let the two disagree), and page
numbers are where the text was found — editing them would break the driver's page
slice (Section 11).

### 3 — IMPLEMENTED

Note · required documents · appointment window · stop type · copy quantities from
the stop above · clear any bulk-applied field. Every action composes a value, then
a confirm step names the count and the field before anything is sent — nothing
fires from a menu selection.

**"Operates on the SELECTION, not on rendered rows" is enforced three deep:** the
component is handed `number[]` and has no list reference; the request body carries
that array verbatim; `applyBulkToStops` maps over the whole consignment array.
Tested with 40 stops and a selection of `[0, 19, 39]`, asserting all three changed
and the other 37 did not.

The response reports `applied` and `skipped`, and the UI says what *actually*
happened rather than repeating the question — if four of seven took the change,
four is the number the dispatcher is shown.

### 4 — PARTIALLY

Blocks: unresolved facility, missing name, adjacent duplicate facility, and an
empty document. The primary action is `disabled` and `view.blockedReason` is
printed inline beneath it — not a tooltip, not a toast on press.

Warnings: repeated facility, no quantities, no references, no stop type, partial
appointment windows, hand-edited rollups. **One dismissible summary block. No
modal anywhere on this screen except the bulk confirmation**, which Section 10
requires. A test asserts warnings never affect `canProceed`.

The gap is the two assignment-time blocks named above.

### 5 — IMPLEMENTED

- **No borders on cards** — every surface is `bg-muted/40` or `bg-muted`; rows
  separate by a hairline divider, not a box.
- **One accent on one primary action** — the only `variant="default"` buttons on
  the screen are the single Continue and the bulk confirm inside its dialog.
  Every bar control and row control is `ghost` or `secondary`.
- **Spacing on 8/12/16/20/24** — Tailwind `2/3/4/5/6`; mobile uses the `spacing`
  token whose values are exactly `4/8/12/16/20/24`.
- **Status = colour + icon + text** — `StopStatus` is imported from Phase 4's
  component rather than redrawn, so there is one implementation.
- **Red only for errors** — the "New" badge is `outline`; the override mark is
  `secondary`; `Clear` is neutral; only the error banner and the destructive
  variant use red.
- **Text never clips** — `TruncatedText` truncates to one line and expands to the
  full wrapped value on tap, with `title` for pointers. Mobile uses
  `numberOfLines`, which ellipsises rather than cutting a glyph, and the full
  value is on the detail sheet a tap away.

### 6 — PARTIALLY, and the deviation is the reorder gesture

The screen is built: list, selection, bulk bar with the same confirmations, detail
sheet with the same eleven fields in the same order, and the T3/T4 facility exits.
It uses the Phase 4 routes, types and client methods that 04-SUMMARY recorded as
"ready with no screen", plus the four new ones. `packages/api-client` was rebuilt
before the mobile typecheck.

**Reorder is two 44px arrows per row, not a drag.** The prompt says "the existing
gesture handler on mobile". *There is no gesture handler in this app.*
`react-native-gesture-handler` is not in `apps/mobile/package.json`, is not
hoisted to the repo root, and Section 15 says the stack is locked — *"If a
capability genuinely is not there, flag it rather than installing"*. Audit D4
found the identical gap and recommended arrows; Phase 2's staging screen already
shipped them for page order and says so in a comment.

What the arrows send is the identical full permutation the browser's drag sends,
so the persistence, the validation and the provenance permutation are the same
code on both surfaces. **If drag-to-reorder on mobile is wanted, it needs
`react-native-gesture-handler` installed — that is a decision for Ayaz, not
something to smuggle into a phase that may not install anything.**

### 7 — IMPLEMENTED

`Review stops` is enabled and navigates on both surfaces — `/carrier/imports/[id]/stops`
on web, `/(owner)/imports/review/[id]` on mobile. The summary card remains the
only way in, so the client and the contract are always decided before anyone
starts moving stops around. A document with zero stops leaves the button disabled
and says why rather than opening an empty screen.

Both surfaces' footer copy was rewritten. The mobile one still said *"The client
and contract above are saved"* — the exact claim quick-510 removed from web
because a component cannot establish it. It is gone.

### Constraints

| Constraint | Verdict |
|---|---|
| Reuse existing DataGrid / list primitives, no bespoke table | **IMPLEMENTED, with the reading stated** — `useGridSelection` (the DataGrid's selection store, used standalone: a Set of ids with shift-range) and Phase 4's `StopStatus`/`StopFacilityDecision`. `BulkActionsBar` was **not** used: it calls `useDataGridContext` and cannot render outside a `DataGrid`. The list is not a table — it drags, and `DataGrid` rows do not. |
| Use the installed dnd library; install nothing | **IMPLEMENTED** — `@dnd-kit/*` on web, arrows on mobile. Dependency diff empty. |
| Long facility names truncate, full value on tap; text never clips | **IMPLEMENTED** — `TruncatedText`, `numberOfLines` on mobile. |
| No DDL; stop and report if a column is missing | **IMPLEMENTED** — no migration written, `schema.prisma` untouched, drift scan reports **0 missing columns**. Nothing needed was missing, so there was nothing to stop and report. |
| Money stays Decimal | **IMPLEMENTED** — nothing on this screen is money. Line-item `quantity`/`weight` are counts and masses; `totalRate` lives on the header and is untouched by every path in this phase. No `parseFloat` on a currency value was introduced. |
| No writes in any view path | **IMPLEMENTED** — `getStopReview` and its whole call graph are reads; the four writers are in one file. |
| Stop mutations continue to route through `ensureStopsCommitted` | **IMPLEMENTED** — `beginMutation` calls it, and all three mutations open with `beginMutation`. |
| Provenance and why affordances stay truthful | **IMPLEMENTED** — `persisted` is rendered honestly on both surfaces ("Matched on this read…"); the bulk mark and the override mark each read off stored state rather than an inferred diff. |
| Ladder context derives its client via the shared resolver | **IMPLEMENTED** — `viewOf` calls `resolveEffectiveClientId`, never `record.clientId` (quick-511). |

---

## Not done, and why

**Mobile drag-to-reorder.** See item 6. Needs a dependency this phase may not
install.

**The two assignment-time blocks.** See item 4. Needs Phase 8's driver and truck.

**No live-import verification.** The six checks in the phase's verify table have
not been run against a real import — no S3 credentials and no test manifest in
this session. What each rests on is set out below, honestly labelled. Same
position Phases 2, 3 and 4 closed in.

**Appointment windows are typed, not picked.** `datetime-local` on web and a plain
text field on mobile, because no date-picker package is installed and this phase
installs nothing — the same call Phase 3's date row made and for the same reason.

**The review view is as expensive as the ladder view.** `getStopReview` loads
every facility in the tenant and runs the ladder for every stop, exactly as
04-SUMMARY recorded. Every mutation then does it twice — once inside
`ensureStopsCommitted` and once to build the response. For a 12-stop manifest that
is fine; the fix if it ever bites is to thread the loaded context through rather
than to cache anything. Recorded rather than pre-optimised.

**`reviewedExtraction` is written whole on every edit.** Prisma has no jsonb
sub-path update, and the read has already happened. Two dispatchers editing the
same import at the same moment is last-write-wins on the consignment array. That
is not new to this phase — the same is true of `resolution_provenance` since
Phase 3 — but it is the first time the payload is big enough to be worth naming.

---

## Verification

### TypeScript — real output

```
$ cd apps/web && npx tsc --noEmit
WEB EXIT CODE: 0

$ cd apps/mobile && npx tsc --noEmit
MOBILE EXIT CODE: 0
```

Both silent. `packages/validation` and `packages/api-client` were rebuilt
(`npx tsc` in each, exit 0) **before** the mobile typecheck — the same trap 01-,
02-, 03- and 04-SUMMARY flagged, and it bit again: the first mobile run failed
with 26 errors, all cascading from ten `has no exported member` lines.

### Tests — `npx vitest run src/lib/document-import`

```
 ✓ stop-review.test.ts                (32)  <- new
 ✓ address.test.ts                    (40)
 ✓ facility-ladder.test.ts            (18)
 ✓ spreadsheet.test.ts                (17)
 ✓ extractor.test.ts                  (26)
 ✓ merge.test.ts                      (20)
 ✓ service.test.ts                    (22)
 ✓ lifecycle.test.ts                  (29)
 ✓ facility-commit.test.ts            (12)
 ✓ facility-effective-client.test.ts   (9)
 ✓ matching.test.ts                   (16)
 ✓ hashing.test.ts                    (21)
 ✓ profiles.test.ts                    (6)
 ✓ money.test.ts                       (7)
 ✓ upload.test.ts                      (6)
 ✓ contract-create.test.ts             (9)
 ✓ rate-con-party.test.ts             (15)
 ✓ document-date.test.ts               (8)
 ✓ resumable.test.ts                   (5)
 ✓ materialise.test.ts                 (8)
 ✓ pdf-render.test.ts                  (7)

 Test Files  21 passed (21)
      Tests  333 passed (333)
```

**Full web suite, measured against the baseline rather than assumed:**

| | Files failed | Tests failed | Tests passed | Total |
|---|---|---|---|---|
| Phase 1 close | 14 | 61 | 782 | 901 |
| Phase 2 close | 14 | 61 | 830 | 949 |
| Phase 3 close | 14 | 61 | 882 | 1001 |
| Phase 4 close | 14 | 61 | 992 | 1111 |
| **Phase 5** | **14** | **61** | **1036** | **1155** |

The failing set is byte-identical to all four prior phases — all pre-existing,
none in document-import. Passing rose by exactly 44, which is exactly the new
tests. **No existing test was edited**, and no test fake needed changing: the
review layer reads the consignments the fakes already return.

### Dependencies

```
$ git diff --stat package.json apps/*/package.json packages/*/package.json package-lock.json
(empty)
```

Nothing installed.

### Live schema diff against production (DEC-8 / DEC-9 standing rule)

Run against **the spec's requirements for this phase**, not against what the code
writes — the distinction that caught the 23514 in Phase 4.

| Check | Result |
|---|---|
| `document_imports.reviewed_extraction` | `jsonb`, nullable — present. This phase's entire storage. |
| `document_imports.resolution_provenance` | `jsonb`, nullable — the `stops` key needs no migration |
| `document_imports` — `raw_extraction`, `client_id`, `contract_id`, `updated_by_id`, `status`, `deleted_at` | all present |
| **`stops_stop_type_check`** | **`IN ('pickup','delivery','fuel_stop','layover','relay_handoff')` — `stopTypeEnum` is exactly this, and the boundary rejects anything else with a 400** |
| **`stops."bolRequired"` / `stops."podRequired"`** | **present, and camelCase — `bol_required` does NOT exist. Phase 8 must quote them. See above.** |
| `stops.rollup_overridden` | `boolean NOT NULL DEFAULT false` — present since Phase 1; `overriddenTotals` collapses to it at commit |
| `stops` — `stop_references`, `line_items`, `page_numbers` (jsonb), `appointment_start`/`_end`/`_is_firm`, `is_end_stop`, `notes`, `contact_name`, `contact_phone`, `pieces`, `weight_lbs`, `sequence_order` | all present — every review field has somewhere to commit to |
| `carrier_documents_parent_type_check` | `IN ('stop','load','dispatch','contract','expense','client')` — `'stop'` admitted, so per-stop documents are committable in Phase 8 |
| **`full-schema-drift-scan.ts` against production** | **94 models scanned · 0 columns missing in DB · 0 missing tables.** The 78 "extra" columns are all `USER-DEFINED` Postgres enum types the scanner cannot map, unchanged from the Phase 4 run and unrelated to this phase. |

**Drift: none.** No column this phase needs is missing, so there was nothing to
stop and report.

**No DDL was written or applied**, and that is a checked claim:
`git status --porcelain apps/web/prisma` is empty and `schema.prisma` is
byte-unchanged. The drift scan rewrites its own draft SQL file with a new
timestamp as a side effect; that artefact was reverted and is not in the commit.

### Phase 5 verify table

| # | Check | Status |
|---|---|---|
| 1 | Select stops, **scroll**, bulk apply → off-screen ones got it | ✅ **Real at the unit level.** 40 stops, selection `[0, 19, 39]`, all three written and 37 untouched. The property is structural — no code path below the component has a viewport. Not run against a scrolled browser. |
| 2 | Reorder, navigate away, return → order persisted | **Code path verified, not run.** The order is written to `reviewed_extraction` by `POST /stops/order` and the page re-reads it server-side on every visit. There is no local copy that could survive the round trip. Not exercised end to end. |
| 3 | Leave one facility unresolved → disabled, reason inline | ✅ **Covered by tests.** `blocks` contains `UNRESOLVED_FACILITY`, `canProceed` is false, `blockedReason` is `"2 stops need a facility"`, and both surfaces render `blockedReason` beneath the disabled action. |
| 4 | Open a stop, view then edit → field order identical | ✅ **Structural.** One `FIELDS` array drives both modes on both surfaces. Not merely tested — there is no second list. |
| 5 | 60-character facility name → truncates, no clipping | **Component-level, not measured.** `TruncatedText` collapses to `truncate` and expands to `whitespace-normal break-words`; mobile uses `numberOfLines={2}`. Not verified against a real 60-character render. |
| 6 | Thumb over badge colours → meaning still clear | ✅ **Structural.** `StopStatus` pairs an icon and a word with every colour, and it is imported from Phase 4 rather than redrawn, so there is one implementation to be right. |

Checks 1, 3, 4 and 6 are real now; 2 and 5 need a browser.

---

## What Phase 6 needs from here

- `GET /[id]/stops/review` returns `StopReviewView`, keyed by the same
  consignment index everything since Phase 4 uses.
- **The running order is `reviewed_extraction.consignments` array order.** Template
  matching compares against that, not against `rawExtraction`.
- `stopType` is set here and is already in the database's vocabulary — Phase 6's
  template stops may be compared against it directly.
- `StopReviewRow` carries every `StopSlotView` field, so anything that takes a
  Phase 4 slot takes a Phase 5 row unchanged.
- **Phase 8 must still call `ensureStopsCommitted`** before reading stop links, and
  `ensureContractCommitted` before reading `contractId`. Phase 5 calls the first
  at every mutation, which means a reviewed import will usually have its links
  written — but "usually" is not a guarantee, and an import nobody edited has
  nothing on its row.
- **Phase 8 must quote `"bolRequired"` / `"podRequired"`** if it writes raw SQL.
- Audit **B4 is still open** (`CarrierFacility` has no `active` column;
  `softDeleteFacility` writes a type the CHECK rejects). Phase 8 should not build
  a commit on top of it.

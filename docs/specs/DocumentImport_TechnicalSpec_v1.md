# Document Import to Trip — Build Guide v1

**Module:** Document Import
**Save to:** `docs/specs/DocumentImport_TechnicalSpec_v1.md`
**Companion file:** `DocumentImport_Prompts.md` — the same twelve prompts on their own, for copying
**Product owner:** Ayaz — ping any time, on anything

---

# Section 0 — Start here

## 0.1 A note to you

You are the engineer on this build. This document exists so you do not have to reverse-engineer the product thinking from a ticket. The domain research, the trade-offs, and the reasoning behind each decision are written down, which frees your judgment for the parts that actually need it: reading what Claude Code produces, catching where it drifts, and improving on this plan once you are inside the code.

Treat this as a strong starting position, not a cage. Several decisions here are informed calls made from documentation rather than from living in the repo. Within a day you will know things this document does not. When you find a better way, say so — a change that makes the build simpler or the product better is a win, not a deviation.

The one thing worth protecting is the product intent in Section 1. The mechanics are yours to improve.

## 0.2 What you are building

```
  MORNING                                        EVENING
     |                                              |
     v                                              v
 +--------+  +--------+  +--------+  +--------+  +--------+
 | PAPER  |->|EXTRACT |->|RESOLVE |->| REVIEW |->|  TRIP  |
 |16 pages|  |   AI   |  |who/what|  | human  |  |created |
 +--------+  +--------+  +--------+  +--------+  +---+----+
                                                     |
        +--------------------------------------------+
        v
   +----------+   +------------+   +------------+
   |  DRIVER  |-->| INSPECTION |-->|  DRIVING   |
   | notified |   | full screen|   |  tracked   |
   +----------+   +------------+   +-----+------+
                                         |
                                         v
                                +------------------+
                                |  OWNER WATCHES   |
                                | drivers · trucks |
                                +------------------+
```

Twelve phases, run in order. Each one ends with a commit.

## 0.3 The loop, per phase

```
 +------------------------------------------------------+
 |                                                      |
 |  READ  ->  RUN  ->  WATCH  ->  CHECK  ->  COMMIT     |
 |  2 min    paste     live      10 min      done       |
 |                                  |                   |
 |                                  +-> something off?  |
 |                                      send correction |
 |                                      (Section 0.7)   |
 +------------------------------------------------------+
```

Do not batch phases. Each one ends green or it does not end.

## 0.4 Before you start

| # | Do this | Why |
|---|---|---|
| 1 | Read Sections 1 and 2 | Domain in your head |
| 2 | Save this to `docs/specs/` | Prompts reference the path |
| 3 | `mkdir -p .planning/document-import` | Phase summaries land there |
| 4 | `git checkout -b feature/document-import` | One branch, twelve commits |
| 5 | `npx tsc --noEmit` clean on main, both apps | Tell your errors from existing ones |
| 6 | Save current package.json + lockfile hashes | You will diff against these |
| 7 | Local DB you can drop and re-migrate | You will do this often |
| 8 | Web running as owner, mobile as driver | Both get tested every phase |
| 9 | Credentials: AI model, storage, routing | Phase 1 fails oddly without them |
| 10 | Test manifest as photos AND PDF, 4+ pages, one repeated consignee | Half the tests need it |

## 0.5 Five things to watch while a prompt runs

```
 1  Reads first, writes second
    Opens schema + audit before creating files

 2  Reuses, doesn't rebuild
    "I'll create an upload service" -> stop it

 3  No installs
    Any npm / yarn / pnpm add -> stop it

 4  Runs its own checks
    Real tsc and test output, not "should be clean"

 5  Stays in scope
    Refactoring unrelated files -> stop it
```

## 0.6 Catching hallucination

This is where your experience beats the model's. Claude Code writes plausible code fast; you know which plausible things are actually true about this repo.

```
 FOUR HIGH-VALUE CHECKS  ·  run after every phase

 +--------------------------------------------------------+
 | 1 NAMES  Grep 3 new field names vs schema.prisma       |
 |          Zero hits = invented                          |
 +--------------------------------------------------------+
 | 2 DEPS   git diff **/package.json **/*lock*            |
 |          Any change = failed phase                     |
 +--------------------------------------------------------+
 | 3 STUBS  grep -rn "TODO|mock|placeholder|as any"       |
 |          Also: 3-line function with a big name         |
 +--------------------------------------------------------+
 | 4 PROOF  Run tsc and tests yourself, every time        |
 |          "Tests pass" with no output = unverified      |
 +--------------------------------------------------------+
```

Three more, checked situationally:

- **Cited paths.** Any file it says exists, open it. Four seconds.
- **Migrations.** Read every generated SQL file. This build is additive only — a `DROP`, a rename, or an `ALTER COLUMN TYPE` means stop.
- **Tenant filters.** Every new query and route needs one. Security check, not style.

The pattern behind all of it: the model is describing a codebase like yours, not yours. Names and file paths are where that shows first.

## 0.7 Correction prompt

```
Stop. Don't continue.

You used X. The correct value is Y — it's in
.planning/document-import/00-AUDIT.md (or spec Section N).

1. Revert just that part. Leave everything else alone.
2. Redo it correctly.
3. Search the rest of your changes for the same mistake and
   list every occurrence before fixing them.
4. Run npx tsc --noEmit in both apps and paste the real
   output.

Stop after step 4 and wait for me.
```

Step 3 matters most. An invented name is almost never used once.

## 0.8 Worth a message to Ayaz

Not blockers — decisions above the pay grade of a single phase:

- The audit shows two live schema universes and it is genuinely ambiguous which wins
- A phase truly needs a dependency that is not installed
- The checklist system would need restructuring for the full-screen driver flow
- A migration would have to be destructive
- Real extraction accuracy comes in well below what the tests assume
- Two rules in this document contradict each other in a real case

## 0.9 Trucking vocabulary

| Word | Meaning |
|---|---|
| Shipper | Whose goods are moving. Here, the tire distributor |
| Carrier | The trucking company. Our customer |
| Consignee | Where it gets delivered. Here, a dealership |
| Manifest | The paper list of every consignee today |
| BOL / POD | The contract / the delivery signature |
| PRO number | The carrier's tracking number |
| Dispatcher | Decides who drives what, where |
| Trip | One driver, one truck, one day, many stops |
| Deadhead | Driving empty. Costs money, earns nothing |

---

# Section 1 — The domain

## 1.1 The problem

At 5:30am a driver walks into a distribution warehouse and is handed sixteen pages listing everywhere the truck goes today. Somebody then types all of it into a computer.

That is the problem. The information already exists in a machine-generated printout, and a human retypes it into another machine. Twenty to forty minutes, before dawn, on exactly the kind of task humans get wrong.

We are replacing the retyping with a camera.

## 1.2 The actual page

Page 4 of 16 of a real manifest. Callouts follow.

```
+------------------------------------------------------------+
| DEALER TIRE (1)            Shipment Manifest               |
| Shipper 103                   WALTCO INC (2)               |
| DEALER TIRE - CHICAGO WHSE                                 |
| 3708 RIVER ROAD, SUITE 600  Manifest Number: 07/27/26 (3)  |
| FRANKLIN PARK, IL 60131              page 4 of 16    (4)   |
+------------------------------------------------------------+
| Consignee: 43775 (5)   WEST - MKE (6)  Shipment Count: 7   |
|                                                       (7)  |
| RUSS DARROW NISSAN                 Shipment Num            |
| 11212 W METRO BLVD                 |||| 77198347      (8)  |
| MILWAUKEE WI 53224                                         |
| (414) 586-3050                     PRO Num  ||||      (9)  |
+------------------------------------------------------------+
| Order Number  Customer PO  Terms      Pcs Plt Weight       |
| 60633521 SO   JEFF GREEN   Prepaid     4   0  88 LBS       |
|        (10)        (11)      (12)                          |
+------------------------------------------------------------+
| Qty  Item                  Description          Weight     |
|  4   Item 157230     (13)  Loose Tires @ 77.5     88       |
|      Item 197592 subs(14)  Tires on wheels                 |
|  0   NMFC# 150390-04 (15)  Wooden Pallet           0       |
+------------------------------------------------------------+
```

**(1) Dealer Tire** — the shipper. The distributor whose product moves.

**(2) Waltco Inc** — the carrier. The trucking company. Our customer.

**(3)** A **date** sitting in a field labelled "Number." Real documents do this. Never assume a field labelled "number" contains one.

**(4)** One page of sixteen. Fifteen more must assemble into a single day.

**(5) Consignee 43775** — the most important number on the page. Dealer Tire's permanent ID for this dealership. It will be 43775 today, tomorrow, and in two years. Names get typed differently, addresses get abbreviated differently; this never changes.

**(6) WEST - MKE** — a routing zone. West Milwaukee. Useful for naming a template.

**(7)** The seventh shipment on the manifest. Not a count of anything else.

**(8)** Unique ID for this delivery. Today only, unlike (5).

**(9)** The carrier's own tracking number.

**(10)** Dealer Tire's sales order.

**(11)** A **person's name** in the PO field. PO fields are not structured.

**(12)** Prepaid — the shipper pays freight, not the dealership. Affects billing.

**(13)** SKU, product, quantity, weight.

**(14)** A substitution note. Quantity zero, nothing shipped. Rows exist for reference.

**(15)** Freight classification code. Zero, so no pallet.

Also on the page: a green handwritten **M** and a circled **8**. Somebody at the counter wrote it. Best-effort only, never blocks anything.

## 1.3 The case that proves the design

Further down the same page:

```
  BLOCK 1                    BLOCK 2
  Consignee: 43775           Consignee: 43775
  RUSS DARROW NISSAN         RUSS DARROW NISSAN
  Shipment 77198347          Shipment 77203176
  4 pieces · 88 lbs          1 piece · 26 lbs
       |                          |
       +------------+-------------+
                    v
           +------------------+
           |     ONE STOP     |
           |     5 tires      |
           |   pages [4, 4]   |
           +------------------+

  And at the bottom of the same page:

     3775 - RUSS DARROW NISSAN BREAKDOWN
     Tires        5      <-- 4 + 1
     Accessories  0
     Assemblies   0
```

The truck goes once and drops five tires. Two shipments, one stop.

This is not a rare edge case defended against out of caution — it is on the first page anyone looked at. If the build creates two stops here, the driver notices on day one.

## 1.4 Today versus after

```
 TODAY                        AFTER
 -----                        -----
 05:30 collect 16 pages       05:30 photograph 16 pages
 05:35 open app, new dispatch 05:31 tap Import, tap Extract
 05:40 type stop 1            05:32 system reads all pages,
 05:45 type quantities              merges the duplicate,
 05:48 type stop 2                  recognises 12 known codes
  ...  repeat x12             05:33 one card:
 06:05 realise 7 and 8 are            Dealer Tire
       the same, go back              Chicago WHSE Standing
 06:12 assign driver + truck          West MKE Run (11 of 12)
 06:15 phone the driver               12 stops · 1 new
 06:20 driver takes paper     05:34 review the one new stop
                              05:35 pick driver + truck
                              05:36 driver's phone buzzes

 ~40 min of typing            ~4 min of reviewing
```

## 1.5 Why each piece exists

```
 FACILITY EXTERNAL REFERENCE
 Names are unreliable. Codes are not. 43775 never changes.
 Confirm once -> resolve silently forever.
        |
        v
 ROUTE TEMPLATES
 The run repeats; only quantities change. Store the pattern
 and the best driving order once, reuse it 300 times.
        |
        v
 END STOP
 A day that ends at the last delivery can't be measured.
 The truck still has to get back. Mileage, hours, pay.
        |
        v
 INSPECTION GATE
 Federally required, and on paper universally faked.
 On the phone before the trip starts, it actually happens.
        |
        v
 CONFIDENCE COLLAPSE
 This happens at 5:30am, on a phone, in a warehouse.
 A screen with eleven empty fields won't get filled in right.
```

## 1.6 The governing sentence

**The document is the input; the human is the approver; the system never guesses silently.**

Confident, pre-filled and collapsed into one tap. Not confident, an explicit choice with the evidence shown. Nothing reaches the database from an unreviewed extraction.

---

# Section 2 — Scope

**In:** photo / PDF / spreadsheet upload · AI extraction to one canonical shape · client and contract resolution including one-time spot contracts · route template matching, application, and creation · facility resolution and guarded creation · per-stop fields with bulk apply · end stop policy · optimisation as a suggestion · driver and truck assignment with validation · atomic commit · driver notification · full-screen inspection gate with override · notification triggers · live driver and truck boards · Today's Trips report · in-app docs.

**Out of v1:** email inbox ingestion · handwriting beyond best-effort · EDI 204/214 · trips spanning midnight · live mid-trip re-optimisation.

**Non-negotiable:** tenant isolation everywhere · soft delete on imports · Decimal for money · no new libraries · colour + icon + text on every status · red only for errors and destructive actions · 44px touch targets.

---

# Section 3 — Architecture

```
 +-------------------------------------------------------+
 | UI         Import wizard   Stop review   Live board    |
 |            (P2, P3)        (P5)          (P11)         |
 +-------------------------------------------------------+
 | RESOLUTION Client/Contract Facility      Template      |
 |            (P3)            ladder (P4)   match (P6)    |
 +-------------------------------------------------------+
 | PIPELINE   Extraction service · canonical schema ·     |
 |            lifecycle  (P1)                             |
 +-------------------------------------------------------+
 | COMMIT     Validation -> atomic txn -> notify (P8,P10) |
 +-------------------------------------------------------+
 | EXISTING   storage · auth · DataGrid · notifications · |
 |            checklists · routing · geocoding            |
 |            -- extend these, don't rebuild --           |
 +-------------------------------------------------------+
```

Phase dependencies:

```
 P0 -> P1 -> P2 -> P3 -> P4 -> P5 -> P6 -> P7 -> P8 ->
 audit data  intake client facility stop  templ  end  commit

 -> P9 -> P10 -> P11 -> P12
   driver notif  board  docs

 Nothing is user-visible until P2.
 P4 is the most valuable phase.
 P8 is the riskiest phase.
```

---

# Section 4 — The wizard

## 4.1 Screens

```
 +----------------+  +----------------+  +--------------------+
 | IMPORT DOCUMENT|  |  Extracting... |  | We found this      |
 |                |->|                |->|                    |
 |  Take photos   |  | ######---- 9/16|  | Client   Dealer  > |
 |  Upload file   |  |                |  | Contract Chicago > |
 |  Recent        |  |   [ Cancel ]   |  | Template West MKE> |
 +----------------+  +----------------+  | Date     Mon 27Jul |
                                         |                    |
                                         | 12 stops           |
                                         | 11 matched · 1 new |
                                         |                    |
                                         |  [ Review stops ]  |
                                         +---------+----------+
                                                   |
                                                   v
 +----------------------+   +----------------------+
 | <- Stops        12   |   | Finish trip          |
 |                      |   |                      |
 | 1 Russ Darrow  5  ok |-> | End stop  Yard     > |
 | 2 Boucher Kia  8  ok |   | Driver    Mike R   > |
 | 3 Hall Ford    2  ok |   | Truck     104      > |
 | 4 Wilde Honda  NEW ! |   | Start     06:00    > |
 | ...                  |   |                      |
 |----------------------|   |   [ Create trip ]    |
 | Select · Apply to all|   +----------------------+
 +----------------------+
```

## 4.2 Confidence collapse

```
 CONFIDENT                  NOT CONFIDENT
 ---------                  -------------
 Client   Dealer Tire ok    +--------------------+
 Contract Chicago     ok    | Which client?      |
 Template West MKE    ok    | search: Dealer Tir_|
      |                     |                    |
      v                     | > Dealer Tire Inc  |
 one tap -> Review          | > Dealer Tire Co   |
                            | + Create new       |
                            +--------------------+
```

| Decision | Collapses when | Otherwise |
|---|---|---|
| Client | Exact match to one active client | Picker, name pre-typed, Create new pre-filled |
| Contract | Client has exactly one active contract | Picker. Rate cons offer one-time contract |
| Template | Similarity 0.75+ to one template | Top 3 with diffs, plus Continue without |
| Facility | Tier 1 or Tier 2 match (Section 7) | One tap to confirm or create |
| End stop | Tenant default resolves | Ask once, remember per template |
| Driver / truck | Never | Always explicit |

**Rule:** only the summary card may show more than one unresolved decision.

**Rule:** every auto-resolved value has a small "why" affordance showing the matched text and score.

---

# Section 5 — Canonical extraction schema

One shape for every document type. This is what makes it universal rather than tire-specific.

```
{
  documentType: MANIFEST | RATE_CONFIRMATION |
                DELIVERY_SCHEDULE | PACKING_LIST | UNKNOWN,

  header: {
    documentNumber, documentDate, totalPages,
    originName, originAddress,
    originContact: { name, phone, email },
    currency, totalRate          // rate cons only
  },

  consignments: [{
    pageNumbers: [4],
    externalCode,                // "43775" - the gold key
    name,
    address: { line1, line2, city, state,
               postalCode, country },
    contact: { name, phone },
    groupLabel,                  // "WEST - MKE"
    appointment: { earliest, latest, isFirm },
    references: [{ type, value }],
      // SHIPMENT | PRO | ORDER | PO | BOL | LOAD |
      // SEAL | OTHER
    totals: { pieces, pallets, weight, weightUom },
    lineItems: [{ sku, description, quantity,
                  uom, weight, hazmat }],
    notes,
    fieldConfidence: { "<path>": 0.0-1.0 }
  }],

  extractionWarnings: [{ code, message, pageNumbers }]
}
```

Required for commit: `name`, plus either a resolvable `address` or a resolved facility. Everything else advisory.

How the four document types land in the same shape:

```
 MANIFEST      RATE CON      SPREADSHEET   PACKING LIST
 16 pages      2 pages       1 sheet       1 page
    |             |             |             |
    v             v             v             v
 N consign.    1 consign.    N consign.    1 consign.
 shared        origin in     origin =      shared
 origin        header        home base     origin
    |             |             |             |
    +-------------+-------------+-------------+
                        v
              same canonical shape
              no branching below here
```

Spreadsheets skip vision extraction entirely: parse the sheet, map columns once per client, save the mapping to the document profile, reuse silently.

---

# Section 6 — Data model

Read the live schema first; follow existing naming, tenancy, soft-delete, and index conventions. This is intent, not DDL.

```
 NEW TABLES

 +------------------------------+
 | Import record                |  one per upload session
 |  · source file keys[]        |  · rawExtraction JSONB
 |  · content hash              |  · reviewedExtraction
 |  · client / contract /       |    JSONB  <- this commits
 |    template / profile        |  · model, tokens, cost
 |  · status (8 states)         |  · created entity IDs
 |                              |  · soft delete
 +------------------------------+

 +------------------------------+
 | Facility external reference  |  <- highest-value table
 |  unique(tenant, client,      |
 |         sourceCode)          |
 |  -> facility                 |
 +------------------------------+

 +------------------------------+
 | Document profile             |  per tenant+client+type
 |  · extraction hints          |  · column mapping
 |  · commit strategy           |  · default end stop
 +------------------------------+

 EXTENSIONS

 Tenant settings
   autoCreateRouteTemplatesFromImports (off)
   defaultEndStopPolicy, homeBaseFacilityId
   requirePreTripInspection
   blockTripStartOnFailedInspection (on)

 Route template
   endStopPolicy override, sourceImportId
   lastAppliedAt, applicationCount

 Trip
   sourceImportId, endStopPolicy
   inspectionRequired
   inspectionOverriddenBy / Reason

 Stop
   references[], lineItems[], pageNumbers[], appointment

 Facility
   isDriverResidence + owning driver
```

Import lifecycle:

```
 UPLOADED -> EXTRACTING -> NEEDS_REVIEW -> READY
     |            |             ^            |
     |            v             |            v
     +-------> FAILED ----------+       COMMITTING
                  |                          |
              CANCELLED                      v
                                        COMMITTED
                                     (or rollback to
                                      NEEDS_REVIEW)
```

Edits live in `reviewedExtraction`, not a normalised staging table — resume-after-close works for free and there is no second schema to keep in sync.

---

# Section 7 — Facility resolution ladder

```
                 consignment
                      |
                      v
       +------------------------------+
  T1   | external ref matches         |--yes--> LINK, silent
       | (tenant, client, code)       |
       +--------------+---------------+
                      | no
       +--------------v---------------+
  T2   | normalised address matches   |--yes--> LINK, silent
       | within tenant                |    + backfill ext ref
       +--------------+---------------+
                      | no
       +--------------v---------------+
  T3   | fuzzy score above threshold  |--yes--> PROPOSE
       | name + street no + postcode  |    human taps
       +--------------+---------------+    show score + diffs
                      | no
       +--------------v---------------+
  T4   | nothing                      |-------> CREATE FORM
       +------------------------------+    human taps
                                           pre-filled
```

**Hard rule:** T3 and T4 never create without a human tap. A polluted facility table is unrecoverable and destroys the value of the external reference table permanently.

**Why it gets faster:**

```
 DAY 1   43775 -> T4 -> human confirms -> ext ref written
 DAY 2   43775 -> T1 -> silent              0 taps
 DAY 3   43775 -> T1 -> silent              0 taps
  ...
```

**Normalisation** must handle: case, punctuation, street suffixes, directionals, suite/unit split, postal codes. One shared utility, tested against 30+ real pairs including negatives.

**Facility types:** reuse the existing set. Consignees to receiver. Origin to shipper. Yard and parking to terminal. Driver residence to other, with `isDriverResidence`.

---

# Section 8 — Route template matching

```
 TEMPLATE (7 stops)         IMPORT (8 stops)
 +--+--+--+--+--+--+--+     +--+--+--+--+--+--+--+--+
 | A| B| C| D| E| F| G|     | A| B| C| D| E| F|  | H|
 +--+--+--+--+--+--+--+     +--+--+--+--+--+--+--+--+
            v                            v
       matched: 6      union: 8    score = 6/8 = 0.75
                       v
 +-----------------------------------------------------+
 | A B C D E F  merge   template order + import qty     |
 | H            append  badged NEW, draggable           |
 | G            keep    badged NOT ON MANIFEST, skipped |
 +-----------------------------------------------------+
```

Scoring: Jaccard over **resolved facility IDs**, not names. Ordering ignored — order is a template property. Weight down when stop counts differ by more than 30 percent.

```
 score >= 0.75   auto-select, collapse into summary card
 0.45 - 0.75     show top 3 with stop diffs
 score <  0.45   offer only "Continue without a template"
```

Both thresholds in one constants file.

**Template supplies:** order, appointment windows, required documents, standing notes.

**Import supplies:** quantities, reference numbers, per-stop notes.

**Auto-create** is a tenant setting, default off. When on and no template was applied, create one from the committed stops, name it from `groupLabel` + client + date, and land it in a **Suggested templates** section until a human confirms. Guard: skip creation when the stop set already scores above 0.75 against an existing template — near-duplicate templates are worse than none.

When off, offer one-tap **Save as route template** on the success screen.

---

# Section 9 — End stop and optimisation

```
 WITHOUT END STOP           WITH END STOP
 yard -> o -> o -> o -> o   yard -> o -> o -> o -> o -> yard
                        :                                 ^
                        : untracked                       |
                        v                             tracked
                   ??? miles                       closed loop
```

| Policy | Resolves to | Facility type |
|---|---|---|
| `RETURN_TO_ORIGIN` | The pickup facility | shipper |
| `HOME_BASE` | Tenant's home base | terminal |
| `DESIGNATED_PARKING` | Per template or trip | terminal |
| `DRIVER_RESIDENCE` | Driver's address | other + flag |
| `NONE` | No end stop | — |

Resolution order: tenant default, then template override, then per-trip choice.

**Privacy, hard requirement.** A driver residence facility is visible only to that driver, the owner, and dispatchers with explicit permission. Not in the general picker, not suggested for other trips, excluded from exports. Server-side filter, not a UI hide.

**Optimisation is a suggestion, never a mutation.**

```
 +---------------------------------------------+
 | Suggested order saves 18 miles and 34 min   |
 |                                             |
 | [ Keep current order ]  [ Use suggested ]   |
 +---------------------------------------------+
```

Runs on the **template** when created or edited — optimise once, reuse daily. Runs on a **trip** only when stops changed relative to the template. Constraints: pickups precede their deliveries, firm windows are hard, soft windows are penalties, end stop pinned last. Below a configurable floor, do not offer it at all — noise erodes trust. Cache the matrix per ordered facility set.

---

# Section 10 — Stop review

```
 +--------------------------------------------------+
 | <- Stops                                  12     |
 +--------------------------------------------------+
 | :: 1  Russ Darrow Nissan   ok linked   5 · 2ref  |
 | :: 2  Boucher Kia          ok linked   8 · 1ref  |
 | :: 3  Hall Ford            ~ proposed  2 · 1ref  | <- tap
 | :: 4  Wilde Honda          + new       4 · 1ref  | <- tap
 | :: 5  Yard                 ok end stop           |
 +--------------------------------------------------+
 | [x] 3 selected  Note v  Docs v  Window v  Clear  |
 +--------------------------------------------------+
       |
       +-> [ Create trip ]  disabled
           "2 stops need a facility"
```

Per-stop fields: facility · sequence · type · references (typed list) · line items (sku, description, qty, uom, weight) · rollups (computed, overridable, marked when overridden) · appointment window · required documents · contact · notes · document pages.

Bulk apply: select stops, then apply note, required documents, appointment window, or stop type · copy quantities from the stop above · clear any bulk-applied field. Every bulk action confirms with the count: *Apply "Call ahead 30 min" to 7 stops?*

**Blocks:** unresolved facility · missing name · duplicate facility at the same sequence · no driver or truck · hard compliance failure. Everything else is one dismissible warning summary, never a modal.

---

# Section 11 — Commit

```
 +--- validation ---------------------------------+
 | BLOCK  overlapping assignment                  |
 |        expired licence / medical               |
 |        truck out of service                    |
 | WARN   insufficient hours · over capacity      |
 |        unreachable window · unusual geography  |
 +----------------------+-------------------------+
                        v
 +--- ONE TRANSACTION ----------------------------+
 | 1  facilities + external refs                  |
 | 2  trip                                        |
 | 3  stops in sequence, incl. end stop           |
 | 4  loads                                       |
 | 5  documents (trip level + per-stop pages)     |
 | 6  import -> COMMITTED, IDs recorded           |
 | 7  template create / update                    |
 +----------------------+-------------------------+
                        | success
                        v
     8  enqueue driver notification
        <- OUTSIDE the transaction

  any failure -> full rollback -> NEEDS_REVIEW
                 zero orphans     plain-language error
```

Page slicing means the driver at stop 5 opens page 4, not a sixteen-page scan.

---

# Section 12 — Driver flow

```
  push -> trip -> [Start trip]
                       |
           +-----------v-----------+
           | inspection required?  |--no--> trip starts
           +-----------+-----------+
                       | yes
           +-----------v-----------+
           | valid one already     |--yes-> trip starts
           | today, this truck?    |
           +-----------+-----------+
                       | no
       +---------------v---------------+
       |   FULL SCREEN CHECKLIST       |
       |   #####-----  section 3 of 6  |
       |                               |
       |   Brakes      ok  x  n/a      |
       |   Lights      ok  x  n/a      |
       |   Tires       ok  x  n/a      |
       |                               |
       |   fail -> note required       |
       |        -> photo uploads NOW   |
       +---------------+---------------+
                       v
                   signature
                       |
       +---------------+---------------+
       v               v               v
  all pass       non-critical     critical fail
  trip starts    trip starts      TRIP BLOCKED
                 defect logged    dispatcher notified
                                  driver sees:
                                  what failed +
                                  [Contact dispatch]
                                         |
                                  owner override
                                  (reason required,
                                   permanently visible)
```

Full screen means full screen — not a sheet, not a modal. Works offline and queues, consistent with existing mobile behaviour. Back navigation preserved so the driver can review before signing.

---

# Section 13 — Notifications and boards

Ten new triggers on the existing catalogue, each independently subscribable:

| Trigger | Audience | Channels |
|---|---|---|
| Trip assigned · reminder | Driver | Push, in-app |
| Inspection passed | Subscribers | In-app |
| Passed with defects | Subscribers | In-app, email |
| Inspection failed | Subscribers | In-app, email, push |
| Inspection overridden | Subscribers | In-app, email |
| Trip started · completed | Subscribers | In-app |
| Import needs review · failed | Uploader | In-app (+email on fail) |

```
 +-------------------------------------------------+
 | LIVE BOARD        [ Drivers ]  Trucks           |
 +-------------------------------------------------+
 | Mike R  T-104  West MKE   Hall Ford   4/12  ok  |
 | Dana P  T-107  North Run  en route    7/9   ok  |
 | Sam O   T-112  South      Boucher     2/8   X   | <- failed
 +-------------------------------------------------+
      one data source · one row component ·
      swapped primary column for the Trucks view
```

**Today's Trips report** — trip, client, driver, truck, planned and actual start, inspection status, stops done over total, on-time, exceptions, location. Default sort puts problems first:

```
 failed inspection -> not started -> behind schedule
 -> on track -> completed
```

Inspection status is colour **and** icon **and** text. Cover the colour with your thumb and it still reads.

---

# Section 14 — Edge cases

| Case | Behaviour |
|---|---|
| **Same consignee twice** (common, see 1.3) | One stop, summed quantities, all references, all pages |
| Consignment spans a page break | Merge on external code + shipment ref |
| Photos out of order | Sort by page number, else user reorders first |
| One page unreadable | Flag it, extract the rest, re-shoot that page |
| Zero consignments | Clean failure, "clearer photo" action |
| User closes mid-review | Persists at NEEDS_REVIEW, resume banner |
| Client created mid-flow | Wizard state survives |
| Duplicate upload | Blocked, link to existing trip, or import as correction |
| Two dispatchers, same manifest | Dedupe blocks at extraction, not commit |

Dedupe key: SHA-256 over source bytes + tenant + document number + document date, enforced at the database level.

Per-page caching: hash each page independently. Re-running sixteen pages where one was re-shot bills for one page.

---

# Section 15 — Security and design rules

**Security:** tenant column and RLS on every new table · tenant-prefixed storage keys validated server-side · retention window on `rawExtraction` (it holds third-party PII; committed entities are the record of truth) · driver residences restricted per Section 9 · dispatcher-or-above to commit · rate-limit extraction per tenant.

**Design:** no borders on cards, elevation via surface contrast · one accent colour on one primary action · spacing on 8/12/16/20/24 · no FABs, add is the top-right tinted circle · identical field order in view and edit · status = colour + icon + text · red only for errors and destructive actions (a failed inspection qualifies, a "new" badge does not) · web light tokens, mobile iOS dark · text never clips.

**Stack:** locked. Read `package.json` before reaching for anything. If a capability genuinely is not there, flag it rather than installing.

---

# Section 16 — Acceptance test

Run the whole thing after Phase 11, before Phase 12.

```
  1  upload 4-page photo manifest, 8 consignees,
     one repeated
  2  duplicate merged, quantities summed, both pages kept
  3  unknown client -> create inline -> state survives
  4  single-contract client -> collapses
  5  no template -> continue without
  6  6 facilities created with confirmation ->
     external refs written
  7  bulk note on 2 stops -> confirmation names count
  8  end stop = home base -> pinned last
  9  expired-licence driver -> commit blocked, reason shown
 10  valid driver + truck -> atomic commit, all created
 11  driver gets push, opens trip
 12  full-screen checklist, one critical fail with photo
 13  trip blocked, dispatcher notified
 14  owner override with reason -> starts, visible
 15  live board shows driver, truck, stop, badge
 16  report sorts it to the top
 17  re-upload -> blocked as duplicate with link
 ------------------------------------------------------
 18  NEXT DAY: same run, new quantities.
     All facilities silent. Template auto-matches.
     Photo -> committed trip in under 90 seconds,
     3 taps.
```

**Step 18 is the product.** Everything above it is the machinery that makes it possible.

---
---

# Section 17 — The build prompts

Twelve prompts, in order. Each one ends by telling Claude Code to commit, so you can stay in one place.

Copy each prompt exactly, including the reference to this file. These are also in the standalone companion file `DocumentImport_Prompts.md` if that is easier to copy from.

---


## Phase 0 — Repository audit

**What it does.** Nothing gets built. Claude Code reads the codebase
and writes down what actually exists — real table names, real file
paths, real libraries. Everything after this depends on it.

**Before you run it.** Spec Section 0.4 complete. The spec saved at
`docs/specs/DocumentImport_TechnicalSpec_v1.md`.

```
Use the GSD skill. This is an AUDIT pass only — no feature code,
no migrations, no components.

Read docs/specs/DocumentImport_TechnicalSpec_v1.md in full first.

Then read this repository and reconcile the spec against what
actually exists. Report exact findings, never assumptions.

Read and report on:

1. The full Prisma schema. Record the EXACT model names, field
   names, enums, and relations for: client, contract, route
   template, trip or dispatch, stop, load, facility, document,
   driver, truck, checklist, inspection, notification, and tenant
   settings. If more than one naming universe exists, state
   clearly which is live and which is dead code.

2. The existing AI document extraction feature: exact file paths,
   model used, prompt construction, persistence, and whether
   extraction is human-reviewable before commit.

3. The storage layer: presigned upload, multipart upload, tenant
   key prefixing, signed download.

4. Facility creation, any existing address normalisation, and the
   geocoding utility.

5. The route template save path and the trip generation path.

6. The checklist and inspection system as built: how checklists
   are defined, assigned, completed, and signed. Does a
   full-screen driver flow already exist?

7. The notification system: trigger catalogue, channels,
   subscription model, and how a new trigger gets registered.

8. The live tracking dashboard and any existing driver or truck
   list views.

9. The DataGrid component and its API.

10. The in-app documentation system: feature registry, help
    centre, and how entries are added.

11. Auth guards: requireRole, requireTenantId, s3Key tenant
    validation.

12. package.json in apps/web and apps/mobile. List every library
    relevant to routing/optimisation, PDF handling, spreadsheet
    parsing, image handling, drag and drop, forms, tables, and
    state.

Write .planning/document-import/00-AUDIT.md containing:

A. A name-mapping table: the term used in the spec, and the
   actual entity or file in this repo.
B. Every place the spec conflicts with the live schema, with your
   recommended resolution and why.
C. Everything the spec assumes exists that does not, and what
   would have to be built.
D. Every capability the spec needs where no installed library
   covers it. Give two options using only what is installed.
   Do not install anything.
E. Go or no-go on each of the 12 build phases, and any phase you
   would resequence, with reasoning.
F. Top five risks, ranked.

Constraints:
- Modify no files except the new audit document.
- Install nothing.
- Every entity and field name in your report must be one you
  actually read. Mark anything you propose as new with NEW.

When the audit is written, give me a plain-English summary in 15
lines or fewer: the real entity names, the top three conflicts,
and anything you would resequence.

Then commit with:
docs: document import repository audit (phase 0)

Then stop. Do not start Phase 1.
```

**Verify**

| # | Check | Pass when |
|---|---|---|
| 1 | Grep 5 entity names vs schema | All 5 exist verbatim |
| 2 | Open 3 cited file paths | All 3 open |
| 3 | Section D names real packages | 2 verified |
| 4 | `git diff --stat` | One new file only |

**Most likely drift.** Names copied from the spec's vocabulary
instead of read from the schema.

**Send the audit to Ayaz before Phase 1.**

---

## Phase 1 — Data model and extraction service

**What it does.** The plumbing. New tables plus the service that
turns photos into structured data. Nothing looks different yet.

**Before you run it.** Phase 0 reviewed. Model, storage, and DB
credentials working locally.

```
Use the GSD skill to build Phase 1 of the Document Import module.

Read docs/specs/DocumentImport_TechnicalSpec_v1.md Sections 5, 6,
14, and 15. Read .planning/document-import/00-AUDIT.md and use its
name mapping. Follow this repo's existing conventions for
tenancy, soft delete, indexes, and RLS.

Build, in this order:

1. Schema additions per spec Section 6: the import record, the
   facility external reference table, the document profile table,
   and the extensions to tenant settings, route template, trip,
   stop, and facility. Use this repo's real model names from the
   audit. Generate the migration. Additive only — no drops, no
   renames, no column type changes.

2. Zod schemas in the shared validation package for the canonical
   extraction shape in spec Section 5. Every field advisory
   except consignment name and address.

3. An extraction service with a clean interface, isolated from
   any UI:
   - accepts an ordered list of source files with MIME types
   - splits PDFs into pages, normalises images
   - hashes each page independently and caches extraction per
     page hash
   - extracts pages in bounded-concurrency batches
   - assembles pages into the canonical shape, merging
     consignments that span page breaks or repeat across pages by
     external code plus shipment reference, summing quantities
     and keeping all page numbers
   - returns per-field confidence and an extraction warnings
     array
   - records model identifier, token counts, and cost on the
     import record
   - treats a zero-consignment result as a clean typed failure,
     not an exception

4. A separate spreadsheet path for XLSX and CSV producing the
   same canonical shape via a saved column mapping on the
   document profile. No vision model for spreadsheets.

5. The import lifecycle state machine with the statuses in spec
   Section 6, rejecting illegal transitions.

6. Deduplication per spec Section 14: SHA-256 over source bytes
   plus tenant plus document number plus document date, enforced
   with a database constraint.

7. Unit tests for: page merge logic, deduplication, illegal state
   transitions, and the spreadsheet mapper.

Constraints:
- No UI in this phase.
- Install nothing. Use libraries confirmed present in the audit.
  If a capability is missing, stop and tell me rather than
  installing.
- Extend the existing AI extraction feature from the audit rather
  than building a parallel pipeline. If extending is not viable,
  explain why before diverging.
- Tenant isolation on every table, query, and storage key.
- Money as Decimal, never number.

Before writing code, tell me your approach in three sentences.

When done, run npx tsc --noEmit in both apps and run the tests,
and paste the real output. Write
.planning/document-import/01-SUMMARY.md with your decisions and
anything deferred.

If everything passes, commit with:
feat: document import data model and extraction service (phase 1)

If anything fails, tell me what failed in plain English and stop
without committing.
```

**Verify**

| # | Check | Pass when |
|---|---|---|
| 1 | **Merge fixture:** 43775 twice, qty 4 and 1 | One stop, qty 5, both pages |
| 2 | Read the migration SQL | Additive only |
| 3 | Drop DB, re-migrate | Applies clean |
| 4 | Run tsc + tests yourself | Green |
| 5 | Same document twice | Far fewer tokens 2nd run |
| 6 | Diff package.json + lockfiles | Empty |

**Most likely drift.** The merge logic being a stub — it is the
fiddliest thing here. Read that function line by line. Second:
dedupe in app code with no DB constraint, which lets concurrent
uploads through.

---

## Phase 2 — Upload and intake

**What it does.** The first thing a user sees. Button, camera, file
picker, reorderable thumbnails, progress bar.

**Before you run it.** Phase 1 green. Mobile device or simulator
with camera. Test manifest as photos and PDF.

```
Use the GSD skill to build Phase 2 of the Document Import module.

Read docs/specs/DocumentImport_TechnicalSpec_v1.md Sections 4, 14,
and 15. Read .planning/document-import/00-AUDIT.md and
01-SUMMARY.md.

Build the intake experience only. No client resolution, no stop
review, no commit.

1. A single primary action labelled Import Document, top-right on
   the Trips list page in the owner web portal and on the mobile
   owner home screen. Follow spec Section 15: top-right tinted
   circle, no FAB.

2. Source selection: Take photos, Upload file, Choose recent.
   Accepts multi-image capture, multi-page PDF, XLSX, and CSV.

3. Multi-photo staging before extraction: visible thumbnails,
   drag to reorder, delete, add more, retake a single page. Pages
   get photographed out of order in a warehouse, so this matters.

4. Upload through the existing storage layer with its existing
   tenant key prefixing and multipart path. Reuse it, do not
   reimplement it.

5. Extraction progress: page counter, cancellable, resilient to
   the user backgrounding the app. On completion, route to a
   summary card placeholder.

6. Duplicate detection per spec Section 14, with both actions:
   open the existing trip, or import as a correction.

7. Failure states in plain language: unreadable page with a
   re-shoot action for that page only, zero consignments with a
   clearer-photo action, upload failure with retry.

8. Resume: an import left at NEEDS_REVIEW shows a banner on the
   Trips page, and resuming restores exact state.

Constraints:
- Use the existing component library, existing upload code, and
  existing mobile camera integration. Install nothing.
- Web uses the light brand token system; mobile uses the iOS dark
  aesthetic.
- 44px minimum touch targets on mobile.
- No modal interruptions for warnings.

Before writing code, tell me your approach in three sentences.

When done, run npx tsc --noEmit in both apps and paste the real
output. Write .planning/document-import/02-SUMMARY.md.

If everything passes, commit with:
feat: document import upload and intake (phase 2)

If anything fails, tell me what failed in plain English and stop
without committing.
```

**Verify**

| # | Check | Pass when |
|---|---|---|
| 1 | 4 photos **out of order**, reorder, extract | Result matches reorder |
| 2 | Same manifest as PDF, then sheet | PDF extracts; sheet uses parser |
| 3 | Upload same file twice | Blocked, both actions work |
| 4 | Background mid-extraction | Intact or recoverable |
| 5 | Close mid-review, reopen Trips | Resume banner restores |
| 6 | Deps + tsc | Clean |

**Most likely drift.** The reorder UI existing but the order never
reaching the extraction service — invisible unless tested. Also
watch for a second upload utility next to the existing one.

---

## Phase 3 — Client, contract, summary card

**What it does.** The system works out who the document belongs to.
Confident, it says so in one card. Not confident, it asks one
clear question.

**Before you run it.** Phase 2 green. Two test clients, one with a
single contract and one with three. A rate confirmation PDF.

```
Use the GSD skill to build Phase 3 of the Document Import module.

Read docs/specs/DocumentImport_TechnicalSpec_v1.md Section 4 and
the four-document-type table in Section 5. Read the prior phase
summaries.

Build client and contract resolution plus the
confidence-collapsing summary card. No facility resolution or
template matching yet — stub the template row visually and note
it clearly in your summary.

1. Client resolution per spec Section 4.2: auto-select on an
   exact match to one active client, or a pinned document
   profile. Otherwise a searchable picker with the extracted name
   pre-typed, plus Create new client pre-filled from extracted
   details.

2. Contract resolution: auto-select when the client has exactly
   one active contract or a profile pins it. Otherwise a picker.

3. One-time spot contract creation for rate confirmations:
   flagged as spot, flat rate from the document, effective for
   that trip only, source document attached, and clearly labelled
   in the client's contract list so it is never mistaken for a
   standing agreement.

4. The summary card exactly as drawn in spec Section 4.1: client,
   contract, template, date, and a stop-count line, each with a
   change affordance. Confidently resolved values collapse into
   this card; only unresolved decisions get their own step.

5. A why affordance on every auto-resolved value, revealing the
   matched text and the score. Small, secondary, never noisy.

6. Wizard state survives creating a client or contract mid-flow
   without restarting.

Constraints:
- Only the summary card may present more than one unresolved
  decision.
- Never show a form with many empty fields. Pre-fill from
  extraction.
- Reuse existing client, contract, and picker components.
- Install nothing. Money as Decimal.

Before writing code, tell me your approach in three sentences.

When done, run npx tsc --noEmit in both apps and paste the real
output. Write .planning/document-import/03-SUMMARY.md.

If everything passes, commit with:
feat: client and contract resolution with summary card (phase 3)

If anything fails, tell me what failed in plain English and stop
without committing.
```

**Verify**

| # | Check | Pass when |
|---|---|---|
| 1 | Client with one contract | Both collapse, no extra screen |
| 2 | Client with three contracts | Only contract step expands |
| 3 | Unknown client, create inline | **Wizard state survives** |
| 4 | Rate con, no contract | Spot offered, rate pre-filled |
| 5 | Tap "why" on two imports | Different real scores |
| 6 | Spot contract rate in DB | Decimal, not float |

**Most likely drift.** A hardcoded confidence score behind the why
affordance, and wizard state that does not survive navigation.

---

## Phase 4 — Facility resolution ladder

**What it does.** The highest-value phase. The system learns that
43775 means Russ Darrow Nissan, once, and never asks again.

**Before you run it.** Phase 3 green. Collect 30 real address pairs
for the fixture first, including two genuinely different addresses
on the same street that must not match.

```
Use the GSD skill to build Phase 4 of the Document Import module.

Read docs/specs/DocumentImport_TechnicalSpec_v1.md Section 7 in
full, plus the security notes in Section 15.

This is the highest-value phase in the module.

1. A shared address normalisation utility: case, punctuation,
   street suffixes, directionals, suite and unit split into a
   separate field, postal codes. One implementation, used
   everywhere.

2. Unit tests against a fixture of at least 30 real address
   pairs, including suffix variants, directional variants, suite
   in line1 versus line2, missing postal code, and two genuinely
   different addresses on the same street that must NOT match.

3. The four-tier ladder exactly as drawn in spec Section 7:
   T1  exact match on external reference (tenant, client, code)
       — silent auto-link
   T2  exact match on normalised address within tenant — silent
       auto-link, backfill the external reference
   T3  fuzzy match above threshold — REQUIRES a human tap, shows
       candidate, score, and differing fields
   T4  no match — REQUIRES a human tap, shows a pre-filled create
       form

4. Fuzzy scoring: name token overlap plus street number plus
   postal code. Threshold in a single constants file with a
   comment explaining the value.

5. Facility types from the audit's real values — consignees take
   receiver, origin takes shipper. Do not invent new types.

6. External reference rows written on every confirmed resolution
   and every T2 backfill, so the second import of the same client
   resolves silently.

HARD RULE: never create a facility from T3 or T4 without an
explicit human tap. A polluted facility table is unrecoverable.

Constraints:
- Install nothing. Implement fuzzy matching with what is present.
- Tenant-scope every lookup server-side.
- Extend existing facility creation paths, do not modify them.

Before writing code, tell me your approach in three sentences.

When done, run npx tsc --noEmit in both apps and run the tests,
and paste the real output. Write
.planning/document-import/04-SUMMARY.md.

If everything passes, commit with:
feat: facility resolution ladder and external references (phase 4)

If anything fails, tell me what failed in plain English and stop
without committing.
```

**Verify**

| # | Check | Pass when |
|---|---|---|
| 1 | **Import the same manifest twice** | 2nd: zero taps, all silent |
| 2 | Read fixture, add one hard case | 31 pass, incl. the negative |
| 3 | Facility with reformatted address | T2 silent, ext ref written |
| 4 | Near-match facility | T3 proposes, cannot bypass |
| 5 | Check the DB | Ext ref per confirmed match |
| 6 | Grep the threshold number | Appears in one file |

**Most likely drift.** Auto-creating on T3 — the most damaging
failure in the build. Import a near-match and watch whether a
facility appears without your tap. Also watch for fuzzy scoring
implemented as string equality, which makes T3 unreachable.

---

## Phase 5 — Stop review

**What it does.** Where the dispatcher checks the work. Editable,
reorderable list with bulk apply.

**Before you run it.** Phase 4 green. An import reaching the stop
list with a mix of resolved and unresolved facilities.

```
Use the GSD skill to build Phase 5 of the Document Import module.

Read docs/specs/DocumentImport_TechnicalSpec_v1.md Section 10,
plus the design rules in Section 15.

Build the stop review screen. No template matching, no
optimisation, no commit.

1. The stop list per the layout in spec Section 10: one row per
   consignment showing facility name, resolution badge (linked,
   proposed, new), quantity rollup, and reference count. Drag to
   reorder. Tap to open the detail editor.

2. The stop detail editor with every field listed in Section 10.
   Field order identical between view and edit modes. Line items
   add and remove. Rollups computed from line items but
   overridable, with the override visibly marked.

3. The bulk apply bar: select stops, apply a note or required
   documents or appointment window or stop type to the selection,
   copy quantities from the stop above, and clear any
   bulk-applied field. Every bulk action confirms with the count
   and the fields.

4. Blocking validation per Section 10. The primary action is
   disabled with the reason named inline. Warnings appear as one
   dismissible summary, never as modals.

5. Design rules from Section 15 are mandatory: no borders on
   cards, one accent colour on the single primary action, spacing
   on 8/12/16/20/24, status badges pair colour with icon and
   text, red only for errors. A "new" badge is not red.

Constraints:
- Reuse the existing DataGrid or list primitives from the audit
  rather than building a bespoke table.
- Use the existing drag and drop library if one is installed; if
  not, native HTML5 drag and drop on web and the existing gesture
  handler on mobile. Install nothing.
- Long facility names truncate with the full value on tap. Text
  never clips.

Before writing code, tell me your approach in three sentences.

When done, run npx tsc --noEmit in both apps and paste the real
output. Write .planning/document-import/05-SUMMARY.md.

If everything passes, commit with:
feat: stop review screen with bulk apply (phase 5)

If anything fails, tell me what failed in plain English and stop
without committing.
```

**Verify**

| # | Check | Pass when |
|---|---|---|
| 1 | Select stops, **scroll**, bulk apply | Off-screen ones got it |
| 2 | Reorder, navigate away, return | Order persisted |
| 3 | Leave one facility unresolved | Disabled, reason inline |
| 4 | Open a stop, view then edit | Field order identical |
| 5 | 60-character facility name | Truncates, no clipping |
| 6 | Thumb over badge colours | Meaning still clear |

**Most likely drift.** Bulk apply hitting only visible rows, and
reorder that updates local state without persisting.

---

## Phase 6 — Route template matching

**What it does.** The system notices today looks like last week's
run and offers to reuse the saved order. This is what takes day
two down to ninety seconds.

**Before you run it.** Phase 5 green. Two templates on a test
contract, one close match and one poor. Work out one expected
score by hand from spec Section 8.

```
Use the GSD skill to build Phase 6 of the Document Import module.

Read docs/specs/DocumentImport_TechnicalSpec_v1.md Section 8 in
full.

1. Candidate selection: templates on the selected contract,
   widened to the client's templates when the contract has none,
   with widened candidates visibly labelled.

2. Scoring exactly as specified: resolve facilities first, then
   Jaccard over facility ID sets, weighted down when stop counts
   differ by more than 30 percent, ordering ignored. Thresholds
   0.75 and 0.45, both in one constants file with a comment.

3. Presentation: at or above 0.75 the template collapses into the
   summary card. Between 0.45 and 0.75, show up to three ranked
   candidates each with a stop diff. Below 0.45, offer only
   Continue without a template.

4. Application and diff handling per the diagram in Section 8.
   Template supplies order, appointment windows, required
   documents, and standing notes. Import supplies quantities,
   references, and per-stop notes. Facilities in the import only
   append at the end badged New, draggable. Facilities in the
   template only are included badged Not on today's manifest,
   defaulted to skipped, one tap to keep.

5. A post-commit offer to update the template when the trip
   differed. Offered once, never silent.

6. Automatic template creation gated on a new tenant setting
   autoCreateRouteTemplatesFromImports, default off. Auto-created
   templates carry the source import reference and appear in a
   Suggested templates section, separate from hand-built ones
   until confirmed. Guard: do not create when the stop set
   already scores above 0.75 against an existing template.

7. A one-tap Save as route template on the commit success screen
   when the setting is off.

Constraints:
- Do not reorder stops automatically on application. Template
  order is applied; further changes belong to the user.
- Reuse the existing route template save path, do not fork it.
- Install nothing.

Before writing code, tell me your approach in three sentences.

When done, run npx tsc --noEmit in both apps and paste the real
output. Write .planning/document-import/06-SUMMARY.md.

If everything passes, commit with:
feat: route template matching and creation (phase 6)

If anything fails, tell me what failed in plain English and stop
without committing.
```

**Verify**

| # | Check | Pass when |
|---|---|---|
| 1 | Compute one score by hand | System matches |
| 2 | 0.9 / 0.6 / 0.2 matches | Collapse / 3 shown / none |
| 3 | Apply a template | Order kept, qty correct |
| 4 | Extra stop, missing stop | New at end / skipped badge |
| 5 | Setting on, near-match set | **No duplicate template** |
| 6 | Grep 0.75 and 0.45 | One file |

**Most likely drift.** Scoring on names instead of resolved
facility IDs, and the duplicate-template guard being skipped,
which quietly ruins the template list over a few weeks.

---

## Phase 7 — End stop and optimisation

**What it does.** Adds the last stop of the day so the return is
tracked, and offers a better driving order when one exists.

**Before you run it.** Phase 6 green. Home base facility
configured. A driver with a home address. A second driver account
for the privacy test.

```
Use the GSD skill to build Phase 7 of the Document Import module.

Read docs/specs/DocumentImport_TechnicalSpec_v1.md Section 9 in
full.

Part A — end stop policy:

1. The five policies in Section 9, resolved in order: tenant
   default, then template override, then per-trip choice.

2. Reuse this repo's existing facility types exactly as recorded
   in the audit. Do not invent new types.

3. The end stop is a real stop with a real sequence and geofence,
   pinned last, so arrival is tracked and the working day closes
   for mileage and pay.

4. DRIVER_RESIDENCE privacy is a hard requirement: visible only
   to the assigned driver, the owner, and dispatchers with
   explicit permission. Not in the general facility picker, not
   suggested for other trips, excluded from every export.
   Implement as a server-side filter, not a UI hide.

5. Tenant settings for defaultEndStopPolicy and
   homeBaseFacilityId, plus the per-template override.

Part B — optimisation:

6. Optimisation is a SUGGESTION only. Sequence stays the source
   of truth and is set by a human. Never mutate order
   automatically.

7. Runs on a route template when created or edited. Runs on a
   trip only when stops were added or removed relative to the
   template.

8. Constraints: pickups precede their deliveries, firm
   appointment windows are hard, soft windows are penalties, end
   stop pinned last.

9. Presentation: one line stating miles and minutes saved, with
   Keep current order and Use suggested order. Below the
   configured floor, do not offer it at all.

10. Cache the distance matrix per ordered facility set so an
    unchanged template does not re-bill daily.

Constraints:
- Use the routing provider already wired into this project, from
  the audit. Do not add another. Install nothing.

Before writing code, tell me your approach in three sentences.

When done, run npx tsc --noEmit in both apps and paste the real
output. Write .planning/document-import/07-SUMMARY.md.

If everything passes, commit with:
feat: end stop policy and route optimisation (phase 7)

If anything fails, tell me what failed in plain English and stop
without committing.
```

**Verify**

| # | Check | Pass when |
|---|---|---|
| 1 | Each of the five policies | Correct end stop, pinned last |
| 2 | **Call API directly** as driver B | A's residence filtered |
| 3 | Accept then decline a suggestion | Changes / does not |
| 4 | Firm appointment window | Respected in suggestion |
| 5 | Two trips, unchanged template | Provider called once |
| 6 | Saving below the floor | No suggestion at all |

**Most likely drift.** Privacy done as a UI conditional. Test
through the API, not the screen — this one is a real data-leak
risk rather than a cosmetic issue.

---

## Phase 8 — Assignment, validation, commit

**What it does.** Turns the reviewed import into a real trip, all
at once or not at all. The riskiest phase — a bug here leaves
broken records behind.

**Before you run it.** Phase 7 green. Test data: a driver with an
expired licence, a driver already assigned to an overlapping trip,
a truck out of service.

```
Use the GSD skill to build Phase 8 of the Document Import module.

Read docs/specs/DocumentImport_TechnicalSpec_v1.md Section 11 in
full, plus the security notes in Section 15.

1. The assignment screen: driver, truck, trailer if this repo
   models it, planned start time, end stop policy. The driver
   picker shows availability inline — already assigned today,
   hours remaining, compliance flags — so no second screen is
   needed.

2. Pre-commit validation with the exact severities in Section 11.
   Blocks: overlapping assignment, expired licence or medical
   when enforcement is on, truck out of service or overdue
   inspection. Everything else warns. Blocks disable the primary
   action with the reason named. Warnings are one dismissible
   summary.

3. The commit transaction, atomic, in the order drawn in Section
   11: confirmed new facilities and external references, trip,
   stops in sequence including the end stop, loads, documents,
   import record update, template create or update. The driver
   notification is enqueued AFTER the transaction commits, never
   inside it.

4. Document attachment: source file at trip level, and page
   slices attached to their stops using pageNumbers, so a driver
   at stop five opens page four rather than a sixteen-page scan.

5. Rollback: any failure rolls back entirely, sets the import to
   NEEDS_REVIEW, and shows the dispatcher what failed in plain
   language. No orphan records under any circumstance.

6. An integration test that forces a failure at each step of the
   transaction and asserts against the DATABASE that zero partial
   state remains. Assert on real rows, not on mocks.

Constraints:
- Use this repo's existing transaction pattern.
- Money as Decimal, never number.
- Validate the storage key tenant prefix server-side on every
  attachment. Install nothing.

Before writing code, tell me your approach in three sentences.

When done, run npx tsc --noEmit in both apps and run the tests,
and paste the real output. Write
.planning/document-import/08-SUMMARY.md.

If everything passes, commit with:
feat: assignment, validation, and atomic trip commit (phase 8)

If anything fails, tell me what failed in plain English and stop
without committing.
```

**Verify**

| # | Check | Pass when |
|---|---|---|
| 1 | **Read** the rollback test, then run | Asserts on DB, not mocks |
| 2 | Query DB after each forced failure | Zero rows left |
| 3 | Expired licence / overlap / OOS truck | All three block, reason shown |
| 4 | Open stop 5 on a committed trip | Correct single page |
| 5 | Kill notification service, commit | Trip still created |
| 6 | Call commit API with blocked driver | Still blocked |

**Most likely drift.** The rollback test asserting on a mock — the
most important test in the build and the easiest to fake. Also:
notification enqueued inside the transaction, so a slow
notification service rolls back a valid trip.

---

## Phase 9 — Driver start and inspection gate

**What it does.** The driver's side. Notification, trip,
full-screen walkaround, signature, and either the trip starts or
it does not.

**Before you run it.** Phase 8 green. A checklist with at least one
critical item. A device that can go offline. Push working locally.

```
Use the GSD skill to build Phase 9 of the Document Import module.

Read docs/specs/DocumentImport_TechnicalSpec_v1.md Section 12 in
full, plus the design rules in Section 15.

Extend the existing checklist and inspection system from the
audit. Do not build a second one.

1. Trip start checks in the order drawn in Section 12: is an
   inspection required for this trip (tenant setting, per-trip
   override), has a valid one already been completed today for
   this truck by this driver within the validity window,
   otherwise open the checklist.

2. The full-screen checklist, taking over the entire view. Not a
   sheet, not a modal.
   - One section per screen, progress indicator across the top
   - Each item pass, fail, or not applicable, 44px minimum
     targets
   - A failed item requires a note and offers photo capture, and
     the photo uploads immediately so a lost connection does not
     lose the evidence
   - Back navigation preserved so the driver can review before
     signing
   - Signature capture on the final screen, driver name and
     timestamp printed beneath
   - Works offline and queues, consistent with this app's
     existing offline behaviour

3. Outcomes per Section 12: all pass starts the trip;
   non-critical failures start the trip and log defects against
   the truck; any critical failure blocks when
   blockTripStartOnFailedInspection is on.

4. The blocked-driver screen: what failed, that dispatch has been
   told, and a Contact dispatch action. Never a dead end.

5. Owner override from trip detail in the owner portal, before or
   after a failure. Typed reason required. Written to the audit
   trail with user and timestamp, and surfaced permanently on the
   trip record and in reports.

6. New tenant settings: requirePreTripInspection, and
   blockTripStartOnFailedInspection defaulting to on.

Constraints:
- Reuse existing checklist definitions, the existing signature
  component if one exists, and the existing offline queue. Do not
  weaken existing offline behaviour. Install nothing.
- Mobile uses the iOS dark aesthetic. Red for a failed item only,
  not for progress or navigation.

Before writing code, tell me your approach in three sentences.

When done, run npx tsc --noEmit in both apps and paste the real
output. Write .planning/document-import/09-SUMMARY.md.

If everything passes, commit with:
feat: driver trip start and inspection gate (phase 9)

If anything fails, tell me what failed in plain English and stop
without committing.
```

**Verify**

| # | Check | Pass when |
|---|---|---|
| 1 | **Airplane mode**, full inspection | Syncs, nothing lost |
| 2 | Fail item, check bucket immediately | Photo already uploaded |
| 3 | Fail a critical item | Blocked, contact action works |
| 4 | Override with / without reason | Starts / impossible |
| 5 | Go back mid-checklist | Answers preserved |
| 6 | 2nd inspection, same truck, same day | Skipped |

**Most likely drift.** Photos held in memory and uploaded at the
end. Test by killing the app right after capturing one.

---

## Phase 10 — Notification triggers

**What it does.** Wires up who gets told what. Ten triggers on the
existing system, each independently subscribable.

**Before you run it.** Phase 9 green. Two owner accounts, one
subscribed and one not. Email working locally.

```
Use the GSD skill to build Phase 10 of the Document Import module.

Read docs/specs/DocumentImport_TechnicalSpec_v1.md Section 13.

Extend the existing notification trigger catalogue and channel
system from the audit. Do not build a parallel mechanism.

1. Register the ten new triggers in the Section 13 table with the
   audiences and channels given there.

2. Wire each trigger to its emit point in the code built in
   phases 8 and 9. Emit outside the commit transaction.

3. Subscription is per user, per trigger, self-service in the
   existing notification preferences UI. Nothing forced.

4. Content must be actionable at a glance without opening the
   app. The inspection failed notification names the driver, the
   truck, the trip, and the failed items. The override
   notification names the overriding user and the reason.

5. Deduplicate: a trigger firing twice for the same entity within
   a short window sends once.

Constraints:
- Use the existing block-based notification editor and the
  existing email and in-app channels. Install nothing.
- Do not change the behaviour of any existing trigger.

Before writing code, tell me your approach in three sentences.

When done, run npx tsc --noEmit in both apps and paste the real
output. Write .planning/document-import/10-SUMMARY.md.

If everything passes, commit with:
feat: document import notification triggers (phase 10)

If anything fails, tell me what failed in plain English and stop
without committing.
```

**Verify**

| # | Check | Pass when |
|---|---|---|
| 1 | Subscribe A only, fail inspection | **Only A**, 3 channels |
| 2 | Read the delivered notification | Names driver, truck, items |
| 3 | Fire same trigger twice fast | One notification |
| 4 | Spot-check two existing triggers | Unchanged |

**Most likely drift.** Notifications going to all owners
regardless of subscription. Test with an unsubscribed account.

---

## Phase 11 — Live board and report

**What it does.** What the owner looks at. Two views of the same
live data, and a report that puts problems at the top.

**Before you run it.** Phase 10 green. Test trips covering all five
states: failed inspection, not started, behind schedule, on track,
completed.

```
Use the GSD skill to build Phase 11 of the Document Import module.

Read docs/specs/DocumentImport_TechnicalSpec_v1.md Section 13,
plus the design rules in Section 15.

1. A segmented toggle at the top of the existing live tracking
   dashboard: Drivers and Trucks.

2. Drivers view, one row per on-duty driver: driver, truck, trip,
   current or next stop, stops completed over total, estimated
   time to next stop, inspection badge, last position timestamp.

3. Trucks view, one row per active truck: truck, assigned driver,
   trip, current location, status, hours in service today, next
   scheduled maintenance.

4. Both views share ONE data source and ONE row component with a
   swapped primary column. Build the generic version first, then
   layer the specifics. Do not duplicate logic across the two
   views.

5. Today's Trips report: trip, client, driver, truck, planned
   start, actual start, inspection status, stops completed over
   total, on-time status, exception count, current location.
   Filters on status, driver, client, and inspection status.
   Default sort puts trips needing attention first: failed
   inspection, then not started, then behind schedule, then on
   track, then completed.

6. Inspection status pairs colour with icon and text. Never
   colour alone.

Constraints:
- Reuse the existing DataGrid component. Do not build a bespoke
  table.
- If you hit an existing list-view rendering issue in the live
  tracking dashboard, fix it rather than working around it. If
  the fix is genuinely out of scope, tell me and leave a note
  rather than duplicating the component.
- Install nothing.

Before writing code, tell me your approach in three sentences.

When done, run npx tsc --noEmit in both apps and paste the real
output. Write .planning/document-import/11-SUMMARY.md.

If everything passes, commit with:
feat: live board views and today's trips report (phase 11)

If anything fails, tell me what failed in plain English and stop
without committing.
```

**Verify**

| # | Check | Pass when |
|---|---|---|
| 1 | Toggle views, **network tab open** | No refetch |
| 2 | Report with all five states | Failed inspection on top |
| 3 | Each filter, then combined | All work |
| 4 | Zero active trips | Real empty state, no crash |
| 5 | Search diff for row components | Exactly one |
| 6 | Thumb over inspection colour | Still readable |

**Most likely drift.** Two nearly identical row components —
exactly the duplication the architecture avoids. And empty state
crashing, because it gets skipped in testing constantly.

---

## Phase 12 — In-app documentation

**What it does.** The help for the customers who will use this.
Written from the built app, not from the spec, because by now the
two will differ.

**Before you run it.** Phase 11 green, and the spec Section 16
acceptance test passing end to end. Do not document a feature you
have not seen work.

```
Use the GSD skill to build Phase 12 of the Document Import
module. Final phase.

Read docs/specs/DocumentImport_TechnicalSpec_v1.md. Read every
phase summary in .planning/document-import/.

Write the documentation FROM THE APP AS BUILT, not from the spec.
Where they disagree, the code is correct and the spec gets
corrected.

1. Feature registry entries, one per user-facing capability:
   Document Import, Route Template Matching, End Stop Policy,
   Inspection Gate, Live Board Views, Today's Trips Report. Each
   with a plain-language description, the roles that can use it,
   and the settings that govern it.

2. Help centre articles written for a dispatcher, not a
   developer. No jargon, no field names, no table names. Step
   lists where a flow has more than three steps:
   - Importing your morning manifest
   - What to do when a stop address is not recognised
   - Using and updating route templates
   - Setting where your trips end
   - Turning the pre-trip inspection on or off
   - Reading the Today's Trips report

3. Settings documentation for every new tenant setting from
   phases 1 to 11: the default, what turning it on changes, and
   who it affects.

4. Driver-facing help, kept short: how to start a trip, how to
   complete an inspection, what to do if it fails.

5. Update docs/technical-documentation.md with a Document Import
   section: entity flow, API routes added, microflows, and the
   architectural rules that should not be broken.

6. Correct docs/specs/DocumentImport_TechnicalSpec_v1.md wherever
   the build differs, and add a changelog at the top listing what
   changed and why.

Constraints:
- Use the existing in-app documentation system and its entry
  format. Install nothing.
- Every article readable by someone who has never used a TMS.
- Document only what was actually built. Anything deferred goes
  in the changelog, not the docs.

When done, write .planning/document-import/12-SUMMARY.md and give
me a plain-English list of everything deferred across all twelve
phases.

If everything passes, commit with:
docs: document import in-app documentation (phase 12)

If anything fails, tell me what failed in plain English and stop
without committing.
```

**Verify**

| # | Check | Pass when |
|---|---|---|
| 1 | Follow every article in the app | Steps work |
| 2 | 3 documented defaults vs code | Match |
| 3 | Feature registry vs deferred list | No unbuilt entries |
| 4 | Give one article to a non-TMS person | They can follow it |

---

# Section 18 — Final checks

```
 +------------------------------------------------------+
 | git diff main..HEAD -- '**/package.json' '**/*lock*' |
 |     -> returns nothing                                |
 |                                                       |
 | git diff main..HEAD | grep -c "as any\|@ts-ignore"   |
 |     -> returns 0                                      |
 |                                                       |
 | npx tsc --noEmit  (both apps) · all tests            |
 |     -> green                                          |
 |                                                       |
 | every migration on the branch                         |
 |     -> additive only                                  |
 |                                                       |
 | every new API route                                   |
 |     -> role guard + tenant scope                      |
 |                                                       |
 | Section 16 acceptance test, all 18 steps              |
 |     -> especially step 18: under 90 sec, 3 taps       |
 +------------------------------------------------------+
```

Then send Ayaz the deferred list and correct this document to match what was built. The next person will read it and believe it — worth leaving true.

Anything in here that turned out to be wrong, or that you would build differently next time, is worth writing down too. That feedback shapes the next module.

# Phase 3 — Client, contract, summary card

**Spec:** `docs/specs/DocumentImport_TechnicalSpec_v1.md` Sections 4.1, 4.2, 5
**Prior:** `00-AUDIT.md` · `01-SUMMARY.md` · `02-SUMMARY.md` · `DECISIONS.md`
**Branch:** `feature/document-import`
**Scope:** client and contract resolution, and the summary card. No facility
resolution, no template matching, no stop review, no commit.

---

## The shape of it

**Nothing in the resolution view is stored.** The import row holds four ids —
`client_id`, `contract_id`, `route_template_id`, `document_profile_id` — and
every other thing the card shows is computed from those plus the extraction plus
the live client and contract tables, on every read.

```
  document_imports row        clients / contracts          document_profiles
   (4 ids, nothing else)        (live, right now)          (learned aliases)
            \                          |                          /
             +------------------------ + -----------------------+
                                       |
                              resolution.ts  ← computes candidates,
                                       |        scores, matched text,
                                       |        and whether a row collapses
                                       |
                                 ImportView.resolution
                                  /              \
                       web summary card      mobile summary card
```

Three things follow from that, and they are the reason it is built this way:

1. **The score behind "why" is about the two strings in front of the user**, not
   one frozen at confirmation time against a client name that has since been
   edited. The phase's stated drift risk is "a hardcoded confidence score behind
   the why affordance" — there is no score column for a constant to hide in, and
   `scoreNameMatch` is a pure function with sixteen tests around it.
2. **Wizard state cannot be lost**, because there is none. Creating a client
   mid-flow is one POST that creates and selects in the same request, and the
   response is the next screen state. Reload, background the app, kill the tab,
   or pick the import up on the other surface — all land in the same place.
3. **A client deactivated between two reads stops being auto-selectable
   immediately**, with no cache to invalidate.

---

## What shipped

### Server (`apps/web/src/lib/document-import/`)

| File | What it does |
|---|---|
| `matching.ts` | **NEW** normalisation + Dice-bigram/token-containment scoring. `1.0` is reachable only by exact normalised equality; everything else caps at `0.99`. |
| `profiles.ts` | **NEW** the `DocumentProfile` layer — alias learning, exact alias lookup, `pinnedContractId`. |
| `money.ts` | **NEW** `normaliseMoney` — document amount → decimal **string**, no `Number` anywhere. |
| `resolution.ts` | **NEW** the whole computed view, plus `assignClient` / `assignContract` / `setDocumentDate` / `createAndAssignClient` / `createAndAssignContract`. |
| `handlers.ts` | +4 transport-neutral handlers, error-code → status table. |
| `intake.ts` | `ImportView.resolution`, computed only in the four statuses where there is something to resolve. |
| `persistence.ts` | `contractId` / `routeTemplateId` / `documentProfileId` added to `ImportRecord` and its select. |
| `lib/carrier/one-time-contract.ts` | **NEW** the "One-time" test, dependency-free so client components can import it. |
| `lib/carrier/clients.ts`, `contracts.ts` | `createClient` / `createContract` take an **optional** pre-resolved tenant client. |

**6 route files**, mirrored across both surfaces:
`GET|PATCH /[id]/resolution` · `POST /[id]/resolution/client` ·
`POST /[id]/resolution/contract`.

### Web UI

- `components/carrier/imports/ImportSummaryCard.tsx` — the card, and the
  decision about which screen to show.
- `ClientDecision.tsx` — searchable picker with the extracted name pre-typed,
  plus the pre-filled create form.
- `ContractDecision.tsx` — contract picker and the spot offer.
- `WhyPopover.tsx` — the why affordance.
- `ImportProgress.tsx` — placeholder card replaced; document facts demoted to a
  secondary block.
- "One-time" label added to the contracts grid, the client's contracts tab, the
  `ds` mobile-web contracts list, and the contract detail header.

### Mobile UI

- `components/imports/ImportResolution.tsx` — the same three screens in RN, 44px
  targets, `useThemeColors`, bottom sheet for "why".
- `app/(owner)/imports/[id].tsx` — placeholder replaced.
- `packages/api-client` — 9 resolution types and 6 methods.

---

## The decisions that matter

### Only an exact match auto-selects. No fuzzy score ever does.

Spec 4.2 says client collapses on "exact match to one active client". That is
implemented literally: `score === EXACT_MATCH`, where `EXACT_MATCH` is `1` and
`scoreNameMatch` **cannot return 1 for anything but exact normalised equality** —
the blended fuzzy score is capped at `0.99` on the way out.

This is not defensive coding, it is the whole safety property. A 0.94 match
between "Russ Darrow Nissan" and "Russ Darrow Kia" is the failure this module
exists to prevent, and the cost of refusing to collapse on it is one tap.
`matching.test.ts` locks four such near-miss pairs down explicitly.

Normalisation does the work that a fuzzy threshold would otherwise be asked to
do: case, punctuation, `&`→`and`, and trailing legal suffixes, so "Dealer Tire,
LLC" and "Dealer Tire" are an exact match rather than a 0.9.

### "A pinned document profile" — what it actually is

The phase prompt names it as a second collapse condition, but the row is keyed
`(orgId, clientId, documentType)`, so it cannot be looked up before the client is
known and cannot itself be the lookup. What makes it work as one is an **alias
list**: confirming a client records the name **as printed on the document** onto
that client's profile, and the next document printing that name collapses with
"saved on this client from a previous import" as the reason.

That is the `FacilityExternalReference` pattern one level up — confirm once,
resolve silently forever (spec 1.5) — and it needs no schema change, because
`extraction_hints` is JSON and exists for exactly this. `pinnedContractId` is a
real column and is used literally.

The alias lookup is **exact after normalisation, never fuzzy**. A fuzzy
auto-select is how a document silently lands on the wrong client, and a learned
alias is not more trustworthy than a name — it is only more likely to recur.

### The spot contract, and why no DDL

Full evidence in **DEC-12**. `contract_type='spot'` (CHECK admits it),
`rate_type='flat'` (CHECK admits it), `base_rate` is `numeric(10,4)`, and
`effective_date = expiration_date = the document's date` — a term of one day,
which **is** "effective for that trip only".

The label is derived from that term, not from the name and not from provenance.
A naming convention breaks on a rename; provenance answers the wrong question,
because a standing contract selected during an import is equally
import-adjacent. `isOneTimeContract()` reads what was agreed.

Money never passes through a float: `normaliseMoney` returns a **string**,
`Prisma.Decimal` is constructed from that string, and `money.test.ts` pins
`'2400.10'` staying `'2400.10'` rather than becoming `2400.1`.

### The header-reading trap, avoided rather than reproduced

`createClient` and `createContract` both called `getTenantPrisma()`, which reads
the `x-tenant-id` header that **does not exist on `/api/mobile/*`** — the exact
bug DEC-11 diagnosed. Rather than write second implementations for the mobile
surface, both take an **optional** pre-resolved client; omitting it is the
existing behaviour, so every current call site is untouched, and the import path
passes `getTenantPrismaForOrg(orgId, userId)`.

### Changing the client clears the contract

A contract belongs to a client, so a contract selected under the old one is not
stale, it is wrong. That is a deliberate loss of one confirmed value rather than
a silently invalid pair.

### The stop-count breakdown is absent, not zero

Section 4.1 draws "11 matched · 1 new" under the stop count. Facility matching is
Phase 4, so `stops.matched` and `stops.created` are **null**, and the UI shows a
note instead. "0 matched" would read as "none of your twelve stops are known",
which is a claim nothing has checked.

### `carrier_documents` — a production RLS gap, found and NOT fixed

The DEC-8 schema diff turned up that `carrier_documents` has **RLS enabled and
FORCED with zero policies**. It works today only because the connecting role
bypasses RLS (DEC-11); under the outstanding `app_user` cutover every read and
write to it fails — driver stop documents, contract documents, and the
attachment this phase adds.

Pre-existing, not caused here, and **not fixed here**: DEC-3 says DDL is applied
deliberately by a human who has read it, and adding policies to a table on the
driver app's read path is not a change to slip into a phase commit. It also
genuinely needs designing rather than copying — `carrier_documents` has no
`org_id` and is scoped through `parent_type`/`parent_id`, so the policy is a
join. Recorded as **DEC-13**, owned by the RLS Phase 2 cutover.

`attachSourceDocument` catches and logs, so under the cutover the contract is
still created and selected and only the attachment is lost. That is containment,
not a fix, and DEC-13 says so.

---

## Per-item audit of the Phase 3 prompt

Written against the prompt text item by item, not from memory of the work
(DEC-9's standing rule).

**Preamble — "No facility resolution or template matching yet — stub the
template row visually and note it clearly":** IMPLEMENTED. The template row is
`{ state: 'STUB', note: ... }` **in the payload**, not only in the UI, so no
surface can imply more than there is; it renders as "Not matched yet · Later
phase" on both. Nothing writes `route_template_id`. No facility code was
touched.

| # | Item | Verdict |
|---|---|---|
| 1 | Client: auto-select on exact match to one active client, or a pinned profile; else searchable picker, name pre-typed, Create new pre-filled | IMPLEMENTED |
| 2 | Contract: auto-select on exactly one active contract or a profile pin; else picker | IMPLEMENTED |
| 3 | One-time spot contract for rate cons: spot, flat rate, that trip only, source document attached, clearly labelled | **PARTIALLY** — see below |
| 4 | Summary card exactly as Section 4.1: client, contract, template, date, stop-count, each with a change affordance | IMPLEMENTED |
| 5 | Why affordance on every auto-resolved value, matched text and score, small and secondary | IMPLEMENTED |
| 6 | Wizard state survives creating a client or contract mid-flow | IMPLEMENTED |

### 1 — IMPLEMENTED

`buildClientSlot` tries, in order: already chosen → learned profile alias → exactly
one exact match. Active means `status='active' AND deleted_at IS NULL AND
is_sample=false` (samples excluded per the standing selector rule). The picker
opens with `slot.documentText` already in the box and ranked candidates; typing
re-ranks server-side against what was typed. `createPrefill` carries name,
contact, phone, email and the full address from the extraction header.

### 2 — IMPLEMENTED

`buildContractSlot`: already chosen → `profile.pinnedContractId` → exactly one
active. "Active" excludes contracts whose `expiration_date` has passed even when
`status` still says active — otherwise "exactly one active contract" could
auto-select a dead agreement.

### 3 — PARTIALLY

Spot / flat / one-day term / labelled: IMPLEMENTED, evidence in DEC-12, label
shown in four places. Rate pre-filled from `header.totalRate` and editable.

**The source-document attachment is written but cannot be relied on after the
RLS cutover** — see DEC-13. It succeeds today. It is also attached as a
`carrier_documents` row pointing at the import's **first source file key**, which
for a multi-page rate confirmation is page one rather than the whole document;
there is no multi-file document record to point at. Declared rather than claimed.

### 4 — IMPLEMENTED (corrected: was PARTIALLY, twice over)

Five rows, in the drawn order, each with a change affordance — including the
date, which gets one because spec 1.2 callout (3) is that a date can sit in a
field labelled "Number", making it the field most likely to be plausibly wrong.
The stop-count line's affordance is the card's `Review stops` button, which is
disabled and says why (Phase 5).

**Two things this verdict missed, both found in the walkthrough and both fixed
in the defect round below.** Recorded here rather than quietly amended, because
how the audit passed them is more useful than the fact that it did:

1. **The date row never carried a value.** The check I ran was "is the row
   drawn, in the drawn order, with a change affordance" — structural, against
   the five names in the prompt. It was not "does the row show what the document
   says", and on every test import the row read "None on the document", which is
   a legitimate rendering of an empty column and so looked like data rather than
   a broken pipeline. The drawing in Section 4.1 says `Date  Mon 27Jul`. It was
   never once that. Auditing a row's existence is not auditing a row.

2. **The heading above the card was the filename.** Section 4.1 draws no title
   line at all, so a checklist built from the drawing had no entry for one, and
   "page-2.jpg" sat above a card headed "We found this" without anything in the
   audit having a place to object. The prompt item is "the summary card exactly
   as drawn" — the omission is real, but it is an omission the method could not
   have caught, because the method only looked for what the drawing contains.

Confidence collapse is structural rather than disciplined: an unresolved client
returns the client step early and renders one question; an unresolved contract
does the same; the card is drawn only when neither does. The card is therefore
the only place two different rows can be opened, and it opens them one at a time
— which is how "only the summary card may present more than one unresolved
decision" is satisfied.

### 5 — IMPLEMENTED

A muted, text-sized "why" on each resolved row: popover on web, bottom sheet on
mobile. Shows how it resolved, the document text, the matched text, and the
score. A value a person chose shows **no score** and says so in a sentence,
rather than rendering an empty field — nothing was guessed, so there is no
number.

Candidate rows in the picker show their score inline as well. When the system is
asking rather than telling, how close each option is *is* the useful
information.

### 6 — IMPLEMENTED

Create-and-select is a single request, so there is no window in which the client
exists and the import does not know. The response is the next screen state.
There is no client-side wizard state at all: everything is on the row.

### Constraints

| Constraint | Verdict |
|---|---|
| Only the summary card may present more than one unresolved decision | IMPLEMENTED — enforced by early return, not by discipline |
| Never show a form with many empty fields; pre-fill from extraction | IMPLEMENTED — only fields extraction actually filled are rendered, plus the required name |
| Reuse existing client, contract, and picker components | **PARTIALLY** — see below |
| Install nothing | IMPLEMENTED — dependency diff empty |
| Money as Decimal | IMPLEMENTED — `normaliseMoney` → string → `Prisma.Decimal` → `numeric(10,4)`; no `Number` in the path |

**Reuse — PARTIALLY, and precisely where.** `createClient` and `createContract`
are reused outright, including the per-org unique-name rule, contact
normalisation, and contract-number generation with its collision retry — that is
the substantive half. **The pickers are new.** `SearchableSelect` filters a fixed
option list client-side; this one ranks server-side against a document name and
re-queries as you type, which is a different component rather than a
configuration of that one. `NewClientSheet` is a `ds`-token bottom sheet on the
dark mobile-web breakpoint and posts to `/clients` rather than to the import; the
create form here is light-token, inline, and creates-and-selects in one request,
which is the property item 6 depends on. Both are judgement calls against an
instruction to reuse, so they are named here rather than glossed.

### Process items

| Item | Verdict |
|---|---|
| Read spec Section 4 and the Section 5 document-type table | IMPLEMENTED |
| Read prior phase summaries | IMPLEMENTED |
| Three-sentence approach before code | IMPLEMENTED |
| Real `tsc` output, both apps | IMPLEMENTED — below |
| `03-SUMMARY.md` with a per-item audit | IMPLEMENTED — this document |
| Live-schema diff against the spec (DEC-8) | IMPLEMENTED — below, and it found DEC-13 |
| GSD skill | **PARTIALLY** — see "Not done, and why" |

---

## Not done, and why

**The GSD skill was not invoked as a slash command.** `/gsd:quick` spawns
`gsd-executor` subagents, and this session runs under an explicit instruction not
to use the Agent tool. Its guarantees were followed inline instead — atomic
commit, state tracked in this file and `DECISIONS.md`, per-item audit — which is
also the pattern Phases 1 and 2 of this module used (`.planning/document-import/`
rather than `.planning/phases/`). Stated because it is an instruction not
followed literally.

**Section 4.1's "11 matched · 1 new" line.** Facility resolution is Phase 4.
`matched` and `created` are null and the UI shows the reason.

**Template matching.** Phase 6. The row is a declared stub.

**No spot contract for non-rate-confirmations.** The offer appears only when
`document_type = 'RATE_CONFIRMATION'`, per Section 5's table. That part stands.

What did not stand was what a manifest with no contract got instead: the step
stated "This client has no active contract" — twice, once from the heading and
once from `blockedReason` — and pointed at the client page, with no action on
screen. A client created inline moments earlier has no contracts by definition,
so that was the ordinary path for every new client, and it left the wizard with
nowhere to go. Fixed after the walkthrough: `contract.createOffer` is non-null
exactly when the picker is empty and there is no spot offer, and both surfaces
render a "Create and use" for a standing contract from it. It carries the client
and nothing else — a manifest states what moved, not the terms of an agreement,
so the rate and the term are left for the contract's own page. The reasoning for
not building it (a full contract form) was wrong about what was needed: the
contract only has to exist and be selected.

**The date picker on mobile is a typed `YYYY-MM-DD` field.** No date-picker
package is installed and this phase installs nothing. Web uses `<input
type="date">`.

**`document_profiles` soft-delete has an edge.** `getProfile` filters
`deleted_at IS NULL`, but the unique key ignores it, so reviving a soft-deleted
profile starts the alias list fresh rather than resurrecting old aliases. That is
the behaviour I want — a deleted profile's aliases should not silently return —
but it is a consequence rather than a design, and it is written down here so the
next phase does not rediscover it as a bug.

**Client candidates are loaded in full, not paged.** `buildClientSlot` reads
every active client in the tenant with its active contracts, because scoring the
document name against all of them is what "exactly one exact match" means — a
paged query cannot answer "is this unique". Fine at carrier scale (hundreds), and
it runs only in the four resolvable statuses, never during progress polling. If a
tenant ever has thousands of clients this becomes the thing to fix, and the fix
is a normalised-name index rather than paging.

**No integration test of the resolution write path.** `matching`, `money`,
`profiles` (lookup) and `one-time-contract` are unit tested — 37 new tests. The
Prisma-touching half (`resolution.ts`, the routes) is verified by `tsc`, the
schema diff, and reading, not by tests, consistent with how the rest of this
module is covered. **The six checks in the phase's verify table have not been
run against a live import** — no S3 credentials, no emulator, no test manifest in
this session. What each one rests on is set out below, honestly labelled.

---

## Verification

### TypeScript — real output

```
$ cd apps/web && npx tsc --noEmit
WEB EXIT CODE: 0

$ cd apps/mobile && npx tsc --noEmit
MOBILE EXIT CODE: 0
```

Both silent. Note `packages/api-client` must be rebuilt (`npx tsc` in that
package) before the mobile typecheck sees the new exports — `main` is
`./dist/index.js` and `dist` is gitignored. Same trap 01- and 02-SUMMARY flagged.

### Tests

```
$ npx vitest run src/lib/document-import src/lib/carrier/__tests__/one-time-contract.test.ts
 ✓ matching.test.ts           (16)  ← new
 ✓ money.test.ts               (7)  ← new
 ✓ profiles.test.ts            (6)  ← new
 ✓ one-time-contract.test.ts   (8)  ← new
 ✓ hashing · lifecycle · merge · spreadsheet · upload · extractor · service · materialise · pdf-render
 Test Files  13 passed (13)
      Tests  193 passed (193)
```

**Full web suite, measured against the baseline rather than assumed:**

| | Files failed | Tests failed | Tests passed | Total |
|---|---|---|---|---|
| Phase 1 close | 14 | 61 | 782 | 901 |
| Phase 2 close | 14 | 61 | 830 | 949 |
| **Phase 3** | **14** | **61** | **882** | **1001** |

The failing set is byte-identical to both prior phases — all 14 pre-existing,
none in document-import, none touching anything this phase changed. Passing rose
by 52.

### Dependencies

```
$ git diff --stat package.json apps/*/package.json packages/*/package.json package-lock.json
(empty)
```

Nothing installed.

### Live-schema diff (DEC-8 standing rule)

Run **against the spec's requirements for this phase**, not against what the code
writes — that distinction is what DEC-9 established, and it is what turned up
DEC-13.

| Check | Result |
|---|---|
| `document_imports.client_id / contract_id / route_template_id / document_profile_id` | all present, `uuid`, nullable |
| `document_profiles` — 14 columns incl. `extraction_hints jsonb NOT NULL`, `pinned_contract_id uuid`, `deleted_at` | present |
| `document_profiles_org_client_type_key UNIQUE (org_id, client_id, document_type)` | present — the alias upsert depends on it |
| `document_profiles_pinned_contract_fkey → contracts(id) ON DELETE SET NULL` | present — a deleted contract unpins itself |
| `contracts.base_rate` | `numeric(10,4)` — **Decimal, verify check 6's column side** |
| `contracts_contract_type_check` admits `spot` | yes |
| `contracts_rate_type_check` admits `flat` | yes |
| `contracts.effective_date / expiration_date` | both `date`, both nullable |
| `carrier_documents` — parent/contract/client/type/url/filename/uploaded_by/notes | all present |
| `app_user` grants on all six tables touched | SELECT, INSERT, UPDATE, DELETE on each |
| RLS + FORCE RLS on `clients` / `contracts` / `document_imports` / `document_profiles` | yes, with `tenant_isolation_policy` + `bypass_rls_policy` |
| **RLS on `carrier_documents`** | **enabled + FORCED with ZERO policies — see DEC-13** |
| Every model queried is in `EXEMPT_MODELS` (DEC-11 rule) | yes — `CarrierClient`, `CarrierContract`, `CarrierClientContact`, `CarrierDocument`, `DocumentImport`, `DocumentProfile`. No new model added. |

**No DDL was written or applied — and that is a checked claim, not an
assumption.** DEC-12 sets out, requirement by requirement, where each part of
item 3 lives in the existing schema and what in production was queried to
confirm it.

### Phase 3 verify table

| # | Check | Status |
|---|---|---|
| 1 | Client with one contract → both collapse, no extra screen | **Code path verified, not run.** `buildClientSlot` exact-match branch + `buildContractSlot` `candidates.length === 1` branch → both `RESOLVED` → `ImportSummaryCard` skips both early returns and draws the card. Needs a live import. |
| 2 | Client with three contracts → only the contract step expands | **Code path verified, not run.** Client `RESOLVED` returns past its early return; contract `UNRESOLVED` renders `ContractDecision` alone. Needs a live import. |
| 3 | Unknown client, create inline → **wizard state survives** | **Structurally guaranteed, not run.** There is no client-side wizard state; create-and-select is one request returning the next state, and the position lives in `document_imports`. Needs a live import to demonstrate. |
| 4 | Rate con, no contract → spot offered, rate pre-filled | **Code path verified, not run.** `offerSpot()` gates on `document_type === 'RATE_CONFIRMATION'`; `totalRate` from the extraction header pre-fills the field. Needs a real rate confirmation. |
| 5 | Tap "why" on two imports → different real scores | ✅ **Covered by tests.** `matching.test.ts` asserts four different pairs produce four distinct values, ordered as a human would order them, and that no near miss reaches 1.0. The UI reads that function's output directly, with no score column anywhere. |
| 6 | Spot contract rate in DB → Decimal, not float | ✅ **Both halves checked.** Column is `numeric(10,4)` (live schema, above); the value reaches it as a string via `normaliseMoney` → `Prisma.Decimal`, with `money.test.ts` pinning `'2400.10'` against float truncation. The end-to-end write has not been run. |

**Checks 1–4 are wired but not executed**, for the same reason Phase 2's were:
no S3 credentials, no emulator, and no test manifest in this session. Claiming
them green would be a guess. Checks 5 and 6 are real, and 6 is real on both the
column side and the value side.

---

## What Phase 4 needs from here

- `resolution.client.value.id` is the client every facility lookup keys on —
  `FacilityExternalReference` is unique on `(orgId, clientId, sourceCode)`, and
  the client is now resolved before stop review begins.
- `stops.matched` / `stops.created` are null and waiting for the facility ladder
  to fill them; the note under the count is the thing to replace.
- `document_profiles.extraction_hints.originNames` is the established shape for
  learned-per-client data. Facility codes go in `FacilityExternalReference`, not
  here — that table already exists and is the higher-value one.
- `templateSlot()` in `resolution.ts` is a single function returning the stub,
  and is where Phase 6 plugs in.
- **DEC-13 is not a Phase 4 task but it is a live risk** — anything in Phase 4
  that writes `carrier_documents` inherits it.

---

# Defect round — 2026-08-04

Five defects from a live walkthrough of a manifest and a rate confirmation. No
DDL: the two new extraction fields live in `raw_extraction`, which is `jsonb`,
so the Zod schema is the only contract that changed (DEC-3 respected).

## 1 — The client on a rate confirmation was the warehouse

`clientParty()` in `resolution.ts` now chooses the party by document type:
`header.issuerName` for a rate confirmation, `header.originName` for everything
else, falling back to the origin when no issuer was printed.

The old code read `originName` for every type. On a manifest that is the shipper
and the shipper pays, so it was right. On a rate confirmation the origin block is
the **pickup facility** — the live import stored `originName = "MIDWEST
DISTRIBUTION CENTER"`, a warehouse — while the company hiring the carrier was the
broker on the letterhead. The broker was never offered as a candidate at all, and
worse, `assignClient` would have taught the document profile that "MIDWEST
DISTRIBUTION CENTER" means that client, so the next rate confirmation from the
same broker would have collapsed onto the warehouse **without asking**.

`issuerName` / `issuerAddress` / `issuerContact` were added to the extraction
header and the prompt now defines both blocks explicitly, including the
instruction never to copy the pickup into the issuer to fill the field. The
origin block is still extracted and still correct — Phase 4 needs it as the first
stop. It is simply not the client on this document type.

Create-new pre-fills from the same party, so a broker is created with the
broker's address rather than the warehouse's. The evidence row under the card,
labelled "Named on it", now shows `clientNameOnDocument` — the string actually
matched — and the pickup gets its own row, "Loads at", when the two differ.

## 2 — The date never reached the card

Traced end to end. Which link was broken, with the evidence:

| Link | State | Evidence |
|---|---|---|
| Prompt asks for it | Yes | `EXTRACTION_PROMPT` has `"documentDate": string\|null` and rule 1 ("Manifest Number: 07/27/26 is a date") |
| Model returns it | **Yes** | `raw_extraction.header.documentDate` = `"07/27/26"` (manifest), `"08/03/26"` (rate con) |
| Zod keeps it | Yes | `documentDate: z.string().nullish()` — no format constraint, nothing dropped |
| **Parsed to the column** | **NO** | `parseDocumentDate` matched `^\d{4}-\d{2}-\d{2}` only, returned null for both |
| Column | Empty | `document_date` NULL on all 8 rows in `document_imports` |
| Card reads it | Yes | `resolution.documentDate` ← `record.documentDate` — the right field of an empty column |

The prompt never said what format `documentDate` should be in, so the model
returned it exactly as the page printed it, and the parser accepted only ISO.
Nothing logged, because null is a legitimate answer for a document with no date.

Both halves fixed: the prompt now demands ISO (rule 1b, including the two-digit
year rule), and `parseDocumentDate` accepts what documents actually print —
`MM/DD/YY`, `MM/DD/YYYY`, dashes and dots, month-first per US freight
convention — while rejecting `02/31/26` rather than rolling it into March.

The imports already in the table only carry the printed form, so `documentDateOf`
falls back to parsing the extraction when the column is null. Those imports show
the right date now, without being re-read and re-billed.

## 3 — The card was titled from the filename

`ImportSummaryView.title` and `ImportListItem.title` are composed from the party
and the document type — "Apex Freight Brokerage LLC rate confirmation", "Dealer
Tire - Chicago WHSE manifest" — falling back to the filename only when extraction
yields neither. ALL-CAPS names are title-cased for display, with trade
abbreviations (LLC, WHSE, DC…) left alone; a name with any lowercase in it is
printed exactly as the document had it.

Why the per-item audit passed it is written up under **item 4** above rather than
here: the short version is that the audit checked the five rows the spec draws,
and the spec draws no title line, so nothing in the method had a place to object
to "page-2.jpg".

## 4 — Resume routed to a failed import

`listResumableImports` included `FAILED`, so the Trips banner offered a CSV that
could not be parsed under the words "Pick up where you left off". The status list
is now the exported `RESUMABLE_STATUSES` — `UPLOADED`, `EXTRACTING`,
`NEEDS_REVIEW` — and both surfaces read it from the server, so neither banner can
drift from the other. The dead `FAILED` branches in the two banner components
were removed with it.

Failed imports stay in "Choose recent", which lists everything, because the
re-shoot path lives on the import's own page and taking that away would remove a
real recovery. What they gained is a dismiss (a cancel, `FAILED → CANCELLED`,
already a legal edge) on both surfaces — until now there was no way to get rid of
one at all.

## 5 — Multi-contract with none right

`createOffer` was gated on `candidates.length === 0`. It is now gated on the
absence of a spot offer alone, so a client with three contracts and a load that
moved under none of them gets the same inline create, rendered **below** the
options with "None of these? Create a contract for…". A picker whose every row is
the wrong agreement is the same dead end as an empty one; the only difference is
that it does not look like one. The spot offer stays exclusive to rate
confirmations, and where it exists it remains the only offer.

## Verification

```
apps/web   npx tsc --noEmit   → clean
apps/mobile npx tsc --noEmit  → clean
vitest src/lib/document-import src/components/carrier/imports
   Test Files  17 passed (17)
        Tests  228 passed (228)
```

29 new tests across `document-date.test.ts` (the parser, including the exact
strings the live imports stored), `rate-con-party.test.ts` (issuer as candidate,
alias learned against the issuer, prefill from the issuer's address, manifest
unaffected, date fallback, titles) and `resumable.test.ts` (the status list).
The two contract tests that encoded "a picker means no create path" were
rewritten — that scope was the defect.

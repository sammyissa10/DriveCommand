# Document Import — Decisions Record

Decisions taken during the document-import module build, with the reasoning that
produced them and where each one is enforced in the codebase.

**Label prefix is `DEC-`**, deliberately. `00-AUDIT.md` already uses bare `D1`–`D5`
for its *capability-gap* findings (D1 = no XLSX library, D5 = per-page PDF caching
at risk). Those are observations about what the repo lacked; these are choices we
made. Do not cross-reference them by bare number — say `DEC-4` or `audit D1`.

---

## DEC-1 — Facility type mapping and the widened CHECK

Extracted facility roles map onto the existing `facilities.facility_type`
vocabulary rather than introducing a parallel one:

| Document role | `facility_type` |
|---------------|-----------------|
| consignee     | `customer_site` |
| origin        | `warehouse`     |

The CHECK constraint was widened to admit a sixth value, `driver_residence`:

```
CHECK (facility_type = ANY (ARRAY['terminal','yard','warehouse',
                                  'drop_yard','customer_site','driver_residence']))
```

Applied to production 2026-08-02 via Supabase MCP (migration name
`widen_facilities_facility_type_check_driver_residence`), and mirrored into the
repo afterwards as `20260802173535_widen_facility_type_check`, marked applied with
`prisma migrate resolve --applied` rather than re-run. Widening a CHECK only
*admits* values, so no existing row could violate it and no rows were rewritten.

The Phase 1 migration added `is_driver_residence` and `resident_driver_id` but
omitted this widening — the flag existed while the value it implied was still
rejected by the database. That gap is what this migration closes.

**Privacy semantics live on the flag, not the type.** `is_driver_residence` plus
`resident_driver_id` are what the server-side filter in spec Section 9 reads. A
driver residence must never appear in the general facility picker or in exports,
and that is enforced server-side, never as a UI hide. Do not infer privacy from
`facility_type = 'driver_residence'` alone.

---

## DEC-2 — PUSH notification channel

`PUSH` added to the `NotificationChannel` enum (applied to prod via Supabase MCP
2026-08-02, repo synced in follow-up migration
`20260802174618_add_push_notification_channel`).

**Phase 1 was instructed to do this and silently omitted it — the same omission
pattern as the `facility_type` CHECK in DEC-1.** In both cases Phase 1 shipped the
surrounding scaffolding while leaving out the one database change that made the
value usable, and in both cases the omission surfaced only when someone checked the
live schema against the instructions. Worth treating as a review item for later
phases, not a one-off.

Dispatcher wiring is deferred to Phase 10, reusing the `transitionTripStatus` push
mechanism in `lib/carrier/trips.ts` rather than growing a second delivery path.

**Nothing may send on PUSH before Phase 10.** The enum value exists so the schema is
honest about the target state; no code path emits on it yet.

---

## DEC-3 — There is no local database; DDL is applied deliberately

"Apply to the local database only" is **impossible in this repo** and no phase may
assume otherwise. Both `.env` and `.env.local` point at the same remote Supabase
host, and that project (`oqdhberkghtnszrkdvfm`, "drivecommand") is the only one on
the account — it is production. There is no `supabase/` directory, no Docker
stack, and no local Postgres.

**Standing rules, until a non-production database exists:**

1. All DDL is applied **deliberately** — via Supabase MCP, or via a reviewed manual
   `prisma migrate deploy` run by a human who has read the SQL.
2. **Auto-apply and auto-deploy hooks are banned.** See DEC-7.
3. **No phase may include drop-and-remigrate verification**, schema reset,
   `prisma migrate reset`, or any "verify by rebuilding from scratch" step. There is
   nothing to rebuild that is not live customer data.
4. Repo/database sync is achieved by writing the migration and marking it applied
   (`prisma migrate resolve --applied`), never by replaying it.

Lifting these rules requires provisioning a real non-production database first.

---

## DEC-4 — XLSX deferred to post-v1

No spreadsheet library exists anywhere in the monorepo (audit C14/D1): `papaparse`
handles CSV, and there is no XLSX reader in any `package.json`. Rather than add a
dependency late in Phase 1, v1 ships the **CSV path complete** and rejects `.xlsx`
uploads with explicit save-as-CSV guidance.

The rejection is a distinct failure code, `UNSUPPORTED_XLSX`
(`lib/document-import/service.ts`), not a generic type error — the user gets an
action they can take. Spreadsheet MIME types are listed in `XLSX_TYPES`
(`lib/document-import/pages.ts`).

---

## DEC-5 — Extraction model and token ceiling

`EXTRACTION_MODEL = 'claude-sonnet-5'` with `MAX_OUTPUT_TOKENS = 8192`, both
exported from `lib/document-import/extractor.ts` and overridable per call via
`opts.model`. Validated by a live extraction run on 2026-08-02.

Response parsing is deliberately **model-agnostic** (commit `1b027ef3`) so swapping
the model does not break parsing — the extractor does not depend on one model's
response shape.

---

## DEC-6 — Deferred to Phase 2

Two known items are explicitly Phase 2 scope, not Phase 1 gaps:

- **`rawResponse` persistence** — the raw model response is not yet stored on the
  import row. Phase 2 owns it, alongside `document_imports` persistence generally.
- **The `ZERO_CONSIGNMENTS` failure-message fix** — the code is discriminated
  correctly today (`extractor.ts`, `service.ts`, `spreadsheet.ts`); the remaining
  work is the user-facing message wording.

---

## DEC-7 — Auto-deploy and auto-apply hooks removed

Two hooks in `.claude/settings.local.json` were removed, both of which took a
production action as a silent side effect of ordinary editing, and both of which
ended in `|| true` so any failure was swallowed:

- **`PostToolUse` on `Write`** — grepped written paths for `prisma/migrations` and
  ran `npx prisma migrate deploy`. Against a production-only database (DEC-3) this
  meant *authoring* a migration file shipped its DDL. Removed.
- **`Stop`** — ran `vercel --prod` whenever the last commit matched
  `docs(quick-N):`. Removed.

**All deploys go through GitHub.** No local `vercel --prod`.

This is the enforcement half of DEC-3 rule 2: a database or deploy action must be
something a human chose, not something a file write triggered.

---

## DEC-8 — `appointment_is_firm` on stops, and full-diff verification at phase close

`appointment_is_firm` added to `stops` — `BOOLEAN NOT NULL DEFAULT false`, where
`false` means a soft window. Applied to prod via Supabase MCP 2026-08-02, repo
synced in follow-up migration `20260802230853_add_appointment_is_firm`. Per spec
Section 9, optimisation treats a firm window as a hard constraint.

**This is the third instructed-or-specified schema item omitted by Phase 1**, after
the `facility_type` CHECK widening (DEC-1) and the `PUSH` enum value (DEC-2). It was
found by diffing spec Section 6 against the live schema — not by reading the Phase 1
migration, which looks internally complete and self-validating. That is the point:
the migration's own `DO $$` assertion block only checks what its author remembered
to add, so it cannot catch an omission. Only a comparison against the spec can.

**Standing rule: full-diff verification of the live schema against the spec is now a
required step at every phase close.** Not a review of the migration file — a diff of
what the database actually contains against what the spec says it should. Three
misses in one phase is a process failure, not three coincidences.

---

## DEC-9 — `document_import_pages.raw_response`, and the fourth silent omission

`raw_response TEXT NULL` added to `document_import_pages`. Applied to production by
Ayaz via Supabase MCP on 2026-08-03 (migration name
`add_raw_response_to_document_import_pages`), repo synced afterwards as
`20260803115314_add_raw_response` and marked applied with
`prisma migrate resolve --applied` rather than re-run, per DEC-3 rule 4.

`writePageOutcome` now writes `PageOutcome.rawResponse` into it, re-truncated at
`RAW_RESPONSE_LIMIT`. `failure_message` stays human-readable and never carries model
output — that separation is the whole reason the column exists.

### What actually went wrong

Phase 2 shipped with the per-page `rawResponse` **dropped**. It was not written to
`failure_message` or anywhere else; a 500-character preview went to a log line and
the rest was discarded. **DEC-6 had explicitly assigned "`rawResponse` persistence"
to Phase 2**, and 02-SUMMARY.md claimed that item closed while closing only the
import-row half (`raw_extraction`).

The code carried its own justification:

```ts
// `rawResponse` is diagnostic and can be 20KB of model output; the row has
// no column for it and `failure_message` is user-facing, so it is logged
// rather than persisted.
```

"The row has no column for it" was written as a fact about the world. It was a gap
that a four-line additive migration would have closed. **Once an omission is written
down as a justification it stops being a question**, and that is the mechanism by
which this one survived.

### This is the fourth, and the first to survive a self-audit

| | Omitted | Found by |
|---|---|---|
| DEC-1 | `facility_type` CHECK widening | live-schema check |
| DEC-2 | `PUSH` enum value | live-schema check |
| DEC-8 | `appointment_is_firm` | spec-vs-schema diff |
| **DEC-9** | `raw_response` + its migration | **Ayaz, against production, after a phase close that reported itself clean** |

DEC-8 already named the mechanism: *"the migration's own `DO $$` assertion block only
checks what its author remembered to add, so it cannot catch an omission."* Phase 2
reproduced that defect in a different medium. 02-SUMMARY.md was a **narrative**, not
an audit — organised around what was built and which decisions the author liked. A
narrative can only contain what its author remembered, so it has exactly the blind
spot DEC-8 described, and its "Not done, and why" section listed only the deferrals
that were already conscious choices.

Worse, the report's closing line — *"no DDL was written or applied"* — was true and
was presented as **compliance with DEC-3**. It is precisely the sentence that should
have triggered "…and should any have been?" It did not, and it read as a virtue while
covering a gap.

### Standing rule (extends DEC-8)

**A phase close must include a per-item audit of the phase prompt itself**, every
numbered step and every constraint marked IMPLEMENTED with a file path / PARTIALLY
with what is missing / NOT DONE with why. Prose summaries do not satisfy this. The
audit is written against the prompt text, item by item, not from memory of the work
— for the same reason DEC-8 requires diffing the database rather than reading the
migration.

**And: "no DDL was needed" is a claim requiring the same evidence as "this DDL was
applied."** Both are assertions about the schema. Only one of them was ever checked.

---

## DEC-10 — Import uploads use the single presigned PUT, not the multipart path

The Phase 2 prompt required uploads to go "through the existing storage layer with
its existing tenant key prefixing **and multipart path**". Tenant key prefixing is
reused verbatim (`generateUploadUrl`). **The multipart path is not, and this is why.**

The first Phase 2 commit declined it with a plausible-sounding paragraph in
`upload.ts` and never checked whether the existing path could actually carry an
import. It cannot. Three concrete findings, all read from the repo:

**1. The existing multipart route is hard-scoped to driver documents.**
`apps/web/src/app/api/documents/multipart/initiate/route.ts` rejects everything else
outright:

```ts
if (entityType !== 'driver') {
  return NextResponse.json(
    { error: 'Entity type must be "driver" for multipart uploads' }, { status: 400 });
}
```

It also gates content type on `ALLOWED_TYPES` + `EXTENSION_MIME_MAP`, which are
PDF/JPEG/PNG only — so it would reject `image/webp` and `text/csv`, two formats
intake accepts. "Use the existing multipart path" is not available as written; it
would mean widening a driver-document endpoint to carry imports, or writing a
parallel set of initiate/part-url/complete routes on **both** surfaces. The second
is the "second upload utility" the phase prompt warns against, at six files.

**2. The repo's own threshold puts every import file on the single-PUT side.**
`components/documents/driver-document-upload.tsx` picks its strategy at 5MB:

```ts
if (selectedFile.size < 5 * 1024 * 1024) { await uploadSmallFile(); }
else { await uploadLargeFile(); }
```

5MB is not arbitrary — it is S3's minimum part size, so below it multipart is a
single part wrapped in three extra round trips. Import sources are phone photos at
`quality: 0.8` (~1–3MB), scanned manifests, and CSVs measured in kilobytes. By the
repo's own rule, these belong on the single PUT.

**3. The 25MB ceiling is imposed by extraction, not by the upload.**
`MAX_IMPORT_FILE_BYTES` exists because the server reads every source file back into
memory (`getObjectBytes`) to hash it and hand it to the model. An import file
therefore can never reach the size at which multipart earns its complexity — a file
too big for multipart to matter is a file the pipeline refuses anyway, up front,
with a reason.

**Also worth stating:** multipart requires the client to read the `ETag` header off
every part response. The web client does this with `XMLHttpRequest` +
`Blob.slice`. React Native has neither over a file URI — it would need positional
base64 reads and untested ETag header access, i.e. new unproven code on the 5:30am
path, to serve a file size that cannot occur.

**Decision:** import uploads use one presigned PUT per source file, capped at 25MB
and refused above it with a plain-language reason. If a later phase raises that cap
— by streaming the hash instead of buffering — multipart becomes worth revisiting,
and the honest first step then is a general multipart route that is not scoped to
`entityType === 'driver'`.

**Not recorded here as a preference. Recorded because the first pass declined an
explicit instruction without saying so, which DEC-9 established is the failure mode
of this build.**

---

## DEC-11 — The page cache never worked, and why nobody could tell

Diagnosed 2026-08-03 from a symptom that looked like one bug and was four.
`cachedPages` stayed 0 on every re-run and `document_import_pages` stayed empty.

**1. The cache resolved its tenant from a request header.** `prismaPageCache` used
`getTenantPrisma()`, which reads the `x-tenant-id` header injected by
`middleware.ts`. That header does not exist on `/api/mobile/*` — Bearer auth means
no Supabase cookie, so middleware sees `user === null` and returns
`NextResponse.next()` early for `/api/*` — and it does not exist in a script at all
(`headers()` throws outside a request). **Every mobile import re-read every page at
full price**, silently, breaking the "re-shoot one page, bill for one page"
guarantee. Fixed by `getTenantPrismaForOrg(tenantId)`: the `PageCache` contract
already carries the org, and it comes from verified auth rather than a header.

**2. Four models were missing from `EXEMPT_MODELS`.** `DocumentImport`,
`DocumentImportPage`, `FacilityExternalReference` and `DocumentProfile` use `orgId`
like their carrier siblings and have no `tenantId` column — but were never added to
the exemption set in `lib/db/extensions/tenant-rls.ts`. The extension therefore
injected `{ tenantId }` into every query against them, which Prisma rejects.
**No document-import query could ever have succeeded**, on any surface. Phase 1
added the models; nothing exercised them until now, so it stayed invisible.

**Standing rule: a new model that scopes by `orgId` must be added to
`EXEMPT_MODELS` in the same change that adds it to `schema.prisma`.** The list is
not documentation — it is load-bearing, and omission is a runtime error rather than
a compile error.

**3. Errors serialized to `{}`.** `logger.warn(msg, { err })` stringifies its
context, and `JSON.stringify(new Error(...))` is `{}` because `message`, `stack` and
`name` are non-enumerable. Every failure above logged, correctly, and said nothing.
`serializeError()` (`lib/logger.ts`) now sweeps own property names.

**4. The one genuinely silent path was not `cache.put`.** `put` is a documented
no-op — `writePageOutcome` owns the row. The silence was in `extractDocument`'s
`report()`, which swallows anything `onPageSettled` throws so a paid-for page is
never lost. Correct, but it meant a failed row write produced no row, no log, and a
permanently cold cache. The call site now logs before rethrowing, and the swallow
keeps its guarantee.

### What tenant isolation actually rests on here (DEC-11)

Worth stating plainly, because it was checked rather than assumed. The connecting
role `postgres.<project>` has **`rolbypassrls = true`** — so for these tables, RLS
policies are currently inert regardless of the GUC, and `withTenantRLS` does not
inject for `orgId` models by design. Isolation therefore rests on the **explicit
`orgId` filter present in every query** in `cache.ts` and `persistence.ts`. That is
pre-existing (the `app_user` cutover is outstanding — see
`project_rls_phase1_grants_2026_06_02`), was not changed by this fix, and is the
reason those filters must never be dropped as "redundant with RLS".

---

## DEC-12 — The one-time spot contract needs no schema change, and here is the evidence

Phase 3 item 3 requires a spot contract "flagged as spot, flat rate from the
document, effective for that trip only, source document attached, and clearly
labelled in the client's contract list so it is never mistaken for a standing
agreement." **No DDL was written.** Per DEC-9 that is a claim requiring the same
evidence as "this DDL was applied", so:

| Requirement | Where it lives | Checked against production |
|---|---|---|
| flagged as spot | `contracts.contract_type = 'spot'` | `contracts_contract_type_check` admits `spot` |
| flat rate | `contracts.rate_type = 'flat'` | `contracts_rate_type_check` admits `flat` |
| the rate itself | `contracts.base_rate` | `numeric(10,4)` — a Decimal column |
| effective for that trip only | `effective_date = expiration_date = the document's date` | both `date`, both nullable |
| source document attached | `carrier_documents` row, `parent_type='contract'`, `contract_id` set | all columns present |
| clearly labelled | derived, `isOneTimeContract()` | — |

**The label is derived from the term, not from a name or from provenance.**
`lib/carrier/one-time-contract.ts` answers `contract_type = 'spot' AND
effective_date = expiration_date AND both non-null`. Two alternatives were
rejected:

- **A naming convention** (`contractName` starting "One-time —"). Breaks the
  moment someone renames the row, which is the one edit most likely to happen to
  a contract with an auto-generated name.
- **Provenance** ("was it created by an import"). Wrong question. A standing
  contract *selected* during an import is equally import-adjacent, and a
  one-day contract typed in by hand is equally one-time. Provenance describes
  where a row came from; the label has to describe what was agreed.

A contract effective for exactly one day **is** an agreement for one trip. That
is true of a hand-typed one too, and labelling it is correct rather than a false
positive. Shown in four places: the contracts grid, the client's contracts tab,
the `ds` mobile-web contracts list, and the contract's own detail header.

**Where a column would become the right answer:** if a later phase needs to
distinguish "spot, one day, created from a document" from "spot, one day, typed
by a human" — for reporting, or to auto-expire imported spot contracts. Nothing
in v1 does.

---

## DEC-13 — `carrier_documents` has RLS enabled and FORCED with ZERO policies

Found by the DEC-8 live-schema diff while checking what Phase 3 writes to.
**Not caused by this phase, not fixed by this phase, and recorded because it is
load-bearing for the outstanding `app_user` cutover.**

```
carrier_documents : rls_enabled = true, rls_forced = true, policies = (none)
clients           : tenant_isolation_policy, bypass_rls_policy
contracts         : tenant_isolation_policy, bypass_rls_policy
document_imports  : tenant_isolation_policy, bypass_rls_policy
document_profiles : tenant_isolation_policy, bypass_rls_policy
```

`pg_policies WHERE tablename = 'carrier_documents'` returns zero rows.

**What this means.** A table with RLS forced and no policies denies everything
to any role that does not bypass RLS. It works today only because the connecting
role `postgres.<project>` has `rolbypassrls = true` (established in DEC-11). The
moment `DATABASE_URL` is flipped to `app_user` — RLS Phase 2, still outstanding —
**every read and write to `carrier_documents` returns zero rows or fails**, on
every surface: driver stop documents, contract documents, client documents, and
the spot-contract attachment Phase 3 adds.

**Scope check, so this is not mistaken for a document-import problem.** It is
not. `carrier_documents` predates this module by many phases and is written by
at least four unrelated routes. Phase 3 is the messenger.

**Why it was not fixed here.** DEC-3: DDL is applied deliberately by a human who
has read the SQL, and DEC-7 removed the hooks that made schema changes a side
effect of editing. Adding policies to a table on the read path of the driver app
is not a change to slip into a phase commit. The SQL a reviewer would want is the
same shape as its siblings — `tenant_isolation_policy` + `bypass_rls_policy` —
but `carrier_documents` has **no `org_id` column** (it is scoped through
`parent_type`/`parent_id`), so the policy is a join rather than a column compare
and genuinely needs designing, not copying.

**Containment in the meantime.** `attachSourceDocument` in `resolution.ts`
catches and logs rather than throwing: under the cutover the spot contract is
still created and still selected, and only the attachment is lost, with a warning
naming the import and contract. That is a deliberate trade, not an oversight —
losing a created contract because its receipt could not be filed would be the
worse failure. It is also not a fix, and this entry exists so it is not mistaken
for one.

**Owner:** the RLS Phase 2 cutover, alongside the GUC pool-leak from DEC-11.

---

## DEC-14 — `facility_external_references.resolved_via` holds a TIER, not a provenance via

The column has a CHECK, confirmed against production 2026-08-06:

```
facility_external_references_resolved_via_check
  CHECK (resolved_via IS NULL OR resolved_via = ANY (ARRAY['T1','T2','T3','T4']))
```

Phase 4's first implementation wrote the stop *provenance* vocabulary
(`EXTERNAL_REF`, `NORMALISED_ADDRESS`, `MANUAL`, `MANUAL_CREATE`) into it. Every
external-reference write would have raised a 23514 in production — which is every
confirmed resolution, which is the entire value of the module.

Two vocabularies, deliberately:

| Where | Vocabulary | Why |
|---|---|---|
| `facility_external_references.resolved_via` | `T1 · T2 · T3 · T4` | constrained by the database; the column's own schema comment already said "T1/T2/T3/T4 of the resolution ladder" |
| `document_imports.resolution_provenance.stops[i].via` | `EXTERNAL_REF · NORMALISED_ADDRESS · MANUAL · MANUAL_CREATE` | jsonb, unconstrained, and it is what the "why" affordance renders from |

`REFERENCE_TIER` in `facility-resolution.ts` maps one to the other at the write.
`MANUAL` maps to `T3` regardless of the tier the stop had been on, because the row
records how the *link* came to exist and a person picking from a list is T3.

**The general lesson, and it is the same one as B1:** this repo's carrier tables
carry CHECK constraints seeded in early migrations that do not track the app's
vocabulary (see `project_carrier_check_constraint_drift`). Read `pg_constraint`
before writing any enum-ish carrier column. A faked database in a unit test is
not evidence about SQL — it accepted the illegal value and the suite stayed green.

---

## DEC-15 — Stop → facility links live in `resolution_provenance.stops`

No new table, no new column. There is no stop row to hold a `facilityId`: stops
become `CarrierStop` records at commit (Phase 8), and until then a stop is an
index into `reviewedExtraction`. The provenance record therefore *is* the link —
`{ facilityId, via, score, matchedText, sourceCode, stopFingerprint, byUserId, at }`
keyed by consignment index, merged in memory and written in the same `updateMany`
as the quick-509 client/contract keys.

An index is not an identity, so each record carries a `stopFingerprint` (the
source code, or the normalised name + address key). On read, a fingerprint
mismatch means stop review reordered or rewrote that position, and the record is
treated as **absent** rather than trusted. Silently trusting the index would
attach one consignee's confirmed facility to another's freight.

Phase 5 must not "fix" this by re-keying on position.

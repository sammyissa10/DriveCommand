# Phase 2 — Upload and intake

**Spec:** `docs/specs/DocumentImport_TechnicalSpec_v1.md` Sections 4, 14, 15
**Audit:** `.planning/document-import/00-AUDIT.md` · **Phase 1:** `01-SUMMARY.md`
**Branch:** `feature/document-import`
**Scope:** intake only. No client resolution, no contract, no template matching,
no stop review, no commit.

---

## The shape of it

One server layer, two surfaces. Everything after "who is asking" is identical
between web and mobile, so the request→response mapping lives in one place
(`handlers.ts`) and both route sets are ten-line adapters over it. There is no
second upload utility and no second create path.

```
  UI            web wizard (/carrier/imports/*)   mobile (owner)/imports/*
                        |                                   |
  TRANSPORT   /api/v1/carrier/document-imports/*   /api/mobile/carrier/owner/…
                  (session cookie)                    (Bearer token)
                        \                             /
  HANDLERS               handlers.ts  — one mapping, no drift
                              |
  ORCHESTRATION          intake.ts    — start / extract / cancel / re-shoot
                          /        \
  PERSISTENCE   persistence.ts      service.ts (Phase 1, extended additively)
                          \        /
  STORAGE          presigned.ts · multipart.ts · validate.ts  (existing, reused)
```

---

## What shipped

### Server

| File | What it does |
|---|---|
| `lib/storage/presigned.ts` | `DocumentCategory` widened with `'imports'` (audit C10). The **only** storage change. |
| `lib/storage/tenant-key.ts` | **NEW** `assertTenantKey` / `isTenantKey` (audit C9). All new code uses it; the 15 inline copies are untouched — repointing them is a separate change. |
| `lib/storage/object-bytes.ts` | **NEW** `getObjectBytes` — reads an uploaded object back for hashing and extraction, capped at 25MB. |
| `lib/document-import/upload.ts` | **NEW** presigned grant for one source file. Reuses `generateUploadUrl` verbatim. |
| `lib/document-import/persistence.ts` | **NEW** the `document_imports` / `document_import_pages` layer Phase 1 deferred. |
| `lib/document-import/intake.ts` | **NEW** start · extract · cancel · re-shoot · summarise · resume/recent lists. |
| `lib/document-import/handlers.ts` | **NEW** transport-neutral `{status, body}` handlers. |
| `lib/document-import/service.ts` | Extended additively — see below. |

**11 route files**, mirrored across the two surfaces:
`POST upload-url` · `GET ?scope=resumable\|recent` · `POST /` (create + dedupe) ·
`GET /[id]` · `DELETE /[id]` (cancel) · `POST /[id]/extract` · `PUT /[id]/pages`
(re-shoot).

### Web UI (light brand tokens)

- `/carrier/trips` — **Import Document** primary button top-right, plus the
  resume banner. Desktop and the `ds` mobile-web view both.
- `/carrier/imports/new` — source selection, staging with **dnd-kit drag reorder**,
  delete, add more, retake a single page, duplicate handling.
- `/carrier/imports/[id]` — progress with page counter and Cancel, failure
  states, per-page re-shoot, summary card placeholder.
- `components/carrier/imports/ResumeImportBanner.tsx` — server component.

### Mobile UI (iOS dark, 44px targets)

- `(owner)/index.tsx` — top-right tinted circle, `FileUp`, "Import Document";
  resume strip below the header.
- `(owner)/imports/new.tsx` — camera / document picker / library / recent,
  staging list with reorder, retake, delete.
- `(owner)/imports/[id].tsx` — progress, `AppState` re-read on foreground,
  failure states, per-page re-shoot, summary card placeholder.
- `lib/document-import.ts` — presigned PUT, identical in shape to `lib/upload.ts`.
- `packages/api-client/src/owner-imports.ts` — `ownerImportsApi`.

---

## The decisions that matter

### Extraction runs on the server and writes as it goes

This is the whole answer to items 5 and 8, and it is one mechanism rather than
three. `extractDocument` gained two additive options:

```ts
onPageSettled?: (outcome: PageOutcome, extraction: PageExtraction | null) => …
shouldContinue?: () => boolean | Promise<boolean>
```

`onPageSettled` writes the `document_import_pages` row for that page **before
the run finishes**. That single write is simultaneously:

- the **progress counter** — the UI reads `pagesDone` from those rows, so it is
  right after a reload and keeps climbing while the tab is backgrounded;
- the **resume point** — a killed lambda or a slept phone leaves behind exactly
  the pages that landed;
- the **cache row** — `cache.ts` reads this table, so re-running sixteen pages
  after re-shooting one bills for one.

Phase 1 left `cache.put()` a deliberate no-op to avoid two writers racing for
this row. **This is the single writer it was waiting for**, and the no-op is now
correct rather than pending.

`shouldContinue` is checked before each page is *sent*. Pages already at the
model finish and are kept — they are billed either way — and the result comes
back `CANCELLED`, which is reported ahead of any failure verdict so a run the
user stopped is never described as a document that could not be read.

A throwing `onPageSettled` is swallowed. Losing a page that was successfully
extracted and paid for, because the progress write failed, would be the worst
trade available.

### Page order has exactly one representation

`source_file_keys` is a `String[]` and its **array order is the page order**.
There is no ordinal column, no second ordering field, and no server-side
reorder endpoint. The staging screen arranges thumbnails, posts the keys in that
order, and that array is what gets stored and what `toPages()` numbers.

This is a direct answer to the phase's stated drift risk ("the reorder UI
existing but the order never reaching the extraction service"). It cannot drift
because there is nothing to keep in sync. Reordering *after* extraction is not
offered at all — it would change stop order underneath an extraction done
against the old order, which is a different document, not a reorder.

### Duplicate handling follows Phase 1's index design

The pre-check matches on `contentHash` alone, which is **stricter** than the
database index (that also keys on document number and date). Deliberate: at
upload time nothing has been extracted, so the number and date are unknown, and
the honest question is "have these exact bytes been here before".

`POST` returns **409** with the existing import, its trip if it has one, and
both actions. "Import as a correction" **soft-deletes** the earlier import and
creates a new one — which is precisely what `document_imports_dedupe_key` being
partial on `deleted_at IS NULL` was built for (01-SUMMARY: *"Partial so a
soft-deleted import never blocks 'import as a correction'"*). The row survives,
so a trip already created from it still points at a real import record.

A concurrent upload of the same bytes loses the race at the **index**, not the
pre-check — `DuplicateImportError` is caught and re-reported as the duplicate it
is. Only the database sees that race.

### DEC-6 — closed, but only after a correction (see DEC-9)

**`rawResponse` persistence.** The import-row half (`raw_extraction`, written by
`finishExtraction`) shipped in the first commit. **The per-page half did not** —
`PageOutcome.rawResponse` was dropped, with a code comment asserting that
"the row has no column for it" as though that were a fact rather than a gap. It
was found by Ayaz against production, not by this phase's own reporting.

Closed by `20260803115314_add_raw_response` (`raw_response TEXT NULL`, applied to
production via Supabase MCP, repo synced and marked applied per DEC-3 rule 4).
`writePageOutcome` now writes it, re-truncated at `RAW_RESPONSE_LIMIT`;
`failure_message` stays human-readable and never carries model output. Full
account in **DEC-9**.

**The ZERO_CONSIGNMENTS wording.** Now chosen by what was actually read:

| Source | Message |
|---|---|
| one photo | "…Take the photo again with the whole page in frame, square on and well lit." |
| several photos | "…Take the photos again…" |
| a PDF | "That PDF was read, but no delivery stops were found in it. Check it is the delivery schedule…" |
| mixed | names both |

Telling a dispatcher to re-shoot a PDF someone emailed them is not an
instruction they can follow. Three tests lock this down, including one asserting
the PDF message contains no mention of a photo.

### CSV: the mapping is guessed, and says so

No saved column mapping can exist in Phase 2 — the document profile is per
client and client resolution is Phase 3. Rather than dead-ending every first CSV
on `NO_MAPPING`, the header suggestion is applied **and declared**: a
`COLUMNS_AUTO_MATCHED` warning rides on the extraction telling the user the
columns were matched automatically and to check them. Spec Section 1.6 forbids
the system guessing *silently*; this does not. If no column maps to a consignee
name, it still fails, with an instruction naming the column to rename.

### Mobile reorder is buttons, not drag — audit D4

`react-native-gesture-handler` is not installed and this phase installs nothing.
Two 44px arrows per row: meets the touch-target rule outright, no gesture
arbitration inside a scroll view, usable in gloves. **Web has real drag** —
dnd-kit is already there and already does this in `StopBuilder`. This is the one
place the built UI differs from the phase prompt's wording, and it is the option
the audit recommended.

### Two top-right actions, one accent

Trips already had "New trip" in the `ds` header's add slot, and the spec puts
Import Document top-right as *the* primary action. `LargeTitleHeader` gained an
additive `trailing` slot and a new `ActionButton` with a `tone`. Import Document
takes the accent tint and the rightmost, thumb-nearest position; New trip sits
beside it in a neutral tint. Section 15's "one accent colour on one primary
action" holds, and nothing was removed.

### No modals

Every warning, failure, and duplicate is an inline strip or card. Nothing
interrupts.

---

## Per-item audit of the Phase 2 prompt

Written against the prompt text item by item, not from memory of the work. This
section replaces the narrative "Not done" list that let DEC-9 through.

**Preamble — "intake only, no client resolution, no stop review, no commit":**
IMPLEMENTED. Nothing writes `client_id`, `contract_id`, `route_template_id`, or
creates a Trip. `Review stops` is disabled on both summary cards.

| # | Item | Verdict |
|---|---|---|
| 1 | Single primary action "Import Document", top-right, tinted circle, no FAB | **PARTIALLY** — see below |
| 2 | Sources: photos / file / recent; multi-image, multi-page PDF, XLSX, CSV | **PARTIALLY** — XLSX not accepted |
| 3 | Staging: thumbnails, drag reorder, delete, add more, retake one page | **PARTIALLY** — mobile reorder is buttons |
| 4 | Upload through existing storage layer, tenant prefixing, **multipart path**, do not reimplement | **PARTIALLY** — multipart not used; mobile PUT logic copied |
| 5 | Progress: page counter, cancellable, backgrounding-resilient, → summary placeholder | IMPLEMENTED |
| 6 | Duplicate detection, both actions | **PARTIALLY** — "open the trip" is web-only |
| 7 | Failure states: per-page re-shoot, clearer-photo, upload retry | IMPLEMENTED |
| 8 | Resume: NEEDS_REVIEW banner on Trips, restores exact state | IMPLEMENTED (limit noted) |

### 1 — PARTIALLY

Tinted circle on the mobile-web `ds` Trips header
(`TripsMobile.tsx`, `ActionButton` accent) and on the native owner home
(`(owner)/index.tsx`, 44px circle, `FileUp`). **Web desktop is a labelled
rectangular `Button`, not a tinted circle** (`carrier/trips/page.tsx`) — the
prompt asked for both "labelled Import Document" and "tinted circle", and on
desktop I resolved that toward the label. Declared here rather than claimed.

Also: the `ds` Trips header now carries **two** controls, not one — New trip
(neutral tint) beside Import Document (accent, rightmost). "One accent colour on
one primary action" holds, but "a single primary action" was interpreted as "one
*primary*", not "one control". Removing New trip would have been a regression.

### 2 — PARTIALLY

- Take photos / Upload file / Choose recent: IMPLEMENTED both surfaces.
- Multi-page PDF: IMPLEMENTED (whole-PDF to the model, audit D5 option A).
- CSV: IMPLEMENTED, with the auto-mapping caveat below.
- **Multi-image capture: PARTIALLY on native.** `launchCameraAsync` returns one
  shot per launch, so a 16-page manifest is 16 taps of "Take photos". The library
  picker is multi-select and web accepts `multiple`. Not a workaround I built —
  a limit of the installed picker.
- **XLSX: NOT DONE.** Rejected with a save-as-CSV message (DEC-4, inherited from
  Phase 1 — no spreadsheet library is installed and this phase installs nothing).
  The prompt lists XLSX in item 2; this is a carried deferral, not a new decision,
  but it is a numbered item that is not met.

### 3 — PARTIALLY

Thumbnails, delete, add more, retake-one-page: IMPLEMENTED both surfaces. Drag
reorder is real on web (dnd-kit). **Mobile is 44px up/down arrows, not drag** —
`react-native-gesture-handler` is not installed and nothing was (audit D4
option A).

### 4 — PARTIALLY

Tenant key prefixing and `generateUploadUrl` are reused verbatim; `'imports'` is
the only storage change. Two gaps:

- **The multipart path is not used.** The prompt names it explicitly. I chose a
  single presigned PUT with a 25MB ceiling because the server reads these files
  back into memory to hash and extract, and reasoned that out in `upload.ts` —
  but it is an instructed element I declined, not one I satisfied.
- **`apps/mobile/lib/document-import.ts` copies the base64 → `Uint8Array` → PUT
  body out of `lib/upload.ts`** rather than reusing it. `uploadPhotoToS3` is
  hardcoded to the incidents endpoint so it could not be called as-is, but the
  right move was to parameterise that function, not to duplicate it. This is
  literally the phase's second stated drift risk — *"watch for a second upload
  utility next to the existing one"* — and the first commit shipped one.

### 6 — PARTIALLY

Detection, the 409, and "import as a correction" work on both surfaces. **"Open
the existing trip" is web-only**: the mobile owner portal has no carrier trip
screen to navigate to, so the mobile duplicate notice says a trip exists and
offers "Open the existing import" instead. A deliberate choice, but it is one of
the two required actions being unavailable on one surface.

### 8 — IMPLEMENTED, with a limit

NEEDS_REVIEW imports raise the banner on both surfaces and resuming restores
status, pages, per-page state and the summary — that is what item 8 asks for.
UPLOADED / EXTRACTING / FAILED imports also appear (deliberately — that is what a
killed run leaves behind), but those can only be read or cancelled, not re-staged:
pages cannot be added, removed or reordered after the row exists.

### Constraints

| Constraint | Verdict |
|---|---|
| Install nothing | IMPLEMENTED — dependency diff empty |
| Existing component library | IMPLEMENTED — shadcn on web, `ds` kit, RN tokens |
| Existing upload code | **PARTIALLY** — see item 4 |
| Existing mobile camera integration | IMPLEMENTED — `expo-image-picker` / `expo-document-picker` as used elsewhere |
| Web light brand tokens | IMPLEMENTED for desktop and the new wizard. The `ds` mobile-web Trips view is dark — that is the repo's existing system for that breakpoint, not a choice made here |
| 44px touch targets on mobile | IMPLEMENTED |
| No modal interruptions for warnings | IMPLEMENTED — every warning, failure and duplicate is an inline strip |

### Process items

| Item | Verdict |
|---|---|
| Three-sentence approach before code | IMPLEMENTED |
| Real `tsc` output, both apps | IMPLEMENTED |
| `02-SUMMARY.md` | IMPLEMENTED, then **corrected** — the first version was a narrative, not an audit |
| DEC-6 (`rawResponse`) | Half-closed on the first pass, **corrected** — see DEC-9 |

---

## Not done, and why

**One schema change, added as a correction.** The first commit claimed *"no
migration was written and no DDL was applied, per DEC-3"* and presented that as
compliance. It was true and it was covering a gap: `raw_response` on
`document_import_pages` was needed and was not there. See **DEC-9**. "No DDL was
needed" is a claim about the schema and requires the same evidence as "this DDL
was applied"; only the second was ever checked.

**No multipart upload.** `initiateMultipartUpload` exists and is the right tool
above 5MB, but an import source file is a phone photo, a scanned PDF, or a CSV,
and the server reads it back into memory to hash and extract. The 25MB ceiling
is the real constraint, and it is refused up front with a reason rather than
accepted and dropped later. Documented in `upload.ts`.

**No server-side reorder.** Built, then removed before commit — nothing called
it. See the note in `intake.ts`.

**"Choose recent" lists recent imports, not a file library.** There is no
document library to browse; recent *imports* is the useful thing and doubles as
a second route into resume.

**`.xlsx` still rejected** (DEC-4, unchanged). The upload endpoint gives it the
save-as-CSV message rather than a MIME error, so the rejection now happens
before the upload rather than after.

**Confidence calibration still unverified** (Phase 1's open item, audit Risk #5).
Phase 2 does not depend on it; Phase 3/4 will.

---

## Verification

### TypeScript — real output

```
$ cd apps/web && npx tsc --noEmit
EXIT CODE: 0

$ cd apps/mobile && npx tsc --noEmit
EXIT CODE: 0
```

Both silent. Note `packages/api-client` must be built (`npx tsc` in that
package) before the mobile typecheck sees new exports — the package `main` is
`./dist/index.js` and `dist` is gitignored, the same trap 01-SUMMARY flagged for
`packages/validation`.

### Tests

```
$ cd apps/web && npx vitest run src/lib/document-import src/lib/storage/__tests__/tenant-key.test.ts
 ✓ hashing.test.ts      (21)
 ✓ lifecycle.test.ts    (29)
 ✓ merge.test.ts        (20)
 ✓ spreadsheet.test.ts  (17)
 ✓ extractor.test.ts    (26)
 ✓ service.test.ts      (22)   ← +7: progress hooks, cancellation, DEC-6 wording
 ✓ upload.test.ts        (6)   ← new
 ✓ tenant-key.test.ts    (9)   ← new
 Test Files  8 passed (8)
      Tests  150 passed (150)
```

**Full web suite, measured against the Phase 1 baseline rather than assumed:**

| | Files failed | Tests failed | Tests passed | Total |
|---|---|---|---|---|
| Phase 1 close | 14 | 61 | 782 | 901 |
| Phase 2 | 14 | **61** | 830 | 949 |

The failing set is **byte-identical** to Phase 1's — all 14 pre-existing, none in
document-import, none touching anything this phase changed:

```
workflows-complete-step · workflows-dispatch-enforcement · workflows-fail-inspection
workflows-fire-event · workflows-instance · workflows-trigger-router
driver-pay/settlements-paid · notifications/dispatcher
workflows/playbook · workflows/stepTemplate
auth/require-auth · auth/require-role · auth/validate-mobile-token
validation/schemas
```

Total rose by 48: 26 from `extractor.test.ts` (commit `1b027ef3`, landed after
the Phase 1 snapshot) and 22 added here.

### Dependencies

```
$ git diff --stat package.json apps/*/package.json packages/*/package.json package-lock.json
(empty)
```

Nothing installed.

### Live-schema diff (DEC-8 standing rule)

**This check as first run was insufficient, and it is worth saying how.** It
asked "does every column this code writes to exist?" — and everything the code
wrote to did exist, because the code had been written to fit the schema rather
than the schema to fit the requirement. It could not have caught `raw_response`:
a column that nothing writes to is invisible to a query driven by what the code
writes. The DEC-8 rule says to diff the live schema **against the spec**, and
what was actually run was a diff against the implementation. See DEC-9.

Below is the original check, still valid as far as it goes, plus `raw_response`:

| Check | Result |
|---|---|
| `document_imports` — all 33 columns persistence.ts touches | present |
| `document_import_pages` — all 15 columns | present |
| `document_import_pages.raw_response TEXT NULL` | present (DEC-9; **absent on the first pass**) |
| `_prisma_migrations` row for `20260803115314_add_raw_response` | present, `applied_steps_count = 0` — marked, not executed |
| `document_import_pages_import_page_key` UNIQUE `(import_id, page_number)` | present — the upsert depends on it |
| `document_imports_dedupe_key` UNIQUE partial `WHERE deleted_at IS NULL` | present, COALESCE sentinels match `hashing.ts` |
| `document_imports_status_check` admits all 8 lifecycle values | yes |
| RLS + FORCE RLS on both tables | yes |
| `tenant_isolation_policy` + `bypass_rls_policy` on both | yes |
| `app_user` grants | SELECT, INSERT, UPDATE, DELETE on both |

No omissions of the DEC-1/DEC-2/DEC-8 kind, because nothing was added.

### Phase 2 verify table

| # | Check | Status |
|---|---|---|
| 1 | 4 photos out of order, reorder, extract | **Code path verified, not run.** Order → `source_file_keys` array → `toPages()` page numbers, one representation end to end; `service.test.ts` "respects the user-chosen page order" covers the pipeline half. Needs a device run. |
| 2 | Same manifest as PDF, then sheet | PDF → vision path; `.csv` → `parseSpreadsheet`, branch selected in `runExtraction` by `classify()`. Needs a real-file run. |
| 3 | Upload same file twice | Blocked with 409; both actions wired on both surfaces. Needs a run. |
| 4 | Background mid-extraction | Server-side by construction; `AppState` re-read on mobile, poll on web, `runExtraction` idempotent and resumes from cached pages. Needs a device run. |
| 5 | Close mid-review, reopen Trips | Resume banner on both surfaces; `/carrier/imports/[id]` is a real URL. Needs a run. |
| 6 | Deps + tsc | ✅ **Both apps exit 0. Dependency diff empty.** |

**Checks 1–5 are wired but not executed.** There is no test manifest in the
repo, no S3 credentials in this environment, and no emulator attached to this
session, so claiming them green would be a guess. Check 6 was run and is real.

---

## What Phase 3 needs from here

- `summariseImport()` returns the summary-card DTO; the Client / Contract /
  Template rows are deliberately **absent** rather than faked — a row that looks
  resolved but is not would be worse than no row.
- `document_imports.client_id`, `contract_id`, `route_template_id`,
  `document_profile_id` are all written by nothing yet and are Phase 3's.
- The CSV `COLUMNS_AUTO_MATCHED` warning is the hook for saving a confirmed
  mapping onto the client's `DocumentProfile`.
- `Review stops` on both summary cards is disabled and says why.

---
---

# Phase 2 cleanup (follow-up commit)

Four items from the corrected self-audit, resolved. No schema changes.

## 1 — Single upload path

**Before:** six presigned-PUT bodies in `apps/mobile`. Three used base64 →
`atob` → `Uint8Array` (`lib/upload.ts`, `lib/document-import.ts`,
`components/driver/DocumentUploadSheet.tsx`); three used `fetch(uri).blob()`
(`DocumentUploadScreen`, `InspectionModeScreen`, `SignatureScreen` ×2). Phase 2
added one of them.

**After:** `apps/mobile/lib/upload.ts` owns the only one.

| Export | Role |
|---|---|
| `putToPresignedUrl(url, body, contentType)` | **THE** PUT. Accepts `Uint8Array \| Blob`, so both prior techniques converge on it. |
| `readFileAsBytes(uri)` | base64 → bytes, Hermes-safe. One copy. |
| `uploadFileToPresignedUrl(uri, url, contentType)` | read + put |
| `requestPresignedUpload(endpoint, token, body)` | grant request — **the endpoint is now an argument**. Hardcoding it to the incidents route is precisely why the import path could not reuse this file and copied it instead. |
| `fileSizeBytes(uri)` | shared `getInfoAsync` wrapper |
| `uploadPhotoToS3(uri, token, onProgress?)` | unchanged public API, now built on the above |

All six call sites rewritten. `lib/document-import.ts` keeps only staging
concerns and delegates the transfer.

**Proof — every PUT and every base64 conversion in `apps/mobile`:**

```
$ grep -rn "method: 'PUT'" apps/mobile --include=*.ts --include=*.tsx
apps/mobile/lib/upload.ts:9:   * own `fetch(uploadUrl, { method: 'PUT' })`. Six copies ...   <- comment
apps/mobile/lib/upload.ts:46:    method: 'PUT',                                              <- the one

$ grep -rn "atob(" apps/mobile --include=*.ts --include=*.tsx
apps/mobile/lib/upload.ts:67:  const binary = atob(base64)
```

**One thing deliberately not folded in:** `lib/driver-pay/uploadReceipt.ts` uses
`FileSystem.uploadAsync` (`httpMethod: 'PUT'`) — a native upload that never goes
through `fetch`. Different mechanism, not a duplicate. Named in the header of
`upload.ts` so nobody has to rediscover why it is exempt.

**Found, not fixed:** the `SignatureScreen` JSON fallback has always ignored its
PUT result and set `s3Key` regardless, so a failed upload completes the step with
a key whose object was never written. Behaviour preserved exactly (the throw is
swallowed, with a comment saying why) — fixing it changes driver signature
submission, which is Phase 9's flow, not this cleanup's. Raised rather than
silently corrected or silently kept.

## 2 — Multipart: decided, recorded as DEC-10

Not wired, and the reason is concrete rather than stylistic. The first pass
declined it with a plausible paragraph and never checked whether the existing
path *could* carry an import. It cannot:

- **`api/documents/multipart/initiate/route.ts` rejects `entityType !== 'driver'`
  outright**, and gates content type on PDF/JPEG/PNG — it would refuse
  `image/webp` and `text/csv`, both of which intake accepts. Using "the existing
  multipart path" would mean widening a driver-document endpoint or writing six
  parallel routes.
- **The repo's own threshold is 5MB** (`driver-document-upload.tsx`), which is
  S3's minimum part size; below it multipart is one part wrapped in three extra
  round trips. Import sources are ~1–3MB photos, scanned manifests, and CSVs.
- **The 25MB ceiling comes from extraction, not upload** — the server reads every
  file back into memory to hash it. An import can never reach a size where
  multipart pays.
- React Native has no `Blob.slice` over a file URI and no proven ETag header
  read, so the mobile half would be new unproven code serving a size that cannot
  occur.

DEC-10 records this, names the condition under which it should be revisited
(raising the cap by streaming the hash), and says what the honest first step
would then be.

## 3 — Web Import Document is a tinted circle

`components/carrier/imports/ImportDocumentAction.tsx` — 40px
`rounded-full bg-primary/10 text-primary`, top-right on `/carrier/trips`
desktop, `aria-label` plus a tooltip because a circle carries no visible label.
The labelled `Button` is gone.

**Stated plainly, because the instruction said "matching the add-action pattern
used elsewhere in the portal":** there is no pre-existing *desktop* tinted-circle
add action to match. Carrier list pages have no top-right primary action at all —
creation runs through the global `QuickActionsMenu`, a labelled pill in the top
bar. The tinted circle lives in the `ds` mobile-web kit (`AddButton`, dark
tokens), and `rounded-full bg-primary/10` is the portal's tinted-circle idiom in
about ten places. This component is the `ds` geometry expressed in the light
brand tokens desktop actually uses — not an invented style, and not `ds.*` dark
tokens leaking onto a light surface.

## 4 — "Open the existing trip" on mobile

Mobile could not offer it because the owner portal had **no carrier trip surface
at all** — its `loads` and `routes` screens belong to the legacy universe, not to
`dispatches`. Three additions:

- `api/mobile/carrier/owner/dispatches/[id]/route.ts` — read-only trip detail,
  Bearer + OWNER, `getTenantPrismaForOrg` with `orgId` in the where clause.
- `packages/api-client/src/owner-trips.ts` — `ownerTripsApi.get`.
- `apps/mobile/app/(owner)/trips/[id].tsx` + `_layout.tsx`, hidden tab — trip
  number, status, driver, truck, times, stop list. Read-only.

The duplicate notice in `(owner)/imports/new.tsx` now routes to the trip when
`createdTripId` is set and to the import otherwise, matching web.

**Honest scope note:** `createdTripId` is only ever written by Phase 8's commit,
so this action cannot fire yet. It was built because "both platforms offer both
actions" is not satisfiable without a destination, and Phase 8 and Phase 11 both
need one. It is a minimum viable trip screen, not the owner board.

## Per-item audit of the cleanup prompt

| # | Item | Verdict |
|---|---|---|
| 1 | Eliminate the duplicated upload utility; grep proves one implementation | **IMPLEMENTED** — `apps/mobile/lib/upload.ts:46` is the only `fetch` PUT, `:67` the only `atob`. Six call sites converged. `uploadReceipt.ts` (`FileSystem.uploadAsync`) exempt and declared. |
| 2 | Multipart: wire it, or record a concrete reason as DEC-10 | **IMPLEMENTED** — DEC-10 in `DECISIONS.md`, grounded in the `entityType !== 'driver'` gate, the 5MB threshold, and the extraction-imposed 25MB cap. Simple path retained. |
| 3 | Web action → top-right tinted circle | **IMPLEMENTED** — `components/carrier/imports/ImportDocumentAction.tsx`, used in `app/(owner)/carrier/trips/page.tsx`. Absence of a desktop precedent stated rather than glossed. |
| 4 | Mobile duplicate: add "open the existing trip" | **IMPLEMENTED** — `app/(owner)/trips/[id].tsx`, `api/mobile/carrier/owner/dispatches/[id]/route.ts`, `packages/api-client/src/owner-trips.ts`, wired in `app/(owner)/imports/new.tsx`. Not exercisable until Phase 8 sets `createdTripId`. |

### Constraints

| Constraint | Verdict |
|---|---|
| Install nothing | IMPLEMENTED — dependency diff empty |
| No worktrees / junctions / symlinks / recursive deletes | IMPLEMENTED — none used |
| No `vercel` commands | IMPLEMENTED — none run |
| Tenant isolation unchanged | IMPLEMENTED — the new route uses `getTenantPrismaForOrg(auth.tenantId, …)` with `orgId` in the where clause, as its carrier siblings do; no storage-key or RLS behaviour touched |
| No schema changes | IMPLEMENTED — none made, none needed; the DEC-3 stop condition was not reached |

### Verification

```
$ cd packages/api-client && npx tsc
api-client build EXIT: 0

$ cd apps/web && npx tsc --noEmit
WEB EXIT: 0

$ cd apps/mobile && npx tsc --noEmit
MOBILE EXIT: 0

$ cd apps/web && npx vitest run src/lib/document-import src/lib/storage/__tests__/tenant-key.test.ts
 Test Files  8 passed (8)
      Tests  150 passed (150)
```

The four mobile screens touched by item 1 have no unit tests in this repo —
`apps/mobile` uses jest-expo and none of these files are covered — so the
refactor is verified by `tsc` and by the greps above, not by tests. Behaviour
preservation in `SignatureScreen` and `DocumentUploadSheet` was reasoned through
call site by call site and is documented inline; it has not been exercised on a
device in this session.

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

### DEC-6 closed — both items

**`rawResponse` persistence.** The raw model output is stored on the import row
(`raw_extraction`) by `finishExtraction`. The per-page unparseable-reply blob is
*logged*, not persisted — `document_import_pages` has no column for it and
`failure_message` is user-facing, which is what Phase 1's own doc comment said.

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

## Not done, and why

**No schema change.** Phase 2 needed none — verified against the live database,
not assumed (see below). No migration was written and no DDL was applied, per
DEC-3.

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

Phase 2 writes no DDL, so the check is that everything it *writes to* already
exists in production. Queried against `oqdhberkghtnszrkdvfm` via Supabase MCP:

| Check | Result |
|---|---|
| `document_imports` — all 33 columns persistence.ts touches | present |
| `document_import_pages` — all 15 columns | present |
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

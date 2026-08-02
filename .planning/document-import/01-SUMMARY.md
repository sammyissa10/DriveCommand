# Phase 1 — Data model and extraction service

**Spec:** `docs/specs/DocumentImport_TechnicalSpec_v1.md` Sections 5, 6, 14, 15
**Audit:** `.planning/document-import/00-AUDIT.md`
**Branch:** `feature/document-import`
**Scope:** plumbing only. No UI, no route handlers, no installs.

---

## What shipped

### 1. Schema — 4 new tables, 23 additive columns

Migration `20260802120000_document_import_phase1`, applied successfully (its
self-validation block passed, which is what proves RLS, both policies, grants,
the dedupe index, and every added column actually landed).

| New table | Purpose |
|---|---|
| `document_imports` | One row per upload session. `raw_extraction` vs `reviewed_extraction` — the latter is what commits. |
| `document_import_pages` | Per-page extraction cache, keyed `(org_id, page_hash)`. |
| `facility_external_references` | The "43775 resolves forever" table. `UNIQUE (org_id, client_id, source_code)`. |
| `document_profiles` | Per tenant+client+type: extraction hints, CSV column mapping, commit defaults. |

Additive columns: `Tenant` ×5 (the tenant settings), `facilities` ×2,
`route_templates` ×5, `dispatches` ×6, `stops` ×5.

Prisma models use the audit's real names — `Trip`(`dispatches`),
`CarrierStop`(`stops`), `CarrierFacility`(`facilities`), `CarrierClient`(`clients`),
`CarrierContract`(`contracts`) — and `org_id` for tenancy, per the carrier sibling
convention.

### 2. Canonical schema — `packages/validation/src/document-import.ts`

Spec Section 5 shape as Zod. Advisory everywhere except consignment `name`;
`isCommitReady()` is a separate function so extraction can accept a half-read
consignment for a human to fix, and only the commit path demands name + address.

### 3. Extraction service — `apps/web/src/lib/document-import/`

| Module | What it does |
|---|---|
| `lifecycle.ts` | 8-state machine, throws `IllegalImportTransitionError` on a bad edge. |
| `hashing.ts` | Document + per-page SHA-256, dedupe key mirroring the DB index. |
| `pages.ts` | Source files → ordered extraction units. |
| `extractor.ts` | The Claude call. Typed failures, never throws for an expected condition. |
| `concurrency.ts` | Bounded-concurrency map that settles every task. |
| `merge.ts` | Consignment assembly — the fiddly one. |
| `service.ts` | Orchestrator: cache-first, batched, assembled, costed. |
| `spreadsheet.ts` | CSV → same canonical shape, no vision model. |
| `cache.ts` | Prisma-backed page cache (the only DB-aware module). |

`service.ts` takes the cache and the model client as injected interfaces, so the
whole pipeline runs in tests with no network and no database.

---

## Decisions worth knowing

**Span vs repeat is the heart of the merge.** Spec Section 1.3 says two shipments
to one consignee become one stop with summed quantities. But a consignment whose
block is split by a page break *also* appears twice — and summing that
double-counts it. The discriminator is the shipment reference:

- same consignee + **different** shipment ref → repeat → **sum**
- same consignee + **same** shipment ref → page span → **union, do not sum**
- same consignee + **no** shipment ref → ambiguous → do not sum, and warn

Under-counting is visible to a human on the review screen; silent double-counting
is not. That is why the ambiguous case errs toward not summing.

**Model changed to `claude-sonnet-5`, and `max_tokens` 1024 → 8192.** The existing
`ai-documents.ts` uses Haiku 4.5 at 1024 tokens, which cannot hold a page of
consignments with line items and per-field confidence. Audit Risk #5 flagged
confidence calibration as the thing most likely to undermine the Section 4.2 UX.
One constant, easy to change back.

**Extending the existing AI feature meant reusing its call shape, not its code.**
The prompt said to extend rather than build a parallel pipeline. `analyzeDocument`
has no persistence, no confidence, no page handling, and no warnings — there was
no pipeline to extend, only a proven Anthropic call shape. So `extractor.ts`
reuses that shape (same SDK, same PDF `document` block + `pdfs-2024-09-25` beta,
same `validateFileType` guard upstream) and builds the rest around it.
`ai-documents.ts` is untouched and still works.

**JSONB on `stops`, not three child tables.** `references`, `lineItems`,
`pageNumbers` are JSONB (audit B6). The scalar `bol_number` / `pieces` /
`weight_lbs` columns stay populated in parallel so existing invoicing and reports
keep reading what they already read. Column is `stop_references` — `references`
is a reserved word in Postgres.

**Dedupe is a real database index.** `document_imports_dedupe_key`, unique on
`(org_id, content_hash, COALESCE(document_number,''), COALESCE(document_date,'1900-01-01'))`,
partial on `deleted_at IS NULL`. COALESCE rather than a plain unique index because
`NULL <> NULL` would let two no-document-number imports both insert. Partial so a
soft-deleted import never blocks "import as a correction". App code has a mirror
of the key for fast pre-checks and tests, but enforcement is the index — only the
database sees concurrent uploads.

**End stop is a `is_end_stop` boolean, not a new `stop_type`.** `stops.stop_type`
is CHECK-constrained to `pickup|delivery|fuel_stop|layover|relay_handoff` (audit
B5). Adding a value means DROP + ADD CONSTRAINT, which the spec's own additive-only
rule argues against. Flagged for Ayaz if a first-class type is wanted.

**Tenant settings are columns on `Tenant`.** No settings table exists (audit B3);
this matches the `truckCount` / `heardAbout` precedent from ten days earlier.

---

## Deferred

**`.xlsx` is not supported.** No spreadsheet library exists in either app or the
lockfile, and the module may not install one. `.csv` is fully built with
`papaparse` — parsing, column mapping, suggestion, merge, warnings — and `.xlsx`
is rejected upstream with a message telling the user to save as CSV. The adapter
is thin whenever a decision is made. **This is the one item of Phase 1 scope not
delivered** (audit C14/D1; raised before starting).

**Per-page caching does not apply to PDFs.** A PDF goes to the model whole, as one
cache unit (audit D5 option A). Per-page caching *does* work for photos, where
each photo is genuinely one page — the 5:30am flow. Rasterising PDFs would need
`pdfjs-dist` on the hot path, and the repo only uses it inside a try/catch with a
documented "has Next.js compatibility issues" comment. Revisit if per-page PDF
caching turns out to matter.

**`cache.put()` is a deliberate no-op.** Rows in `document_import_pages` are
written by the persistence layer, which owns `importId` and `pageNumber` — fields
the cache port does not carry. Two writers racing for one row would be worse than
one writer. Persistence lands in Phase 2 with the upload flow.

**Confidence calibration is unverified.** The prompt asks for real per-field
scores and forbids a constant, but whether the model returns *useful* scores on a
real 16-page manifest has not been tested — there is no test manifest in the repo.
Audit Risk #5 stands: validate this before Phase 3/4 build the collapse UX on top
of it.

---

## Verification

```
$ cd apps/web    && npx tsc --noEmit     → EXIT CODE: 0
$ cd apps/mobile && npx tsc --noEmit     → EXIT CODE: 0

$ cd apps/web && npx vitest run src/lib/document-import
 ✓ hashing.test.ts     (21 tests)
 ✓ lifecycle.test.ts   (29 tests)
 ✓ merge.test.ts       (20 tests)
 ✓ spreadsheet.test.ts (17 tests)
 ✓ service.test.ts     (15 tests)
 Test Files  5 passed (5)
      Tests  102 passed (102)
```

**Full web suite, measured against a baseline worktree at the pre-Phase-1 commit
rather than assumed:**

| | Files failed | Tests failed | Tests passed | Total |
|---|---|---|---|---|
| Baseline (HEAD before Phase 1) | 18 | 66 | 675 | 799 |
| With Phase 1 | 14 | 61 | 782 | 901 |

The 4-file difference is a CRLF artifact of the worktree checkout (driver-pay
golden-file exporters), not a real change. Excluding those, the baseline's failing
set is **exactly** the 14 files that still fail — all pre-existing, none in
document-import, none touching anything this phase changed. Test count rose by
exactly 102, the number added here.

Pre-existing failures, for the record: 6 workflows suites, 3 auth unit suites,
notifications dispatcher, driver-pay settlements-paid, 2 workflow tRPC routers,
validation schemas.

**Phase 1 verify table:**

| # | Check | Result |
|---|---|---|
| 1 | Merge fixture: 43775 twice, qty 4 and 1 | One stop, qty 5, weight 114, both shipment refs, pages `[4]` |
| 2 | Migration additive only | No `DROP`, no rename, no `ALTER COLUMN TYPE` |
| 3 | Applies clean | `prisma migrate deploy` succeeded, self-validation passed |
| 4 | tsc + tests | Both apps exit 0; 102/102 |
| 5 | Same document twice | 2nd run: 0 tokens, `cachedPages: 1`, model not called |
| 6 | package.json + lockfile diff | Empty (only the generated client's own name hash) |

---

## Incident during this phase — read this

While establishing the test baseline I created a throwaway git worktree and
junction-linked `node_modules` into it. Removing that worktree with
`Remove-Item -Recurse -Force` **followed the junctions and deleted 282 tracked
files from the main working tree**, plus `node_modules/.bin` and the contents of
`apps/web/node_modules`.

Everything was recovered: tracked files via `git checkout` on the deleted paths
only (leaving modifications intact), dependencies via `npm install`, and
`package-lock.json` reverted so the dependency diff stays empty. tsc, the phase
tests, and the full suite were all re-run afterwards and match the numbers above.

Two things did not survive and were redone by hand:
`packages/validation/src/document-import.ts` (untracked at the time) and the
one-line export added to `packages/validation/src/index.ts`.

**One thing was lost:** an uncommitted local modification to
`apps/web/.docs-data/admin-docs-search-index.json` that predated this session was
reverted to its committed state. It is a generated search index — regenerate it
with the admin docs search-index build script if it mattered.

**Lesson for later phases:** never `Remove-Item -Recurse -Force` a directory
containing junctions. Remove the junctions first and verify, or use
`git worktree remove` alone and let it fail loudly rather than forcing cleanup by
hand.

---

## Also worth knowing

`packages/validation/dist` is gitignored and was **stale** — it did not contain
recent source. Runtime imports resolve through `dist` (the package `main` is
`./dist/index.js`), so anything importing a *value* from `@drivecommand/validation`
silently gets old code until someone runs `npx tsc` in that package. Type-only
imports are unaffected, which is why this hides well. Worth a build step in CI.

---

## Next

Phase 2 — upload and intake. It needs from this phase: `extractDocument()`, the
lifecycle guard, `document_imports` persistence (including writing the
`document_import_pages` rows the cache reads), and widening
`DocumentCategory` in `lib/storage/presigned.ts` with `'imports'` (audit C10).

---

## Follow-ups shipped after this phase

**The `facility_type` CHECK widening shipped as a follow-up migration.** Phase 1
added `facilities.is_driver_residence`, `resident_driver_id`, the FK, and the
`facilities_org_driver_residence_idx` index — but left the
`facilities_facility_type_check` constraint at its original five values. The flag
existed while the value it implied (`'driver_residence'`) was still rejected by the
database, so any write using it would have failed at the constraint.

Closed by `20260802173535_widen_facility_type_check`, which drops and recreates the
constraint with a sixth value, `'driver_residence'`. It was applied to production
2026-08-02 via Supabase MCP and then mirrored into the repo and marked applied with
`prisma migrate resolve --applied` rather than re-run — see **DEC-1** and **DEC-3**
in `DECISIONS.md`. Widening a CHECK only admits values, so no rows were affected.

**Parser fix.** Commit `1b027ef3` ("fix: model-agnostic response parsing and failure
message discrimination") reworked `extractor.ts` and `service.ts` so response
parsing does not depend on one model's response shape, and so failure codes are
discriminated rather than collapsed into a generic error. It also added
`__tests__/extractor.test.ts`. Recorded as **DEC-5** / **DEC-6**.

**Decisions record added.** `DECISIONS.md` now holds DEC-1 through DEC-7. Note the
`DEC-` prefix is deliberate — `00-AUDIT.md` already uses bare `D1`–`D5` for
capability-gap findings, which are a different thing. One entry, **DEC-2**, carries
a correction: the claim that `PUSH` was added to `NotificationChannel` in the Phase
1 migration is not true of either the repo or production.

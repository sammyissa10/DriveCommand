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

## DEC-2 — Push notifications for dispatcher wiring ⚠️ PREMISE UNVERIFIED

**Decision:** dispatcher push wiring is deferred to Phase 10, and when built it
reuses the existing `transitionTripStatus` push mechanism rather than growing a
second delivery path.

**Correction, recorded 2026-08-02.** This entry was originally to be written as
"PUSH added to NotificationChannel enum in Phase 1 migration." That is **not true
of the current repo or of production**, verified three ways:

- `enum NotificationChannel` in `schema.prisma` contains exactly `EMAIL, IN_APP`.
- The production enum contains exactly `EMAIL, IN_APP` (queried live via `pg_enum`).
- The Phase 1 migration `20260802120000_document_import_phase1` does not mention
  `NotificationChannel` at all. The only migration that does is the original
  `20260514200001_add_notification_system`.

So `PUSH` does **not** exist as a `NotificationChannel` value. Phase 10 must add it
in its own migration before it can wire dispatcher notifications through that enum.
Treat this as an open prerequisite, not as done work.

The `transitionTripStatus` half of the decision is real —
it exists in `apps/web/src/lib/carrier/trips.ts` and is called from the dispatch
start/status routes.

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

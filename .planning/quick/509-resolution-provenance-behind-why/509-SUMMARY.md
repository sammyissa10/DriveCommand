# Quick 509 — Summary

**Date:** 2026-08-06
**Commit:** `9fc739b8`

## Files changed

| File | Why |
|---|---|
| `apps/web/prisma/schema.prisma` | `resolutionProvenance Json?` on `DocumentImport` |
| `apps/web/prisma/migrations/20260806040500_add_resolution_provenance/migration.sql` | Repo mirror, marked applied — **no DDL run** |
| `apps/web/src/generated/prisma/*` | `prisma generate` output (tracked, same file set as the `add_raw_response` precedent commit) |
| `apps/web/src/lib/document-import/resolution.ts` | Provenance types, writers, `why` renderers |
| `apps/web/src/lib/document-import/persistence.ts` | `ImportRecord` + `IMPORT_SELECT` — the read path must see the column |
| `apps/web/src/lib/document-import/handlers.ts` | Two internal call sites pass `{ via: 'MANUAL' }`. **Request parsing untouched** — no new body fields |
| `apps/web/src/lib/document-import/__tests__/rate-con-party.test.ts` | One `assignClient` call updated to the required-argument signature |

Not touched: `ContractDecision.tsx`, `ClientDecision.tsx`, `ImportSummaryCard.tsx`,
`CreateContractInput`, `packages/api-client` (no view type changed).

## Migration — DEC-3 pattern

The column was applied to production via Supabase MCP before this task. Confirmed present as
`jsonb`, nullable, before writing anything. `prisma migrate resolve --applied` then registered it:

```
migration_name                            applied_steps_count  finished_at                   rolled_back_at
20260806040500_add_resolution_provenance  0                    2026-08-06 04:31:28.872896+00 null
20260803115314_add_raw_response           0                    2026-08-03 16:54:15.171791+00 null
20260802230853_add_appointment_is_firm    0                    2026-08-03 04:09:28.247051+00 null
```

`applied_steps_count = 0` is what `resolve --applied` always produces — it records the migration
as applied without executing steps — and matches both DEC-3 predecessors exactly.

## Verification

```
apps/web    npx tsc --noEmit  →  exit 0, 0 errors
apps/mobile npx tsc --noEmit  →  exit 0, 0 errors
apps/web    npx vitest run src/lib/document-import
              Test Files  16 passed (16)
                   Tests  222 passed (222)
```

One real signature break was caught by tsc (`rate-con-party.test.ts:169`) and fixed rather than
suppressed — that is the required argument doing its job.

**Not browser-verified.** Not deployed, not pushed.

## Carried forward — the same latent defect, on contracts

`assignContract` has exactly two callers: `MANUAL` (picker) and `CREATED_THIS_IMPORT`
(create-and-use). **Nothing writes `SINGLE_ACTIVE` or `PROFILE_PIN`**, because
`buildContractSlot`'s PROFILE_PIN and ONLY_ACTIVE_CONTRACT branches are view-only — they render a
collapsed contract without persisting `contractId`. That is precisely the defect quick-508 fixed
for clients.

It is not user-visible yet only because nothing consumes `record.contractId` outside the view
(there is no commit path in the codebase; that is a later phase). It becomes a live bug the moment
one lands. The vias and their rendering are already in place, so the fix is one function —
`ensureContractCommitted`, mirroring `ensureClientCommitted`. Deliberately **not** written here:
it changes behaviour beyond this task's scope. Recommended as the next quick task.

## Related

`.planning/debug/doc-import-contract-client-guard.md` — follow-up note appended.

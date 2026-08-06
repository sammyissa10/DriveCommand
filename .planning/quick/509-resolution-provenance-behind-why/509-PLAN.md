# Quick 509 — Resolution provenance behind the "why" affordance

**Date:** 2026-08-06
**Depends on:** quick-508 (`2576de75`), `.planning/debug/doc-import-contract-client-guard.md`

## Problem

quick-508 made the system commit an auto-resolved client. The read path cannot tell that
commit apart from a human's — both are just a set `clientId` — so the already-chosen branch
assumed a person and rendered "You picked this client" for a client nobody picked. Same on the
contract side: `isOneTime` was read off the contract row, so a pre-existing one-time contract a
human selected claimed to have been "created from this document".

Provenance is not recoverable at read time. It has to be recorded at write time.

## Approach

`document_imports.resolution_provenance jsonb NULL` already exists on production (applied via
Supabase MCP, outside this task). Mirror it only — no DDL. Store one record per slot, stamped by
whichever writer committed the value, and render the `why` from it.

## Tasks

1. **Schema + migration.** `resolutionProvenance Json? @map("resolution_provenance")` on
   `DocumentImport`; migration file written and marked applied via
   `prisma migrate resolve --applied` per DEC-3 rules 1 and 4; verify in `_prisma_migrations`.
   Add the field to `ImportRecord` / `IMPORT_SELECT` so the read path can see it.
2. **`assignClient` takes a required provenance argument** and merges `{ client: ... }` into the
   existing `resolution_provenance` within its existing `updateMany`, preserving the contract key.
3. **Truthful callers:** picker → `MANUAL`; `createAndAssignClient` → `MANUAL_CREATE`;
   `ensureClientCommitted` → the via/score/matchedText from `resolveClientDeterministic`.
4. **Same for contract writers:** `assignContract` manual → `MANUAL`; auto paths →
   `SINGLE_ACTIVE` / `PROFILE_PIN` as applicable; `createAndAssignContract` →
   `CREATED_THIS_IMPORT`; merging `{ contract: ... }`.
5. **Rework the already-chosen `why` branches** (client and contract) to render from stored
   provenance, with null falling back to the current copy unchanged.
6. Money stays Decimal. Install nothing.

## Design notes

- **Two vocabularies, kept apart.** The stored `via` (MANUAL / MANUAL_CREATE / PROFILE_ALIAS /
  EXACT_MATCH; MANUAL / SINGLE_ACTIVE / PROFILE_PIN / CREATED_THIS_IMPORT) is not the view's
  `ResolvedVia`. One records what happened, the other selects what to render. Conflating them is
  what produced the bug. No view type changes → no `packages/api-client` mirror change.
- **Merge without a round trip.** Prisma has no jsonb `||`. Both writers already hold the record
  from `requireRecord`, so they merge in memory and write the merged object in the same
  `updateMany`. No second statement, no extra read.
- **`byUserId` / `at` are stamped inside the writers**, not passed by callers, so they cannot be
  forged or forgotten at a call site.

## Verification

`tsc --noEmit` in both apps; `vitest run src/lib/document-import`; `_prisma_migrations` row check.

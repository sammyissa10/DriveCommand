# Quick 510 — Commit auto-resolved contracts at the mutation boundary

**Date:** 2026-08-06
**Mirrors:** quick-508 (`2576de75`), using quick-509's provenance vocabulary (`9fc739b8`)

## Problem

`buildContractSlot`'s PROFILE_PIN and ONLY_ACTIVE_CONTRACT branches render a RESOLVED contract
but never persist `DocumentImport.contractId` — the identical defect quick-508 fixed on the client
side. Latent today because nothing outside the view reads `contractId`; Phase 8's atomic commit
will.

Second, the card footer asserts "The client and contract above are saved", which the component
cannot know: `state: 'RESOLVED'` means resolved, not written.

## Tasks

1. **Extract** the pin and single-active branches into a pure
   `resolveContractDeterministic(profile, candidates, clientName, documentType)` returning
   `{ contractId, option, why }`, carrying the `WhyView` through as quick-509 did.
   `buildContractSlot` calls it — one definition, no duplication.
2. **`ensureContractCommitted(orgId, userId, record)`** — no-op when `contractId` is set;
   otherwise compose `ensureClientCommitted` (a contract belongs to a client), re-run the
   resolver, delegate to `assignContract` with PROFILE_PIN / SINGLE_ACTIVE provenance, re-read.
   Miss → return the record unchanged. No inlined `updateMany`.
3. **Call sites** — leave `setDocumentDate` and every existing contract-dependent path
   unaffected, and mark where Phase 8's commit must invoke it.
4. **Footer copy** — the "are saved" claim must only render when both ids are actually persisted;
   otherwise copy that does not assert persistence. Copy condition only, no layout.

## Constraints

Client-side 508/509 code untouched. `resolution.ts` plus the one footer line only. No schema, no
migration, no DDL. Money stays Decimal. Nothing installed.

## Known risk going in

Step 3 may have no honest call site: if no current mutation guards on `contractId`, the function
ships uncalled with a marker comment. Step 4's conditional form depends on persistence state being
reachable from the card — to be checked before writing, per the task's stop-and-describe clause.

## Verification

`tsc --noEmit` both apps; `vitest run src/lib/document-import`.

# Quick 508 — Persist auto-resolved client at the contract-mutation boundary

**Date:** 2026-08-06
**Scope:** `apps/web/src/lib/document-import/resolution.ts` only
**Root cause:** confirmed in `.planning/debug/doc-import-contract-client-guard.md` — not re-diagnosed.

## Problem

`buildClientSlot`'s auto-resolve branches (`PROFILE_ALIAS`, single `EXACT_MATCH`) return a
`RESOLVED` client for display but never persist `DocumentImport.clientId`. `ImportSummaryCard`
collapses the client step off that computed state and advances to the contract step.
`assignContract` and `createAndAssignContract` read only the DB row, find `clientId` null, and
throw "Pick the client before the contract." — with the client's name rendered in the header
immediately above the button.

## Approach

Commit the auto-resolution at the mutation boundary, not in the view. The GET path stays
read-only; the write happens on the way into a mutation that actually needs a client, and only
when the server can still derive that client deterministically.

## Tasks

1. **Extract the deterministic branches (no duplication).**
   - New `scoreClients(db, orgId, profiles, documentText) → ScoredClient[]` — the client load +
     alias map + `bestClientMatch` scoring block lifted verbatim out of `buildClientSlot`, so the
     commit path can score without re-entering view assembly. Read-only.
   - New pure `resolveClientDeterministic(record, profiles, scored, documentText) →
     { clientId, option, why } | null` — the alias-hit and single-exact-match branches, including
     the `exact.length > 1` ambiguity log. Returns the `WhyView` alongside the id so the view's
     copy lives in one place too.
   - `buildClientSlot` calls both. Branch 1 ("already chosen") is untouched.

2. **Add `ensureClientCommitted(orgId, userId, record) → ImportRecord`.**
   - `record.clientId` set → return the record as-is.
   - Otherwise re-run `resolveClientDeterministic` over freshly loaded profiles/scores.
   - Hit → delegate the write to the existing `assignClient` (no second `updateMany`), log, and
     re-read the record via `getImportRecord`.
   - Miss → return the record unchanged so the caller's guard fires.

3. **Wire into both contract mutations.**
   - `assignContract` and `createAndAssignContract`: `record` becomes `let`, and
     `record = await ensureClientCommitted(...)` sits after `assertEditable` and before the
     `NO_CLIENT` guard. Both guards stay byte-identical.

4. **Confirm `assignClient` semantics are inherited unchanged** — `documentProfileId` written via
   `recordClientConfirmation`, `contractId` cleared only when the client actually changes,
   `updatedById` set.

## Constraints honoured

- No writes in any GET/view path — `buildClientSlot` and `resolveImport` remain read-only.
- No `clientId` added to `CreateContractInput`; nothing read from the request body.
- Manual picker path (`handleSetResolution` → `assignClient`) and `ClientDecision` untouched.
- No changes to `handlers.ts`, `ContractDecision.tsx`, `ImportSummaryCard.tsx`, Prisma schema, or
  any migration. No DDL. Money stays `Prisma.Decimal`. Nothing installed.

## Verification

`npx tsc --noEmit` in `apps/web` and `apps/mobile`.

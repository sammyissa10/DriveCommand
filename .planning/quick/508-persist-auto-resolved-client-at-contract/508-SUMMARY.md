# Quick 508 — Summary

**Date:** 2026-08-06
**Commit:** `2576de75`
**Files changed:** `apps/web/src/lib/document-import/resolution.ts` (only)

## What changed

| # | Task | Outcome |
|---|------|---------|
| 1 | Extract deterministic branches from `buildClientSlot` | Done — `scoreClients()` + pure `resolveClientDeterministic()`; branch logic shared, not duplicated |
| 2 | `ensureClientCommitted()` delegating to `assignClient` | Done — no second `updateMany`; re-reads the record; returns it unchanged on a miss |
| 3 | Call it in `assignContract` + `createAndAssignContract` | Done — after `assertEditable`, before the `NO_CLIENT` guards; both guards byte-identical |
| 4 | Confirm `assignClient` semantics preserved | Done — inherited wholesale, function not modified |

### Shape of the fix

`resolveClientDeterministic(record, profiles, scored, documentText)` returns
`{ clientId, option, why } | null`. It carries the `WhyView` as well as the id — the alias-hit and
exact-match branches each produce distinct user-facing copy, and returning the id alone would have
forced that copy to be rebuilt at the call site, i.e. the duplication the task explicitly ruled
out. `buildClientSlot` is now a thin wrapper over it.

`ensureClientCommitted` is called from exactly two places, both mutations. No recursion risk:
`createAndAssignContract` ends by calling `assignContract`, which calls `ensureClientCommitted`
again — by then `clientId` is set and it returns on the first line.

## Verification

```
apps/web    npx tsc --noEmit  →  exit 0, 0 errors
apps/mobile npx tsc --noEmit  →  exit 0, 0 errors
```

`documentImport.updateMany` call sites before and after: 3 (`assignClient`, `setDocumentDate`,
`assignContract`). None added — the new path routes through `assignClient`.

**Not browser-verified.** The Dealer Tire - Chicago WHSE manifest repro from the debug session has
not been re-run; that is the remaining check before this is called done.

**Not deployed, not pushed.**

## Constraints honoured

- No writes in any GET/view path — `buildClientSlot`, `resolveImport`, `resolveImportById` unchanged in that respect.
- `CreateContractInput` unchanged; no `clientId` accepted from any request body.
- `handlers.ts`, `ContractDecision.tsx`, `ImportSummaryCard.tsx` untouched.
- No Prisma schema change, no migration, no DDL.
- Money still `Prisma.Decimal`. Nothing installed.

## Related

Root cause: `.planning/debug/doc-import-contract-client-guard.md` (now `status: resolved`, fix note appended).

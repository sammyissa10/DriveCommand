# Quick 510 — Summary

**Date:** 2026-08-06
**Commit:** `25e5ed96`
**Files changed:** `apps/web/src/lib/document-import/resolution.ts`,
`apps/web/src/components/carrier/imports/ImportSummaryCard.tsx` (one copy line)

**No schema was touched** — no Prisma model change, no migration, no DDL, and therefore no
`prisma generate`. quick-509 already added the only column this work needed. `git status` after
the change listed exactly the two files above.

## What changed

| # | Task | Outcome |
|---|------|---------|
| 1 | Extract pin + single-active into a shared pure resolver | Done — `resolveContractDeterministic`, mirroring `resolveClientDeterministic`, `why` carried through |
| 2 | `ensureContractCommitted` delegating to `assignContract` | Done — composes `ensureClientCommitted` first; no inlined `updateMany` (file still has exactly 3) |
| 3 | Wire call sites / mark Phase 8's | **Marker only** — see below |
| 4 | Footer copy must not assert an unverified save | **Clause removed, not gated** — see below |

## Step 3 — the function ships uncalled, deliberately

`grep` for `ensureContractCommitted` returns one hit: its own definition. That is the honest
outcome, not an oversight. No mutation in the codebase guards on `contractId` — `assignContract`
and `createAndAssignContract` *set* it, `setDocumentDate` is unrelated and left untouched — so
there is nowhere to call it from that needs it. Calling it from a path that does not need it would
be a write nobody asked for, which is the failure mode this whole sequence has been correcting.

The requirement is recorded in the function's own doc comment, which is where someone building the
commit will be reading:

> **Phase 8: the atomic commit must call this** before it reads `record.contractId` […] Without
> it, a trip created from an import whose contract was auto-resolved will commit with no contract
> attached while the card that authorised it displayed one.

## Step 4 — why the conditional form was not built

The task's stop-and-describe clause applies. The card cannot see persistence:

- `ImportView` (`intake.ts:86`) carries `id`, `status`, `pages`, `summary`, `resolution` — **no
  `clientId`, no `contractId`**.
- `ImportResolutionView` carries per-slot `state`, and `RESOLVED` is exactly the thing that does
  not imply a write.
- `ImportResolutionView` is mirrored verbatim in `packages/api-client/src/owner-imports.ts`
  (noted at `resolution.ts:31`), so adding a `persisted` field restructures a shared view type and
  reaches outside this task's scope.

The reachable failure is real: after quick-508 the client is written only when a contract mutation
fires, so an import that auto-resolves both slots and is then left alone has **both ids null**
while the footer claims both are saved.

So the false clause was removed — "Stop review arrives in the next phase." — with a comment
recording why. No layout change, no new props. Restoring an affirmative version means adding
something like `persisted: { client: boolean; contract: boolean }` to the resolution view and
mirroring it in `packages/api-client`; that is a deliberate product decision, not a fix to make
unilaterally.

## Verification

```
apps/web    npx tsc --noEmit  →  exit 0, 0 errors
apps/mobile npx tsc --noEmit  →  exit 0, 0 errors

apps/web    npx vitest run src/lib/document-import
              Test Files  16 passed (16)
                   Tests  222 passed (222)
```

`documentImport.updateMany` call sites: still exactly 3 (`assignClient`, `setDocumentDate`,
`assignContract`). None added.

**Not browser-verified.** Not deployed, not pushed.

## Phase 3 close-out state

The three defects in this sequence are closed in code: the client commits (508), the "why" tells
the truth about who decided (509), and the contract has a commit path ready for Phase 8 plus a
footer that no longer overclaims (510). What remains before Phase 3 can be called done is the
thing none of these did — running the Dealer Tire - Chicago WHSE manifest in a browser.

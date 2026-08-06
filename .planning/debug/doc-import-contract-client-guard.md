---
status: resolved
trigger: "doc-import-contract-client-guard"
created: 2026-08-05T00:00:00.000Z
updated: 2026-08-05T00:00:00.000Z
---

## Current Focus

hypothesis: CONFIRMED — buildClientSlot's auto-resolve paths (PROFILE_ALIAS, EXACT_MATCH) return a RESOLVED view without ever persisting `DocumentImport.clientId`. The only writer of that column is `assignClient`, which is only called when the user manually picks/confirms a client (or via `createAndAssignClient`/`createAndAssignContract`'s own success path). The frontend (`ImportSummaryCard`) treats `client.state !== 'UNRESOLVED'` as "collapsed" and renders straight to `ContractDecision` without ever calling the client-assign PATCH. `createAndAssignContract` then reads `record.clientId` fresh from the DB (`requireRecord`) and finds it null, throwing "Pick the client before the contract."
test: traced buildClientSlot (3 collapse branches), ImportSummaryCard's routing logic, ContractDecision's POST body, and createAndAssignContract's guard — all read directly from resolution.ts and handlers.ts.
expecting: confirmed by reading, no further test needed.
next_action: none — diagnose_only mode, report back to orchestrator.

## Symptoms

expected: With the client already auto-resolved (header reads "DEALER TIRE - CHICAGO WHSE has no active contract yet."), pressing "Create and use" should create the contract against that client and select it.
actual: A red error appears: "Pick the client before the contract."
errors: "Pick the client before the contract."
reproduction: Import a manifest whose client auto-resolves to an existing client (Dealer Tire - Chicago WHSE). The client step collapses automatically. Advance to the contract step — it shows the client has no active contract and offers inline contract creation. Press "Create and use".
started: Surfaced during Document Import Phase 3 closing verification (branch feature/document-import, after 1b6c861b / 33fb4c44 / 7681cc20).

## Eliminated

(none — root cause found on first pass through the four files named in the constraint)

## Evidence

- timestamp: investigation
  checked: `apps/web/src/lib/document-import/resolution.ts:1051-1053` and `:1177-1179`
  found: Both `assignContract` and `createAndAssignContract` guard with `if (!record.clientId) throw new ResolutionError('Pick the client before the contract.', 'NO_CLIENT')`. `record` comes from `requireRecord` → `getImportRecord` → a fresh DB read of the `DocumentImport` row, not from any client-side/wizard state.
  implication: the error is a server-side guard reading the DB column directly.

- timestamp: investigation
  checked: `apps/web/src/lib/document-import/resolution.ts:481-605` (`buildClientSlot`)
  found: Three collapse branches. Branch 1 ("Already chosen") requires `record.clientId` to already be set in the DB and just re-reads the client row. Branches 2 (`PROFILE_ALIAS`) and 3 (`EXACT_MATCH`) return `state: 'RESOLVED'` with a `value` built purely from `scored`/`aliasHit`/`rows` — no call to `assignClient`, no `db.documentImport.update*` of any kind.
  implication: auto-resolve (the manifest-import path in the bug report) never writes `DocumentImport.clientId`; it only produces a display-shaped `ClientSlotView`.

- timestamp: investigation
  checked: `apps/web/src/lib/document-import/resolution.ts:945-989` (`assignClient`) — the only function in the whole file that does `db.documentImport.updateMany({ ..., data: { clientId, ... } })`.
  found: It is invoked from `handleSetResolution` (PATCH `/resolution` with `{ clientId }`) and internally by `createAndAssignClient`. Nothing in `buildClientSlot` calls it.
  implication: confirms `clientId` on `DocumentImport` has exactly one writer, and it is never reached by the auto-collapse path.

- timestamp: investigation
  checked: `apps/web/src/components/carrier/imports/ImportSummaryCard.tsx:64-88`
  found: `if (r.client.state === 'UNRESOLVED') return <ClientDecision .../>` — this is the ONLY branch that renders the client-picker UI (whose `select()` fires the PATCH that calls `assignClient`). Anything else (`RESOLVED` via CHOSEN, PROFILE_ALIAS, or EXACT_MATCH — the view makes no distinction) falls through to `if (r.contract.state !== 'RESOLVED') return <ContractDecision ... clientName={r.client.value?.name} .../>`.
  implication: the wizard's "collapse" decision is driven purely by `client.state`, which auto-resolve sets to `RESOLVED` without ever having persisted anything. `clientName` passed to `ContractDecision` is display-only (`r.client.value?.name`), not a value that flows into any request body.

- timestamp: investigation
  checked: `apps/web/src/components/carrier/imports/ContractDecision.tsx:107-111` (`createContract`) and `apps/web/src/lib/document-import/handlers.ts:274-302` (`handleCreateResolutionContract`)
  found: POST body is `{ spot: false, contractName? }` — no `clientId` field exists anywhere in `CreateContractInput` (resolution.ts:1121-1131) or in the handler's parsing of `body`. The handler calls `createAndAssignContract(orgId, userId, importId, input)`, which internally re-derives the client only from `record.clientId` (the DB row), never from the request body.
  implication: even if the frontend wanted to pass the auto-resolved client id explicitly, there is no field in the mutation's input schema to carry it — the mutation is designed to trust `record.clientId` exclusively.

## Resolution

root_cause: |
  `buildClientSlot`'s PROFILE_ALIAS and EXACT_MATCH auto-resolve branches (resolution.ts:546-595) compute a `RESOLVED` `ClientSlotView` for display purposes only — they never call `assignClient` (the sole writer of `DocumentImport.clientId`, resolution.ts:945-989). The wizard UI (`ImportSummaryCard.tsx:76-88`) collapses the client step and advances to the contract step based solely on `client.state !== 'UNRESOLVED'`, with no distinction between "the DB row actually has clientId set" (CHOSEN) and "we merely computed a good match for the header" (PROFILE_ALIAS/EXACT_MATCH). When `ContractDecision`'s "Create and use" button posts to `createAndAssignContract`, that mutation re-reads the import row fresh from the DB and finds `record.clientId` still null, so its `NO_CLIENT` guard (resolution.ts:1177-1179) fires and produces "Pick the client before the contract." The header text ("DEALER TIRE - CHICAGO WHSE has no active contract yet.") is correct and truthful about the *view*; the DB write that should back it up simply never happened.
fix: |
  Applied 2026-08-06 as quick-508, in `apps/web/src/lib/document-import/resolution.ts` only.

  The auto-resolution is now committed at the mutation boundary rather than in the view:

  1. The scoring block and the two deterministic branches were lifted out of `buildClientSlot`
     into `scoreClients()` (read-only client load + `bestClientMatch` scoring) and the pure
     `resolveClientDeterministic(record, profiles, scored, documentText)`, which returns
     `{ clientId, option, why } | null`. `buildClientSlot` now calls both, so there is exactly
     one definition of "deterministic enough to collapse" — the branch logic is shared, not
     duplicated. Branch 1 ("already chosen") is unchanged.
  2. New `ensureClientCommitted(orgId, userId, record)`: returns the record untouched when
     `record.clientId` is already set; otherwise re-runs `resolveClientDeterministic` and, on a
     hit, delegates the write to the existing `assignClient` (no second `updateMany` inlined)
     and re-reads the record. On a miss it returns the record unchanged so the caller's guard
     fires exactly as before.
  3. `assignContract` and `createAndAssignContract` call `ensureClientCommitted` after
     `assertEditable` and before their `NO_CLIENT` guards. Both guards are byte-identical to
     before — an ambiguous or merely-fuzzy match still throws "Pick the client before the
     contract.", which is correct, because in that case the card never collapsed the client
     step either.

  `assignClient`'s semantics are inherited wholesale rather than reimplemented: the alias is
  still learned via `recordClientConfirmation`, `documentProfileId` is still written,
  `contractId` is still cleared only when the client actually changes, and `updatedById` is
  still set. That is deliberate — a system-committed client should leave exactly the trail a
  human-picked one leaves.

  Why the view path is still pure: the only new write is inside `ensureClientCommitted`, which
  is called from precisely two places, both mutations (`resolution.ts:1162` in `assignContract`,
  `:1289` in `createAndAssignContract`). `buildClientSlot`, `resolveImport` and `resolveImportById`
  call only `scoreClients` and `resolveClientDeterministic`, neither of which touches the
  database beyond the `findMany` that was always there. A GET of the resolution view therefore
  still writes nothing, and the file's `documentImport.updateMany` call sites are the same three
  as before the change (`assignClient`, `setDocumentDate`, `assignContract`) — none added.

  Not deployed, not pushed.
verification: |
  `npx tsc --noEmit` — apps/web: 0 errors (exit 0). apps/mobile: 0 errors (exit 0).
  Not yet exercised in the browser against the Dealer Tire - Chicago WHSE manifest.
files_changed:
  - apps/web/src/lib/document-import/resolution.ts

## Follow-up — quick-509, resolution provenance (2026-08-06, commit 9fc739b8)

quick-508 left a second-order problem behind it. Once the system commits a client
on the user's behalf, the read path can no longer tell a machine commit from a
human one — both are just a set `clientId` — and the already-chosen branch
assumed a human, rendering "You picked this client" for a client nobody picked.
The affordance whose entire job is to explain a decision was misattributing it.

Provenance is not recoverable at read time, so it is now recorded at write time.

**Column:** `document_imports.resolution_provenance jsonb NULL`, applied to
production via Supabase MCP *before* this task. No DDL was run here. The repo was
synced by writing `20260806040500_add_resolution_provenance` and marking it
applied (`prisma migrate resolve --applied`), per DEC-3 rules 1 and 4 — verified
in `_prisma_migrations`: `applied_steps_count = 0`, `finished_at` set,
`rolled_back_at` null, identical to `20260803115314_add_raw_response` and
`20260802230853_add_appointment_is_firm`. The count is 0 for every migration
registered this way; `resolve --applied` records the row without executing steps.

**Shape:** `{ client: { via, score, matchedText, byUserId, at }, contract: {...} }`.
Client vias: MANUAL, MANUAL_CREATE, PROFILE_ALIAS, EXACT_MATCH. Contract vias:
MANUAL, SINGLE_ACTIVE, PROFILE_PIN, CREATED_THIS_IMPORT. This vocabulary is
deliberately separate from the view's `ResolvedVia` — one says what happened, the
other says what to render, and conflating them is what produced the bug. No view
type changed, so the `packages/api-client` mirror needed no update.

**Merge:** Prisma exposes no jsonb `||` operator. Rather than add a round trip,
both writers merge in memory from the record `requireRecord` already returned and
write the merged object in the same `updateMany` — a read-modify-write that costs
nothing because the read had already happened. The other slot's key is carried
across, not overwritten. One deliberate exception: when the client changes,
`assignClient` already nulls `contractId`, so it drops the contract's provenance
with it rather than leaving a record describing a value that no longer exists.
Concurrency is last-write-wins, the same as the `clientId` write it rides along
with.

**Read:** the already-chosen branches render from the stored record. A null
record — every row written before the column existed — reproduces the previous
copy byte-for-byte, and that fallback is true rather than merely safe: before
quick-508 the manual picker was the only writer, so "you picked this" was correct
for all of them. An unrecognised `via` is treated as absent for the same reason.

**Copy correction that falls out of this:** the contract branch previously read
`isOneTime` off the contract row, so a *pre-existing* one-time contract that a
human selected from the list rendered "A one-time spot contract created from this
document" — false. A stored MANUAL now renders "You picked this contract."

**Not done, and flagged rather than worked around:** nothing writes the
SINGLE_ACTIVE or PROFILE_PIN contract vias, because no code path commits a
contract from those branches. `assignContract` has exactly two callers (MANUAL
from the picker, CREATED_THIS_IMPORT from create-and-use).
`buildContractSlot`'s PROFILE_PIN and ONLY_ACTIVE_CONTRACT branches are
view-only — **the identical latent defect quick-508 fixed for clients**. It is
not yet user-visible only because no commit path consumes `record.contractId`
today (there is no `commit.ts`; that is a later phase). It will bite the moment
one exists. The two vias and their rendering are in place, so closing it is a
one-function change (`ensureContractCommitted`, mirroring `ensureClientCommitted`)
— deliberately not made here, as it changes behaviour beyond this task's scope.

**Verification:** `tsc --noEmit` 0 errors in apps/web and apps/mobile;
`vitest run src/lib/document-import` 222/222 passing across 16 files. Still not
browser-verified. Not deployed, not pushed.

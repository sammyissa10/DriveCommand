# quick-537 — is_sample picker filtering (report-only) + closing the out-of-service verification

Two items from the Phase 8 close-out, in dependency order.

## Part A — is_sample filtering survey. REPORT ONLY.

Items 1–4. No behaviour change. Whether sample records should be assignable to a real
dispatch is a product decision, not a code fix.

Deliverables: every `is_sample` query with file, surface, and include/exclude; a consistency
verdict across the tables that carry the column; what the dashboard banner implies and whether
picker-hiding is deliberate; and whether `facilities` lacking the column is deliberate or an
omission.

## Part B — Close the out-of-service verification

Items 5–7. The `TRAILER_TYPES` fix from quick-536 is committed, so the one `out_of_service`
truck in the database — a `flatbed`, previously diverted into the Trailer list — is reachable
for the first time.

### T1 — Integration test
`tests/carrier/document-import-commit-out-of-service.test.ts`. Real rows, disposable tenant,
`tests/isolation/setup.ts` discipline.
- The picker RETURNS the truck, `blocked = true`, flag present, block message names truck + reason.
- `handleCommitImport` answers **422** with a structured code and creates no trip.
- Zero row delta asserted from the DATABASE.
- Control case: same truck back in service stops blocking.
Commit: `test(quick-537): an out-of-service truck is offered, flagged and refused`

### T2 — Report the exact strings
Item 7: the block's code and message, set beside the expired-CDL and overlap blocks so the
wording can be judged for consistency.

## Constraints carried from the brief
- Part A report-only; zero behaviour changes to `is_sample` handling.
- No DDL. Do not add `is_sample` to `facilities`.
- No writes to tenant `7e9eca25-1f97-46ed-9365-e67be49436d5`; disposable tenant only, `afterAll`
  cleanup VERIFIED by post-teardown row count.
- Do not modify trip `53e002c8-722b-4f36-a6a8-1c9428a294b0` or its rows.
- Do not re-verify anything already confirmed in quick-536.
- `git worktree remove`, never `Remove-Item`.

# quick-528 — `route_matrix_cache` PrismaClientValidationError

**Date:** 2026-08-24
**Type:** READ-ONLY diagnostic — no code changed, no DDL, no DB writes, no DB reads, no dev server.
**Artifact:** [.planning/document-import/diagnostics/phase7-matrix-cache-prisma-validation.md](../../document-import/diagnostics/phase7-matrix-cache-prisma-validation.md)

## Headline

**`RouteMatrixCache` is missing from `EXEMPT_MODELS` in `tenant-rls.ts`.** Every query against it
gets `tenantId` injected into a model that has no `tenantId` field, and Prisma rejects the unknown
argument during client-side validation before any SQL is emitted.

**Neither call site is wrong.** The extension corrupts the arguments: `where` on the read
(`tenant-rls.ts:129-131`), and **both `where` and `create`** on the write (`:180-183`).

**This is a known, documented, previously-fixed bug class, and the comment describing it sits four
lines above the omission.** `tenant-rls.ts:91-100` records the identical failure for the four
Phase 1 Document Import models: *"They were added to the schema without being added here, so every
query against them had `{ tenantId }` injected into a model that has no such column, which Prisma
rejects outright."* quick-520 added `RouteMatrixCache` and did not add it to that set — the same
mistake, one phase later.

## Correction to quick-527

quick-527 claimed `seq_scan = 12` proved *"the code demonstrably reaches this table and reads it
successfully."* **Wrong, and backwards.** The scans are external MCP verification SQL (including
quick-527's own `SELECT count(*)`), and more fundamentally **an app read cannot produce a seq_scan
at all** — `PrismaClientValidationError` is raised before a statement is emitted, so a failing read
never contacts Postgres. The statistic could never have measured what it was used to measure.

**Survives:** the L1 short-circuit is still a real code-path fact (`optimisation-matrix.ts:263`
returns before the persist gate at `:308`), and the permissions finding stands (`postgres` has
INSERT; the `app_user` debt is real but inactive) — now doubly moot, since no SQL is emitted.

**Does not survive:** the claim that reads work, and the confidence that the L1 short-circuit was
the only cause. **Two independent defects, either sufficient alone**, and this one is more
fundamental: it breaks reads as well as writes, on every path, warm L1 or cold.

## Findings

1. **Model exists** — `schema.prisma:2782-2793`, quoted in full.
2. **Zero mismatches** against the real table across all 8 elements (6 fields + unique + `@@map`).
   Also noted the error class rules this category out *a priori*: a schema/table mismatch produces
   a Postgres runtime error (`P2022`/`42703`), never a client-side validation error.
3. **Generated client IS current** — mtime 2 min 50 s *after* the schema; commit `17be3b02` carries
   both; generated `RouteMatrixCacheSelect` lists exactly the six fields. **The stale artifact is
   `tenant-rls.ts`** — 8 days older than the model and untouched by quick-520 (`git show --stat`
   lists no `tenant-rls` entry; last commit `89b6e79e`, 2026-08-03).
4. **Failing argument is `tenantId`**, injected by `withTenantRLS`. `grep -c "RouteMatrixCache"` on
   `tenant-rls.ts` returns **0** against 23 exempt entries.
5. **Write would throw the same error — yes**, and for a strictly worse reason: corrupted in two
   places rather than one.
6. **Exactly two call sites for this model**, both broken; no third consumer anywhere. A bare
   `prisma` call would succeed — the extension applies only via `createTenantClient`.

## Adjacent finding, flagged not asserted

Six other models share the missing exemption — `Plan`, `Promo`, `NotificationTemplate`,
`NotificationEmailConfig`, `GridPreference`, `GridView` (the Section 4.12 global-table allowlist).
They fail identically **if and only if** queried through a tenant client. Spot checks were
inconclusive; **reachability was NOT verified**, and a file containing `getTenantPrisma` does not
prove the call in question uses it. `(owner)/actions/tenant-notification-settings.ts` (10
`getTenantPrisma` refs, touches `notificationTemplate`) is the one worth opening.

## Ambiguity left open rather than inferred

- **Whether the write has ever been attempted is still open.** `matrix cache write failed` is absent
  from the captured log while `matrix cache read failed` is present, which is consistent with
  quick-527's L1 short-circuit — but one log line from one GET is not sufficient evidence. A capture
  spanning an actual apply POST would settle it. It no longer affects the outcome either way:
  **whether or not the write is reached, it cannot succeed.**
- **The error was not reproduced** — that needs a dev server, which the constraints forbid. The
  diagnosis is a code-reading argument with every link quoted, not an observed stack trace. Error
  class, the grep-verified absence from `EXEMPT_MODELS`, and the documented precedent for the same
  bug in the same file all agree, hence high confidence — but stated as inference.

## Workflow deviation

No planner/executor pair — read-only single-artifact diagnostic, same shape as quick-522/525/527.

## Files

- Created: `.planning/document-import/diagnostics/phase7-matrix-cache-prisma-validation.md`
- Created: `.planning/quick/528-matrix-cache-prisma-validation-failure/528-SUMMARY.md`
- Modified: `.planning/STATE.md` (quick task row)
- **Source files modified: none.**

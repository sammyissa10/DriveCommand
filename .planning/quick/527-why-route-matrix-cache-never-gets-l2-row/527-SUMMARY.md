# quick-527 — Why does `route_matrix_cache` never receive an L2 row?

**Date:** 2026-08-24
**Type:** READ-ONLY diagnostic — no code changed, no DDL, no DB writes, no dev server. Read-only
`SELECT`s were run (permitted: the constraint forbids writes and DDL, not reads).
**Artifact:** [.planning/document-import/diagnostics/phase7-matrix-cache-write.md](../../document-import/diagnostics/phase7-matrix-cache-write.md)

## Headline

**The L1 cache short-circuits `getDistanceMatrix` before the L2 write can be reached on the apply
path.** `getDistanceMatrix` returns on an L1 hit at
[optimisation-matrix.ts:263](../../../apps/web/src/lib/document-import/optimisation-matrix.ts#L263);
the `persist: true` gate that writes L2 is 45 lines below at
[:308](../../../apps/web/src/lib/document-import/optimisation-matrix.ts#L308). Everything between
them — provider call, L1 write, L2 write — is dead code on any call that hits L1.

The ordering is guaranteed by the UI contract, not a race: the card must be **rendered** before it
can be **tapped**. Rendering is a GET (`persist: false`) that computes the matrix and populates L1
at `:306` while being *forbidden* from writing L2. The tap is a POST (`persist: true`) in the same
process over the same facility set — same key — so it **hits L1 and returns at `:263`**, never
reaching `:308`.

**The GET populates L1 but may not write L2; the POST may write L2 but cannot get past L1.** Each
half is individually correct and the pair is unsatisfiable. `persist: true` is threaded faultlessly
all the way down and then never consulted.

## Findings

1. **Full trace, 14 steps quoted** from `applyTemplateOptimisation` (`:513`) → `:521` → `:397` →
   `:482` → `:484-488` → `getDistanceMatrix` (`:241`) → key at `:259` → **early return at
   `:262-263`** → [dead: L2 read `:268-296`, OSRM `:299`, L1 write `:306`, persist gate `:308-314`,
   `db.routeMatrixCache.upsert` `:172`]. That `upsert` is the **only** write to this table anywhere
   in the codebase.
2. **No divergence between the two apply paths.** Import `:287-291` and template `:484-488` pass
   character-for-character identical option objects. `persist: true` genuinely arrives on both. The
   real divergence is between *any* apply path and the L1 state it inherits from its own preceding
   GET — so the import path has the same defect and has simply never been exercised hard enough to
   notice.
3. **No transaction coupling.** The `upsert` is standalone on `db`; the reorder uses
   `prisma.$transaction` on a *different* client (`route-template-save.ts:346`, `:369`) and runs
   **after**. A cache-write failure cannot roll back the reorder. **Stated explicitly: the reorder
   having persisted constrains nothing** about the cache write — the two are uncoupled, so that
   line of reasoning is a dead end, closed rather than left dangling.
4. **Double-swallowed.** Inner `:171-190` and outer `:309-313` (read likewise `:165-168` /
   `:274-278`). Never thrown, never returned to the client; the HTTP response is byte-identical
   whether the write succeeded, failed, or never ran. Surfaces **only** as
   `logger.warn('[document-import] matrix cache write failed')` — and not even that here, since no
   write is attempted. Same triple invisibility quick-522 recorded for the null-coordinate path.
5. **Permissions are NOT the cause.** App connects as **`postgres`** (pooler form
   `postgres.<project-ref>`; no `app_user` URL in `.env.local`). Verified live:
   `has_table_privilege('postgres','route_matrix_cache','INSERT') = true`, SELECT and UPDATE also
   true, `relrowsecurity = false`. `app_user` INSERT is `false`, so **the tracked debt is confirmed
   real AND confirmed inactive** — recorded both ways so it is neither closed on this evidence nor
   blamed for this symptom. Unique constraint `route_matrix_cache_org_key_unique (org_id,
   facility_key)` exists and `computed_at` has `@default(now())`, so the statement would not have
   failed had it run.
6. **Key divergence structurally impossible.** One `key` binding computed at `:259` is reused by
   the L1 read, L1 write, L2 read and L2 write; `matrixCacheKey` is called nowhere else on the
   path. **No insert has ever succeeded** — `n_tup_ins = n_tup_upd = n_tup_del = 0` — but
   **`seq_scan = 12`**, proving the table *is* read successfully. Reads happen, writes never do,
   which is exactly the asymmetry the L1 short-circuit predicts (an L1 miss proceeds to the L2 read
   and increments the scan count; an L1 hit returns before it).

## The single most useful number

`seq_scan = 12` alongside `n_tup_ins = 0`. It rules out, in one reading, every "the code never gets
there / the connection is wrong / the role can't see the table / the model is misnamed" hypothesis
— the table is demonstrably reached and read — and isolates the failure to the write half alone.

## Residual uncertainty, stated not inferred

Twelve scans mean twelve calls got past the L1 early-return. Had any been `persist: true`, it would
have reached `:308` and attempted a write, making `n_tup_ins` non-zero. It is zero. Two readings:
**(a)** no apply POST has ever run with a cold L1 (consistent with the structure; L1 TTL is 24h),
or **(b)** one did and failed silently for a non-permission reason. **Cannot be distinguished from
table statistics alone** and no server logs were available. (a) is strongly favoured — it follows
from the code without positing an unexplained failure, and permissions, the unique constraint and
the `computed_at` default are all positively ruled out for (b). **The discriminator is cheap:** grep
the dev server output for `matrix cache write failed`. Any hit proves (b) and a second independent
cause; silence confirms (a).

Also flagged: Turbopack HMR resets the module-scoped L1 `Map` (`:80`) on recompile, so cold-L1 GETs
are frequent locally and plausibly explain twelve scans across three OSRM computations — but
**local timing is not representative of production**, where a long-lived process keeps L1 warm
longer and would make the L2 write rarer still, not more common.

## Workflow deviation

No planner/executor subagent pair — read-only single-artifact diagnostic, same shape as quick-522
and quick-525. The optimisation path was read directly; production was queried with read-only
`SELECT`s for questions 5 and 6.

## Files

- Created: `.planning/document-import/diagnostics/phase7-matrix-cache-write.md`
- Created: `.planning/quick/527-why-route-matrix-cache-never-gets-l2-row/527-SUMMARY.md`
- Modified: `.planning/STATE.md` (quick task row)
- **Source files modified: none.**

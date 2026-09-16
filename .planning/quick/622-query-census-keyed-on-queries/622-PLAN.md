# quick-622 — PLAN

**Regenerate the census keyed on queries rather than on the bypass flag.**

Target: investigation and tooling only. Production (`oqdhberkghtnszrkdvfm`) read once, read-only, for RLS/policy/grant
state. Staging untouched. No call site fixed, no policy/grant/migration changed, nothing installed.

Planned and executed inline by the orchestrator, as quick-621 was: each step's design depended on what the previous
run measured (four resolver gaps were only discoverable by running the scanner and reading its UNRESOLVED reasons).

## Approach
A `ts.Program` over every shipping file in `apps/web/src`, with the type checker resolving each query's client
through declarations, helper returns, parameters (call sites, and functions passed as values), destructuring and
transaction callbacks. It emits one row per statement: client, tables (with relation traversal and `_count`),
production RLS state, bypass flag as a column, tenant source, failure handling followed through callers. Nothing is
trusted until it finds three sets prior methods missed.

## Steps
1. `622-query-census.ts`. Iterate until the UNRESOLVED reasons are either followed or proven `ABSENT`; report the remainder.
2. Capture production `pg_class`/`pg_policy`/grants into `evidence/00-production-rls-tables.json` (read-only).
3. Totals by client, surface, file kind, tenant source, failure; the cutover-gating number stated explicitly.
4. `622-ground-truth.ts`:
   - GT1: the owner layout, at HEAD and against `37e0bb17^` via `--override`.
   - GT2: quick-618's 56, with receiver-class agreement.
   - GT3: quick-615's Route `_count`.
   - R1–R4: reconcile against 177 / 125 / 45 using a replica of the flag walker.
   - Witness red with `--break-resolver`.
5. Size remaining work by surface into one-task batches.
6. Analyse the in-process TC001 detector against GUC inheritance.
7. `docs/audits/query-census.md`, superseding quick-616's census. Gates: tsc (probed). Commit.

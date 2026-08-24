# quick-529 — Fix `route_matrix_cache`: RLS exemption, L1 write-through, error logging

**Date:** 2026-08-24
**Commit:** `6b3a4ab1` (code). Two files, both on the modify list.

## STEP 1 — GATE: PASSED

Both call sites scope by `orgId` explicitly, so exempting the model removes nothing that was
providing isolation.

**Read** — `optimisation-matrix.ts:155-158`:

```ts
const row = await db.routeMatrixCache.findFirst({
  where: { orgId, facilityKey: key },
  select: { miles: true, minutes: true, computedAt: true },
});
```

**Write** — `:172-187`:

```ts
await db.routeMatrixCache.upsert({
  where: { orgId_facilityKey: { orgId, facilityKey: key } },
  create: { orgId, facilityKey: key, miles: row.miles, minutes: row.minutes },
  update: { miles: row.miles, minutes: row.minutes, computedAt: new Date() },
});
```

`orgId` is present in the read's `where`, the write's `where` (inside the compound unique) **and**
the write's `create`. The `update` branch needs none — it is reachable only through a `where` that
already pins `(org_id, facility_key)`.

Four supporting guarantees, all checked:

- `MatrixCacheOptions.orgId` is a **required** `string` (`:220`) — not optional, so a caller cannot
  omit it.
- Both store calls are guarded on a truthy `orgId`: `if (store && orgId)` (`:268`) and
  `if (options?.persist === true && store && orgId)` (`:308`).
- **Same-binding identity:** the *same* `orgId` parameter is passed to
  `getTenantPrismaForOrg(orgId, userId)` (`optimisation-service.ts:399`) and to
  `getDistanceMatrix(points, { orgId, … })` (`:485`) — same function scope, same variable.
  Identically at `:518`/`:288`. The store's scoping key is exactly the tenant the client was built
  for, not a second independently-derived value that could drift out of step.
- The injection was never what scoped this table. It only ever broke it.

**Verdict: PROCEED.** Recorded before any file was modified.

## What changed

| File | Change |
|---|---|
| `lib/db/extensions/tenant-rls.ts` | `'RouteMatrixCache'` added to `EXEMPT_MODELS` (**one entry, nothing else touched**), plus an extension of the lines 91-100 comment recording this as the second occurrence. |
| `lib/document-import/optimisation-matrix.ts` | L1-hit write-through under `persist`; `store`/`orgId` hoisted above the early return; all four catches use `serializeError`; two header paragraphs corrected. |

### Defect A — the exemption

The comment now records the rule the two occurrences share: **a model added to `schema.prisma`
without a `tenantId` column must be added here in the same commit** — the schema edit and this list
are one change wearing two files, and a Prisma regeneration will not tell you. quick-520 is named
as the change that introduced it, quick-528 as the diagnosis.

### Defect B — the write-through

Added at the L1-hit exit, under the **same** `options?.persist === true` gate.

- The `:308` write is **not** moved and **not** removed — it belongs to a fresh provider result,
  the new one to a cached value, and they have different reasons to exist.
- **A GET still cannot write L2.** A viewed-never-accepted set stays L1-only, exactly as the
  header promises.
- `store`/`orgId` were declared *after* the early return, so they had to be hoisted — which is
  itself half of why L2 was unreachable.
- Redundant write-through is harmless: the upsert is idempotent on `(org_id, facility_key)`.

### Two header paragraphs corrected rather than left lying

The change falsified two claims in the file's own header. Both are fixed, because a comment that
contradicts the code beneath it is worse than no comment:

- *"A cache HIT never writes anything, in either layer's store"* → now scoped to **read paths**,
  which is what remains true.
- Stated wrinkle, not glossed: an accept over an already-cached set touches `computed_at` through
  the upsert's update branch, so the 30-day L2 ceiling now measures from the last **accept** rather
  than the last provider call. Deliberate trade for making L2 reachable at all, and it errs safe —
  it can only delay retiring a matrix a human just acted on, never extend the life of one nobody
  is using.

### Error logging — all four catches, not the two named

The task named the two *write* catches (`:171-190`, `:309-313`). **All four are fixed**, because the
error that hid this bug for the entire module was swallowed by the **read** catch — the task's own
justification sentence says exactly that. Fixing only the write catches would have left the guilty
one generic.

`serializeError` was already in `lib/logger.ts`, written for this precise failure: its header
records that `JSON.stringify(new Error('boom'))` is `{}` because `name`/`message`/`stack` are
non-enumerable, and that this is how *"page cache read failed"* logged `err: {}` for every page of
every run. Reused rather than hand-rolled.

## Verification

- **tsc gate PROBED before being trusted.** Injected `const __probe529: number = "not a number";`
  into `optimisation-matrix.ts` — a file actually edited — and confirmed tsc reported
  `optimisation-matrix.ts(372,7): error TS2322` **and that error only**, proving semantic checking
  was live program-wide. Probe removed (`grep -c` → 0), re-run clean. **tsc 0 errors.**
- **Vitest `src/lib/document-import`: 509/509 across 31 files**, unchanged from baseline.
- **Scope verified per file by `git diff`:** `schema.prisma`, `optimisation-service.ts`, both
  suggestion components and the mobile twin all UNTOUCHED; zero diff under
  `apps/web/src/app/api/**/optimisation/**` and `prisma/migrations/**`. The `EXEMPT_MODELS` diff is
  a single added line.
- No DDL, no Supabase writes, no dev server.

## Gaps, stated not hidden

**1. The new write-through is not covered by a test.** The existing suite passes because every hit
path in it uses `persist: false` — so nothing contradicted the change, but nothing exercised it
either. `matrix-cache.test.ts` is the natural home and its fake store already asserts write counts;
the missing case is "L1 hit + `persist: true` writes exactly one row". Not added because the task's
file list is explicit and does not include the test file. **Recommended as the immediate follow-up**
— this is a cache-layering rule with a dedicated layering suite that now has a hole in it.

**2. Not browser-verified, and the outcome is unconfirmed in the database.** No dev server was
started and no rows were written, so the fix rests on the diff plus the reasoning above.
`route_matrix_cache` is still at 0 rows. **The check that proves it worked:** apply a suggestion,
then `SELECT count(*) FROM route_matrix_cache` — it should be 1. If it is still 0, the new
`serializeError` output in the log will now name the real reason instead of swallowing it, which is
the point of the third change.

**3. `n_tup_ins` will now be the honest signal** it was mistaken for in quick-527. That task read
`seq_scan` as evidence the app was reading this table; quick-528 corrected it (the scans were
external MCP queries, and a client-side validation error never reaches Postgres). With Defect A
fixed, app traffic will finally appear in these statistics for the first time.

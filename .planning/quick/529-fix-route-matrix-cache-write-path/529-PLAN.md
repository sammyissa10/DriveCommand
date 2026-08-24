# quick-529 — Fix `route_matrix_cache`: RLS exemption, L1 write-through, error logging

**Goal:** Make L2 caching actually work. Two independent defects, each sufficient alone to keep
the table at `n_tup_ins = 0`, must be fixed together.

## STEP 1 — GATE: PASSED

Both call sites scope by `orgId` explicitly. Exempting the model does **not** remove isolation,
because the injection was never what provided it here.

**Read** — [optimisation-matrix.ts:155-158](../../../apps/web/src/lib/document-import/optimisation-matrix.ts#L155):

```ts
const row = await db.routeMatrixCache.findFirst({
  where: { orgId, facilityKey: key },
  select: { miles: true, minutes: true, computedAt: true },
});
```

**Write** — [:172-187](../../../apps/web/src/lib/document-import/optimisation-matrix.ts#L172):

```ts
await db.routeMatrixCache.upsert({
  where: { orgId_facilityKey: { orgId, facilityKey: key } },
  create: { orgId, facilityKey: key, miles: row.miles, minutes: row.minutes },
  update: { miles: row.miles, minutes: row.minutes, computedAt: new Date() },
});
```

`orgId` appears in the read's `where`, the write's `where` (inside the compound unique) **and**
the write's `create`. The `update` branch needs none — it is reached only through a `where` that
already pins `(org_id, facility_key)`.

Supporting guarantees:

- `MatrixCacheOptions.orgId` is a **required** `string` ([:220](../../../apps/web/src/lib/document-import/optimisation-matrix.ts#L220)).
- Both store calls are guarded on a truthy `orgId`: read `if (store && orgId)`
  ([:268](../../../apps/web/src/lib/document-import/optimisation-matrix.ts#L268)), write
  `if (options?.persist === true && store && orgId)`
  ([:308](../../../apps/web/src/lib/document-import/optimisation-matrix.ts#L308)).
- **Same-binding identity:** in `getTemplateOptimisation` the *same* `orgId` parameter is passed to
  `getTenantPrismaForOrg(orgId, userId)` ([optimisation-service.ts:399](../../../apps/web/src/lib/document-import/optimisation-service.ts#L399))
  and to `getDistanceMatrix(points, { orgId, … })` ([:485](../../../apps/web/src/lib/document-import/optimisation-service.ts#L485)).
  Identically at `:518`/`:288` for the other two entry points. The store's scoping key is exactly
  the tenant the client was built for — not a second, independently-derived value that could drift.

**Verdict: PROCEED.**

## Tasks

### T1 — `tenant-rls.ts`: exempt the model
Add `'RouteMatrixCache'` to `EXEMPT_MODELS` and extend the lines 91-100 comment to record this as
the **second** occurrence of the class, naming quick-520 as the change that introduced it and
quick-528 as the diagnosis. No other entry touched.

### T2 — `optimisation-matrix.ts`: L1 write-through
Hoist the `store`/`orgId` bindings above the L1 read (they are currently declared after the early
return, so the write-through cannot see them), then write through to L2 on an L1 hit **under
`persist: true` only**.

- The `:308` write is **not** moved and **not** removed.
- The GET path still cannot write L2 — the same `options?.persist === true` gate governs.
- Redundant write-through is harmless: the upsert is idempotent on `(org_id, facility_key)`.

### T3 — `optimisation-matrix.ts`: legible errors
Replace `{ error }` with `{ error: serializeError(error) }` in the catch blocks. `serializeError`
already exists in `lib/logger.ts` and was written for precisely this failure — its header records
that `JSON.stringify(new Error('boom'))` is `{}` because `message`/`stack`/`name` are
non-enumerable, and that this is how *"page cache read failed"* logged `err: {}` for every page of
every run. Reuse it rather than hand-rolling a formatter.

**Scope note:** the task named the two *write* catches (`:171-190`, `:309-313`), but the error that
hid this bug for the whole module was swallowed by the **read** catch, and its own justification
sentence says so. All four catches are fixed — strictly more than asked, in the same file, serving
the stated purpose. Flagged in the summary rather than done silently.

## Do-not-touch

`schema.prisma`, any migration, `optimisation-service.ts`, the route handlers, the suggestion
components, and every other `EXEMPT_MODELS` entry.

## Verification

- `tsc --noEmit` both apps, **probed first** with a deliberate error in a file actually edited.
- Vitest `src/lib/document-import` — the matrix-cache layering tests must still pass, since the
  write-through changes when `store.write` is called.
- No DDL, no Supabase writes, no dev server.

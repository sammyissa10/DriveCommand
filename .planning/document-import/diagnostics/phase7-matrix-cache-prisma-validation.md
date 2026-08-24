# quick-528 — `route_matrix_cache` PrismaClientValidationError

**Type:** READ-ONLY diagnostic. No code modified, no DDL, no database writes, no dev server.
**Date:** 2026-08-24
**Trigger:**

```
[2026-08-24T02:46:53.384Z] WARN: [document-import] matrix cache read failed
  {"error":{"name":"PrismaClientValidationError","clientVersion":"7.6.0"}}
```

---

## Headline

**`RouteMatrixCache` is missing from `EXEMPT_MODELS` in the tenant RLS extension, so every query
against it has `tenantId` injected into a model that has no `tenantId` field.** Prisma rejects the
unknown argument during client-side validation, before any SQL is emitted.

The failing argument is **not in the call**. Both call sites are correct as written. The extension
adds `tenantId` to `where` (and, on the write, to `create` as well) at
[tenant-rls.ts:129-131](../../../apps/web/src/lib/db/extensions/tenant-rls.ts#L129) and
[:180-183](../../../apps/web/src/lib/db/extensions/tenant-rls.ts#L180).

**This is a known, documented, previously-fixed bug class, and the comment describing it sits
directly above the omission.** Lines 91-100 of the same file record the identical failure for the
four Phase 1 Document Import models:

> *"Document Import (Phase 1) — all four use orgId, matching their carrier siblings above.
> **They were added to the schema without being added here, so every query against them had
> `{ tenantId }` injected into a model that has no such column, which Prisma rejects outright.**"*

`RouteMatrixCache` was added in quick-520 and was not added to that set — the same mistake, one
phase later, four lines below its own warning.

**The read has never once reached Postgres.** Neither has the write.

---

## Correction to quick-527

quick-527 stated that `seq_scan = 12` proved *"the code demonstrably reaches this table and reads
it successfully."* **That was wrong, and the reasoning was backwards.**

1. The scans are attributable to external SQL run through the Supabase MCP during verification
   across quick-520/522/525/527 — including quick-527's own `SELECT count(*)`. They are not app
   reads.
2. More fundamentally, **an app read cannot produce a `seq_scan` at all**.
   `PrismaClientValidationError` is raised client-side before a statement is emitted, so a failing
   read never contacts the database. The statistic could never have measured what quick-527 used it
   to measure.

**What survives from quick-527:** the L1 short-circuit is still a real code-path fact — on a warm
L1, `getDistanceMatrix` returns at
[optimisation-matrix.ts:263](../../../apps/web/src/lib/document-import/optimisation-matrix.ts#L263)
and the persist gate at `:308` is not reached. And the permissions finding stands (`postgres` has
INSERT; the `app_user` debt is real but inactive), now doubly moot since no SQL is emitted.

**What does not survive:** the claim that reads work, and the confidence that the L1 short-circuit
was the *only* cause. There are **two independent defects, either sufficient on its own** to keep
the table at zero rows — and this one is the more fundamental, because it breaks reads as well as
writes, on every path, warm L1 or cold.

---

## 1. Does a model exist in `schema.prisma`?

**Yes.** [schema.prisma:2782-2793](../../../apps/web/prisma/schema.prisma#L2782), quoted in full:

```prisma
model RouteMatrixCache {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orgId       String   @map("org_id") @db.Uuid
  facilityKey String   @map("facility_key")
  miles       Json
  minutes     Json
  computedAt  DateTime @default(now()) @map("computed_at") @db.Timestamptz

  @@unique([orgId, facilityKey], map: "route_matrix_cache_org_key_unique")
  @@index([orgId], map: "route_matrix_cache_org_idx")
  @@map("route_matrix_cache")
}
```

---

## 2. Model vs. real table — zero mismatches

| Real table | Prisma field | Mapping | Verdict |
|---|---|---|---|
| `id` (PK) | `id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid` | implicit | ✅ |
| `org_id` | `orgId String @map("org_id") @db.Uuid` | explicit | ✅ |
| `facility_key` | `facilityKey String @map("facility_key")` | explicit | ✅ |
| `miles jsonb` | `miles Json` | implicit | ✅ |
| `minutes jsonb` | `minutes Json` | implicit | ✅ |
| `computed_at` | `computedAt DateTime @default(now()) @map("computed_at") @db.Timestamptz` | explicit | ✅ |
| `UNIQUE (org_id, facility_key)` | `@@unique([orgId, facilityKey], map: "route_matrix_cache_org_key_unique")` | named | ✅ — constraint name verified against `pg_constraint` in quick-527 |
| table name | `@@map("route_matrix_cache")` | explicit | ✅ |

**No mismatches of any kind.** Every snake_case column is correctly `@map`ped, both jsonb columns
are `Json`, the timestamptz carries `@db.Timestamptz`, and both UUID columns carry `@db.Uuid`. The
model is a faithful mirror of the table.

**The schema is not the problem, and neither is the table.** Critically, `PrismaClientValidationError`
could not be caused by a schema/table mismatch anyway: a wrong column name or type produces a
*runtime* error from Postgres (`P2022`, `42703`), not a client-side validation error. The error class
itself rules this category out before the comparison is even run.

---

## 3. Is the generated client current?

**Yes — the client is current, and `prisma generate` has run since the model was introduced.**

| Artifact | Last modified |
|---|---|
| `apps/web/prisma/schema.prisma` | **2026-08-11 13:14:40** |
| `apps/web/src/generated/prisma/index.d.ts` | **2026-08-11 13:17:30** (2 min 50 s later) |
| `apps/web/src/lib/db/extensions/tenant-rls.ts` | **2026-08-03 13:55:09** (8 days *earlier*) |

The generated client post-dates the schema, and commit `17be3b02` (quick-520) contains **both** the
schema edit and the regenerated client in one commit:

```
apps/web/prisma/schema.prisma                  |   43 +
apps/web/src/generated/prisma/index.d.ts       | 1883 +++++++++++++++++---
apps/web/src/generated/prisma/index.js         |   19 +-
apps/web/src/generated/prisma/schema.prisma    |   43 +
```

The generated select type confirms it, at
[index.d.ts:95017](../../../apps/web/src/generated/prisma/index.d.ts#L95017):

```ts
export type RouteMatrixCacheSelect<…> = $Extensions.GetSelect<{
  id?: boolean
  orgId?: boolean
  facilityKey?: boolean
  miles?: boolean
  minutes?: boolean
  computedAt?: boolean
}, ExtArgs["result"]["routeMatrixCache"]>
```

Exactly the six fields, correctly camelCased. The `routeMatrixCache` delegate exists (29
references; 382 references to `RouteMatrixCache` overall).

**The stale artifact is not the client — it is `tenant-rls.ts`**, which predates the model by eight
days and was **not touched by quick-520** (`git show --stat 17be3b02` lists no `tenant-rls` entry;
its last commit is `89b6e79e`, 2026-08-03).

---

## 4. The two calls, and the exact failing argument

### The read — [optimisation-matrix.ts:155-158](../../../apps/web/src/lib/document-import/optimisation-matrix.ts#L155)

```ts
const row = await db.routeMatrixCache.findFirst({
  where: { orgId, facilityKey: key },
  select: { miles: true, minutes: true, computedAt: true },
});
```

`db` is `getTenantPrismaForOrg(orgId, userId)`
([optimisation-service.ts:518](../../../apps/web/src/lib/document-import/optimisation-service.ts#L518))
→ `createTenantClient` → `prisma.$extends(withTenantRLS(tenantId)).$extends(withAuditColumns(...))`
([tenant-client.ts:25-27](../../../apps/web/src/lib/db/tenant-client.ts#L25)).

The extension's exemption check at
[tenant-rls.ts:113](../../../apps/web/src/lib/db/extensions/tenant-rls.ts#L113):

```ts
if (EXEMPT_MODELS.has(model ?? '')) {
  return query(args);
}
```

`EXEMPT_MODELS` ([:71-104](../../../apps/web/src/lib/db/extensions/tenant-rls.ts#L71)) holds 23
entries. **`RouteMatrixCache` is not among them** — `grep -c "RouteMatrixCache"` on that file
returns **0**. So the check falls through to the `findFirst` branch at
[:123-132](../../../apps/web/src/lib/db/extensions/tenant-rls.ts#L123):

```ts
case 'findMany':
case 'findFirst':
…
  a.where = a.where
    ? { AND: [{ tenantId }, a.where] }
    : { tenantId };
  break;
```

The argument actually sent to Prisma therefore becomes:

```ts
where: { AND: [ { tenantId: "<uuid>" }, { orgId, facilityKey } ] }
```

**The failing argument is `tenantId`** — an unknown argument on a model whose fields are
`id | orgId | facilityKey | miles | minutes | computedAt`. Prisma validates arguments against the
generated types before building SQL, so it throws `PrismaClientValidationError` at that point. This
is precisely consistent with the observed log: client-side, no SQL, and caught by the store's own
`try/catch` at [:165-168](../../../apps/web/src/lib/document-import/optimisation-matrix.ts#L165),
which logs `matrix cache read failed` and returns `null` — an indistinguishable cache miss.

**Nothing in the call itself is wrong.** `orgId`, `facilityKey` and all three `select` keys match
the generated type exactly.

### The write — [optimisation-matrix.ts:172-187](../../../apps/web/src/lib/document-import/optimisation-matrix.ts#L172)

```ts
await db.routeMatrixCache.upsert({
  where: { orgId_facilityKey: { orgId, facilityKey: key } },
  create: {
    orgId,
    facilityKey: key,
    miles: row.miles,
    minutes: row.minutes,
  },
  update: {
    miles: row.miles,
    minutes: row.minutes,
    computedAt: new Date(),
  },
});
```

Same client, same missing exemption, but the `upsert` branch at
[tenant-rls.ts:180-183](../../../apps/web/src/lib/db/extensions/tenant-rls.ts#L180) injects in
**two** places:

```ts
case 'upsert':
  a.where = { ...a.where, tenantId };
  a.create = { ...a.create, tenantId };
  break;
```

- `where` becomes `{ orgId_facilityKey: {…}, tenantId }` — `tenantId` is not a member of
  `RouteMatrixCacheWhereUniqueInput`, and a unique-where accepts only unique fields.
- `create` becomes `{ orgId, facilityKey, miles, minutes, tenantId }` — `tenantId` is not a member
  of `RouteMatrixCacheCreateInput`.

**Either violation is independently fatal.** As with the read, the call as written is correct.

---

## 5. Would the write throw the same error? — **Yes**

Unambiguously, and for a strictly worse reason than the read.

- Same client (`db`), same extension, same missing exemption — nothing about the write path
  bypasses `withTenantRLS`.
- The read is corrupted in one place (`where`); the write is corrupted in **two** (`where` and
  `create`).
- Validation is argument-shape checking against generated types, which happens on every operation
  regardless of verb.

It would be caught by the write's own `try/catch` at
[:188-190](../../../apps/web/src/lib/document-import/optimisation-matrix.ts#L188) and logged as
`matrix cache write failed` — the sibling of the observed message.

**That log line is the outstanding discriminator from quick-527.** That task could not determine
whether the write had ever been *attempted*, and named exactly this grep as the test. The absence of
`matrix cache write failed` from the captured log — while `matrix cache read failed` is present —
is consistent with the write never having been reached, i.e. quick-527's L1 short-circuit holding.
But the sample is one log line from one GET, which is **not sufficient evidence** to close that
question; a longer capture spanning an actual apply POST would settle it. **Stated as open rather
than resolved.**

The practical point is that it no longer matters for the outcome: **whether or not the write is
reached, it cannot succeed.** Fixing the L1 ordering alone would convert "never attempted" into
"attempted and throws".

---

## 6. Other call sites that would fail the same way

**For this model: exactly two, and both are the ones above.** `grep -rn "routeMatrixCache"` across
`apps/web/src`, `packages` and `apps/mobile` (excluding generated Prisma) returns two hits — the
`findFirst` at `:155` and the `upsert` at `:172`. There is no third consumer, and no mobile or
package-level access.

Scope of the defect for this model: **any** operation through a tenant client fails. A call through
the bare `prisma` client would *not* — the extension is applied only by `createTenantClient`, so
the same statement succeeds or fails purely according to which client issues it.

### Adjacent finding — six other models share the omission

Parsing `schema.prisma` for models with **no `tenantId` field** and cross-checking against the 23
parsed `EXEMPT_MODELS` entries yields seven, of which `RouteMatrixCache` is one:

| Model | Has `orgId`? | Risk |
|---|---|---|
| **RouteMatrixCache** | yes | **Confirmed broken** — this report |
| `Plan` | no | Latent |
| `Promo` | no | Latent |
| `NotificationTemplate` | no | Latent |
| `NotificationEmailConfig` | no | Latent |
| `GridPreference` | no | Latent |
| `GridView` | no | Latent |

The other six are the globally-scoped tables recorded as the Section 4.12 allowlist, so having no
tenant column is correct for them — but that is exactly the condition that makes the injection
throw. **They fail identically *if and only if* they are queried through a tenant client.**

A spot check of call sites is inconclusive and is reported as such rather than resolved:

| Model | Call sites | Spot check |
|---|---|---|
| `NotificationTemplate` | 17 | `(admin)/actions/notifications.ts` has 0 `getTenantPrisma` refs; **`(owner)/actions/tenant-notification-settings.ts` has 10** — worth checking directly |
| `GridView` | 10 | Both API routes checked have 0 `getTenantPrisma` refs |
| `Plan` | 5 | Both files checked have 0 `getTenantPrisma` refs |
| `Promo` / `NotificationEmailConfig` / `GridPreference` | 3 / 4 / 2 | Not checked |

**I did not verify which client each call site actually uses**, and a file containing
`getTenantPrisma` does not prove the call in question uses it. `tenant-notification-settings.ts` is
the one worth opening. Flagged as unverified rather than asserted either way — and outside this
report's question, which asked about `route_matrix_cache`.

---

## Ambiguity stated explicitly

1. **Whether the write has ever been attempted remains open** (see Q5). One log line from one GET
   cannot settle it, and the two candidate causes — quick-527's L1 short-circuit versus simply not
   having captured an apply POST — are not distinguishable from the evidence available.
2. **Whether the six adjacent models are live defects or merely latent is unverified** (see Q6).
   Call-site counts are not client-type evidence.
3. **I did not reproduce the error**, since running the code would require a dev server, which the
   constraints forbid. The diagnosis rests on reading the extension against the generated types.
   The chain is short and each link is quoted, but it is a code-reading argument rather than an
   observed stack trace. The error class, the model's absence from `EXEMPT_MODELS`, and the
   documented precedent for the identical bug in the same file agree, which is why confidence is
   high — but it is stated as inference, not observation.

---

## Per-item audit

| # | Question | Verdict | Notes |
|---|---|---|---|
| 1 | Does a model exist in `schema.prisma`? | **ANSWERED** | Yes — `schema.prisma:2782-2793`, quoted in full. |
| 2 | Compare every field, type, attribute against the real table | **ANSWERED** | All 8 elements compared (6 fields + unique + table map). **Zero mismatches.** Also noted that the error class rules out this category *a priori* — a schema/table mismatch produces a Postgres runtime error, not a client-side validation error. |
| 3 | Is the generated client current? | **ANSWERED** | **Yes.** Client mtime is 2 min 50 s *after* the schema; commit `17be3b02` carries both; the generated `RouteMatrixCacheSelect` lists exactly the six fields. `prisma generate` has run. The stale artifact is `tenant-rls.ts` (8 days older, untouched by quick-520). |
| 4 | Quote both calls; state precisely which argument fails | **ANSWERED** | Both quoted. Failing argument is **`tenantId`**, injected by `withTenantRLS` — into `where` on the read (`tenant-rls.ts:129-131`) and into **both `where` and `create`** on the write (`:180-183`), because `RouteMatrixCache` is absent from `EXEMPT_MODELS` (grep count 0 of 23 entries). Neither call site is itself wrong. |
| 5 | Would the write throw the same error? | **ANSWERED** | **Yes** — same client, same missing exemption, and corrupted in two places rather than one. Also identified that this makes quick-527's open "was the write ever attempted" question moot for the outcome, while explicitly leaving that question itself open on insufficient evidence. |
| 6 | Other call sites that would fail the same way? | **ANSWERED** | For this model: **exactly the two**, grep-verified; no third consumer anywhere. Any tenant-client call fails; a bare-`prisma` call would not. **Bonus:** six other models share the missing exemption and would fail identically if queried through a tenant client — reported with call-site counts and an explicit statement that reachability was **not verified**, with `tenant-notification-settings.ts` named as the one worth opening. |

**Constraint compliance:** zero source files modified · zero DDL · zero database writes · zero
database reads · dev server not started · no fix proposed or applied.

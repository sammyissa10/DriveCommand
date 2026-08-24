# quick-527 — Why does `route_matrix_cache` never receive an L2 row?

**Type:** READ-ONLY diagnostic. No code modified, no DDL, no database writes. Read-only `SELECT`s
were run against production (permitted: the constraint forbids writes and DDL, not reads).
**Date:** 2026-08-24
**Trigger:** Phase 7 template optimisation verified working end to end in the browser on
MKE-NORTH-2 (`878ba6b5-ce7c-4c00-af46-2e094ba1f672`) — suggestion surfaced, apply rewrote
`sequence_order` — yet `route_matrix_cache` stayed at 0 rows throughout.

---

## Headline

**The L1 cache short-circuits `getDistanceMatrix` before the L2 write can ever be reached on the
apply path.**

`getDistanceMatrix` returns at [optimisation-matrix.ts:263](../../../apps/web/src/lib/document-import/optimisation-matrix.ts#L263)
on an L1 hit. The `persist: true` gate that writes L2 sits 45 lines further down, at
[:308](../../../apps/web/src/lib/document-import/optimisation-matrix.ts#L308). Everything between
them — the provider call, the L1 write, the L2 write — is dead code on any call that hits L1.

The ordering is not a race, it is guaranteed by the UI contract:

1. The card must be **rendered** before it can be **tapped**. Rendering it is a `GET`, which runs
   with `persist: false`, computes the matrix, and populates L1 at
   [:306](../../../apps/web/src/lib/document-import/optimisation-matrix.ts#L306) — while being
   *forbidden* from writing L2.
2. The tap is a `POST` with `persist: true`, same process, same facility set, therefore the same
   key — which **hits L1 and returns at :263**, never reaching :308.

So the GET populates L1 but may not write L2; the POST may write L2 but cannot get past L1. Each
half is individually correct and the pair is unsatisfiable. **`persist: true` is threaded
faultlessly all the way down and then never consulted.**

**This is not the tracked RLS/grant debt.** That item is real but inactive: the app connects as
`postgres`, which has `INSERT` on the table, and RLS is disabled. Verified live — see Q5.

---

## 1. The L2 write, traced with every step quoted

| # | Location | Code |
|---|---|---|
| 1 | [optimisation-service.ts:513](../../../apps/web/src/lib/document-import/optimisation-service.ts#L513) | `export async function applyTemplateOptimisation(orgId, userId, templateId)` |
| 2 | [:521](../../../apps/web/src/lib/document-import/optimisation-service.ts#L521) | `const view = await getTemplateOptimisation(orgId, userId, templateId, { persist: true });` |
| 3 | [:392](../../../apps/web/src/lib/document-import/optimisation-service.ts#L392) / [:397](../../../apps/web/src/lib/document-import/optimisation-service.ts#L397) | `export async function getTemplateOptimisation(` … `options?: { persist?: boolean },` |
| 4 | [:482](../../../apps/web/src/lib/document-import/optimisation-service.ts#L482) | `const points = await pointsFor(db, orgId, facilityIds);` |
| 5 | [:484-488](../../../apps/web/src/lib/document-import/optimisation-service.ts#L484) | `? await getDistanceMatrix(points, {`<br>`    orgId,`<br>`    store: prismaMatrixStore(db),`<br>`    persist: options?.persist === true,`<br>`  })` |
| 6 | [optimisation-matrix.ts:241](../../../apps/web/src/lib/document-import/optimisation-matrix.ts#L241) | `export async function getDistanceMatrix(points, options?)` |
| 7 | [:259](../../../apps/web/src/lib/document-import/optimisation-matrix.ts#L259) | `const key = matrixCacheKey(ids);` |
| **8** | **[:262-263](../../../apps/web/src/lib/document-import/optimisation-matrix.ts#L262)** | **`const cached = readCache(key, now);`**<br>**`if (cached) return cached;`**  ← **execution stops here on the apply path** |
| 9 | [:268-296](../../../apps/web/src/lib/document-import/optimisation-matrix.ts#L268) | `if (store && orgId) { … row = await store.read(orgId, key); … }` — the L2 **read** |
| 10 | [:299](../../../apps/web/src/lib/document-import/optimisation-matrix.ts#L299) | `const result = await getOSRMMatrix(ordered.map(…));` |
| 11 | [:306](../../../apps/web/src/lib/document-import/optimisation-matrix.ts#L306) | `writeCache(key, matrix, now);` — L1, unconditionally |
| 12 | [:308-314](../../../apps/web/src/lib/document-import/optimisation-matrix.ts#L308) | `if (options?.persist === true && store && orgId) {`<br>`  try { await store.write(orgId, key, { miles: matrix.miles, minutes: matrix.minutes }); }`<br>`  catch (error) { logger.warn('[document-import] matrix cache write failed', { error }); }`<br>`}` |
| 13 | [:170-191](../../../apps/web/src/lib/document-import/optimisation-matrix.ts#L170) | `async write(orgId, key, row) { try { await db.routeMatrixCache.upsert({ … }) } catch … }` |
| 14 | [:172](../../../apps/web/src/lib/document-import/optimisation-matrix.ts#L172) | `await db.routeMatrixCache.upsert({ where: { orgId_facilityKey: { orgId, facilityKey: key } }, create: {…}, update: {…} })` — the actual database call |

**Steps 1-7 execute. Step 8 returns. Steps 9-14 never run** whenever L1 holds the key, which on
the apply path it always does.

`db.routeMatrixCache.upsert` at step 14 is the **only** write to this table in the entire
codebase — grep for `routeMatrixCache` across `apps/web/src`, `packages` and `apps/mobile`
(excluding generated Prisma) returns exactly two hits: the `findFirst` at :155 and this `upsert`.

---

## 2. Template vs import apply path — no divergence

The two paths are **identical** in every respect that matters here. Placed side by side:

| | Import | Template |
|---|---|---|
| Apply entry | `applyImportOptimisation` [:324](../../../apps/web/src/lib/document-import/optimisation-service.ts#L324) | `applyTemplateOptimisation` [:513](../../../apps/web/src/lib/document-import/optimisation-service.ts#L513) |
| Passes persist | [:335](../../../apps/web/src/lib/document-import/optimisation-service.ts#L335) `importOptimisationFor(…, { persist: true })` | [:521](../../../apps/web/src/lib/document-import/optimisation-service.ts#L521) `getTemplateOptimisation(…, { persist: true })` |
| Options signature | [:237](../../../apps/web/src/lib/document-import/optimisation-service.ts#L237) `options?: { persist?: boolean }` | [:397](../../../apps/web/src/lib/document-import/optimisation-service.ts#L397) `options?: { persist?: boolean }` |
| `pointsFor` | [:285](../../../apps/web/src/lib/document-import/optimisation-service.ts#L285) | [:482](../../../apps/web/src/lib/document-import/optimisation-service.ts#L482) |
| Matrix call | [:287-291](../../../apps/web/src/lib/document-import/optimisation-service.ts#L287) | [:484-488](../../../apps/web/src/lib/document-import/optimisation-service.ts#L484) |
| Option object | `{ orgId, store: prismaMatrixStore(db), persist: options?.persist === true }` | `{ orgId, store: prismaMatrixStore(db), persist: options?.persist === true }` |

The option objects are **character-for-character identical**. `persist: true` genuinely reaches
`getDistanceMatrix` on both apply paths; nothing drops it, and no branch between the entry point
and the matrix call is conditional on which surface called.

**The divergence is not between the two apply paths — it is between any apply path and the L1
cache state it inherits from its own preceding GET.** Both surfaces have the same defect for the
same reason, and the import path has simply never been exercised hard enough to notice.

---

## 3. Transaction and rollback coupling — none

**The L2 write is not in a transaction, and shares none with the reorder.**

- The `upsert` at [:172](../../../apps/web/src/lib/document-import/optimisation-matrix.ts#L172)
  is a standalone Prisma call on `db` (the tenant client from `getTenantPrismaForOrg`). No
  `$transaction` wraps it, and `getDistanceMatrix` opens none.
- The reorder runs in `saveRouteTemplateCore`, which uses `prisma.$transaction` at
  [route-template-save.ts:346](../../../apps/web/src/lib/carrier/route-template-save.ts#L346) and
  [:369](../../../apps/web/src/lib/carrier/route-template-save.ts#L369) — on a **different
  client** (`prisma`, imported at :30 and commented *"kept for $transaction"*), not `db`.
- **Ordering:** the matrix call happens inside `getTemplateOptimisation`, invoked at
  [:521](../../../apps/web/src/lib/document-import/optimisation-service.ts#L521), which is
  **before** `saveRouteTemplateCore` is called further down `applyTemplateOptimisation`. The
  cache write would complete and commit on its own well before the reorder transaction opens.

**So a cache-write failure could not roll back the reorder, and a reorder rollback could not undo
a cache write.** They are independent.

Consequence for the diagnosis, stated because the question invited an inference the evidence does
not support: **the fact that the reorder persisted constrains nothing about the cache write.**
The two are uncoupled, so "the reorder committed" is equally consistent with the cache write
succeeding, failing, or — as is actually the case — never being attempted. That line of reasoning
is a dead end and is closed here rather than left open.

---

## 4. Every swallow point on the write path

The write is **double-swallowed**, at two independent layers:

| Layer | Location | Handling |
|---|---|---|
| Inner — the store | [:171-190](../../../apps/web/src/lib/document-import/optimisation-matrix.ts#L171) | `try { await db.routeMatrixCache.upsert(…) } catch (error) { logger.warn('[document-import] matrix cache write failed', { error }); }` — returns `void`, no rethrow, no return value |
| Outer — the caller | [:309-313](../../../apps/web/src/lib/document-import/optimisation-matrix.ts#L309) | `try { await store.write(…) } catch (error) { logger.warn('[document-import] matrix cache write failed', { error }); }` |

The read path is guarded the same way, twice: inner
[:165-168](../../../apps/web/src/lib/document-import/optimisation-matrix.ts#L165) (returns `null`)
and outer [:274-278](../../../apps/web/src/lib/document-import/optimisation-matrix.ts#L274).

The outer guard is deliberate and documented at
[:269-272](../../../apps/web/src/lib/document-import/optimisation-matrix.ts#L269) — the seam is an
interface, so "degrade, never throw" must hold for the caller rather than depending on one
implementation remembering to be polite. That reasoning is sound; the cost is the visibility
described next.

**Would a failed insert surface anywhere?**

- **Thrown:** no. Both layers catch and neither rethrows.
- **Returned to the client:** no. `write` returns `void`; `getDistanceMatrix` returns the matrix
  regardless; `applyTemplateOptimisation` returns `{ applied, savedMiles, savedMinutes }` with no
  cache field. The HTTP response is byte-identical whether the cache write succeeded, failed, or
  never ran.
- **Logged:** yes, and **only** here — a single `logger.warn('[document-import] matrix cache write
  failed')`. Nothing else distinguishes the three outcomes.

**And in the present case not even the warn fires**, because the write is never attempted. That is
the practical sting: the one observable that would have distinguished "failed" from "never tried"
is absent in both cases, which is why this cost a session rather than a glance — the same triple
invisibility quick-522 recorded for the null-coordinate path.

---

## 5. The database role, and whether it may INSERT

**The app connects as `postgres`, and `postgres` has INSERT on `route_matrix_cache`. Permissions
are not the cause.**

Resolved role, from `apps/web/.env.local` (credentials redacted):

```
DATABASE_URL="postgresql://postgres.oqdhberkghtnszrkdvfm:***@aws-1-us-west-1.pooler.supabase.com:5432/postgres"
DIRECT_URL="postgresql://postgres:***@db.oqdhberkghtnszrkdvfm.supabase.co:5432/postgres"
```

The pooler username form `postgres.<project-ref>` resolves to the role `postgres`. There is **no
commented-out `app_user` `DATABASE_URL`** in the file — the Phase 2 cutover has not happened here.

Verified live against production:

| Check | Result |
|---|---|
| `current_user` / `session_user` | `postgres` / `postgres` |
| `usesuper` | `false` (privileges are explicit, not superuser-implicit) |
| `has_table_privilege('postgres','route_matrix_cache','INSERT')` | **`true`** |
| … `'SELECT'` | `true` |
| … `'UPDATE'` | `true` |
| `has_table_privilege('app_user','route_matrix_cache','INSERT')` | **`false`** |
| `pg_class.relrowsecurity` | **`false`** (RLS disabled) |

So the tracked debt is **confirmed real and confirmed inactive**: `app_user` genuinely cannot
insert, and the day `DATABASE_URL` flips to that role this table will silently stop caching
exactly as the debt item predicts. But that day has not arrived, and it is **not** what is
happening now. Both halves worth recording — the debt should not be closed on the strength of
this diagnosis, and it should not be blamed for it either.

The `upsert`'s target is also structurally sound: the unique constraint the compound input
`orgId_facilityKey` refers to exists as
`route_matrix_cache_org_key_unique UNIQUE (org_id, facility_key)`, and `computed_at` carries
`@default(now())` in the Prisma model, so the `create` branch omitting it is correct rather than a
latent not-null violation. Nothing about the statement would have failed had it run.

---

## 6. Key computation, and whether any insert was ever attempted

**The write and the read cannot use different keys — they use the same variable.**

`key` is computed **once**, at
[:259](../../../apps/web/src/lib/document-import/optimisation-matrix.ts#L259):

```ts
const key = matrixCacheKey(ids);
```

and that same binding is passed to the L1 read (:262), the L1 write (:306), the L2 read
(:275 — `store.read(orgId, key)`) and the L2 write (:310 — `store.write(orgId, key, …)`).
`matrixCacheKey` ([:83-85](../../../apps/web/src/lib/document-import/optimisation-matrix.ts#L83))
is called nowhere else on this path. **Divergence is impossible by construction**, so the
"landing under a key the read never checks" hypothesis is ruled out structurally, not just
empirically.

**Has any insert ever been attempted?** Read from `pg_stat_user_tables` on production:

| Statistic | Value | What it establishes |
|---|---|---|
| `count(*)` | **0** | The table is empty, as reported |
| `n_tup_ins` | **0** | No tuple has ever been successfully inserted |
| `n_tup_upd` | 0 | The `upsert`'s update branch has never fired either |
| `n_tup_del` | 0 | Rows were not written and later removed |
| **`seq_scan`** | **12** | **The table has been READ 12 times** |

The last row is the load-bearing one. **The code demonstrably reaches this table and reads it
successfully** — twelve sequential scans is the L2 read at
[:275](../../../apps/web/src/lib/document-import/optimisation-matrix.ts#L275) executing and
missing. So the store is wired, the connection works, the Prisma model maps correctly, and the
role can read. Reads happen; writes never do.

That asymmetry is exactly what the L1 short-circuit predicts: an L1 **miss** proceeds to the L2
read (incrementing `seq_scan`) and then to the provider, while an L1 **hit** returns before
either — and the apply path is always an L1 hit.

---

## Residual uncertainty, stated rather than papered over

Twelve `seq_scan`s mean twelve calls got past the L1 early-return and reached the L2 read. If
**any** of those twelve had been a `persist: true` call, it would have continued to :308 and
attempted a write, and `n_tup_ins` would be non-zero. It is zero. Two readings survive:

- **(a)** No apply `POST` has ever run with a cold L1 — consistent with the structural argument,
  since an apply always follows its own GET in the same process, and the L1 TTL is 24 hours
  (`MATRIX_CACHE_TTL_MS`, `optimisation-constants.ts:126`).
- **(b)** One did, and the write failed silently for a reason other than permissions.

**I cannot distinguish these from table statistics alone**, and I did not have server logs
available. Reading (a) is strongly favoured — it follows from the code structure without needing
an unexplained failure, and permissions, the unique constraint and the `computed_at` default are
all now positively ruled out as failure modes for (b). But the discriminator is cheap and exact:
**grep the dev server output for `matrix cache write failed`.** Any occurrence proves (b) and
means a second, independent cause is in play; silence confirms (a).

One further ambiguity worth naming: in local development Turbopack HMR resets module state on
recompile, which clears the L1 `Map` (module-scoped, declared at
[:80](../../../apps/web/src/lib/document-import/optimisation-matrix.ts#L80)). That makes cold-L1
GETs frequent during a working session and plausibly accounts for twelve scans across three OSRM
computations — but it also means **local timing is not representative of production**, where a
long-lived process would keep L1 warm far longer and make the L2 write correspondingly rarer.

---

## Per-item audit

| # | Question | Verdict | Notes |
|---|---|---|---|
| 1 | Trace the L2 write from `applyTemplateOptimisation` to the database call, quoting every step | **ANSWERED** | 14 steps quoted with file:line, from `:513` through `db.routeMatrixCache.upsert` at `optimisation-matrix.ts:172`. Steps 9-14 shown to be unreachable on the apply path. Confirmed the `upsert` is the only write site in the codebase. |
| 2 | Is `persist: true` reached, or does the template path diverge from the import path? | **ANSWERED** | `persist: true` **is** reached — threaded correctly through `:521 → :397 → :487`. The two paths are character-for-character identical at the matrix call (`:287-291` vs `:484-488`). **No divergence between them**; the defect is shared, and the real divergence is between any apply path and its own preceding GET's L1 state. |
| 3 | Transaction/rollback coupling with the reorder | **ANSWERED** | **None.** The `upsert` is standalone on `db`; the reorder uses `prisma.$transaction` on a different client (`route-template-save.ts:346`, `:369`) and runs *after*. A cache failure cannot roll back the reorder. Explicitly noted that the reorder having persisted therefore constrains nothing — the inference the question offered is closed as a dead end. |
| 4 | Is failure swallowed? Every try/catch, and would it surface? | **ANSWERED** | Double-swallowed: inner `:171-190`, outer `:309-313` (read likewise at `:165-168` / `:274-278`). Never thrown, never returned to the client, HTTP response byte-identical. Surfaces **only** as `logger.warn('[document-import] matrix cache write failed')` — and not even that here, since no write is attempted. |
| 5 | Resolved database role, and does the table grant it INSERT? | **ANSWERED** | Role is **`postgres`** (pooler form `postgres.<ref>`; no `app_user` URL present). Verified live: `INSERT`/`SELECT`/`UPDATE` all `true`, RLS `false`. `app_user` INSERT is `false`, so the tracked debt is **real but inactive** — recorded both ways so it is neither closed nor blamed. Unique constraint and `computed_at` default also verified sound. |
| 6 | Same `facility_key` on write and read? Has any insert been attempted? | **ANSWERED** | **Identical by construction** — one `key` binding computed at `:259` and reused by all four cache operations; `matrixCacheKey` is called nowhere else on the path, so divergence is structurally impossible. **No insert has ever succeeded** (`n_tup_ins`/`n_tup_upd`/`n_tup_del` all 0), while **`seq_scan = 12` proves the table is read successfully** — the asymmetry the L1 short-circuit predicts. Whether an attempt was ever *made* is bounded to two readings in the section above, with the exact log-grep that settles it. |

**Constraint compliance:** zero source files modified · zero DDL · zero database writes · dev
server not started · no fix proposed or applied. Read-only `SELECT`s were used for Q5 and Q6, which
the constraints permit (they forbid writes and DDL, not reads).

# quick-620 — steps 1–3, measured before any edit

## Step 1 — the 14 statements against current code

All 14 `file:line` pairs are identical to quick-616's census (`01-census.json`, committed `e4319c81`
2026-09-15). The last commit touching each file predates the census:

| file | last commit |
|---|---|
| `api/v1/carrier/stops/[id]/messages/route.ts` | `46484486` 2026-09-03 quick-587 |
| `api/v1/messages/broadcast/route.ts` | `e97eb7e1` 2026-04-20 quick-263 |
| `api/v1/messages/conversations/route.ts` | `00c3c456` 2026-05-24 quick-403 |
| `api/v1/messages/send/route.ts` | `5d941536` 2026-04-23 quick-283 |
| `api/v1/messages/thread/route.ts` | `5d941536` 2026-04-23 quick-283 |
| `api/v1/messages/[id]/audio-url/route.ts` | `5d941536` 2026-04-23 quick-283 |

**Nothing moved.** Repo-wide remainder measured by the same AST walker (`01-repo-remainder-before.txt`):
**59 statements in 31 files**, API_V1 **6 files / 14 statements** — reconciles with quick-619's close.

## Step 2 — tenant source per statement

| file | line | handler | model · operation | tenant source |
|---|---:|---|---|---|
| stops/[id]/messages | 49 | GET | `FleetMessage.findMany` `{tenantId, stopId}` | session |
| stops/[id]/messages | 76 | GET | `FleetMessage.updateMany` `{id in unreadIds}` | session |
| stops/[id]/messages | 89 | GET | `User.findMany` `{id in, tenantId}` | session |
| stops/[id]/messages | 201 | POST | `FleetMessage.create` `data.tenantId` | session |
| broadcast | 54 | POST | `FleetMessage.create` `data.tenantId` | session |
| conversations | 38 | GET | `FleetMessage.findMany` `{tenantId, OR…}` | session |
| conversations | 74 | GET | `User.findMany` `{id in, tenantId}` | session |
| conversations | 94 | GET | `Trip.findMany` `{id in, orgId: tenantId}` | session |
| send | 64 | POST | `User.findFirst` `{id, tenantId}` | session |
| send | 76 | POST | `FleetMessage.create` `data.tenantId` | session |
| thread | 79 | GET | `FleetMessage.findMany` `whereClause` (every branch carries `tenantId`) | session |
| thread | 105 | GET | `FleetMessage.updateMany` `{id in unreadIds}` | session |
| thread | 118 | GET | `User.findMany` `{id in, tenantId}` | session |
| audio-url | 36 | GET | `FleetMessage.findFirst` `{id, tenantId}` | session |

**Distribution: session 14 · function parameter 0 · job payload 0 · nowhere 0.**

Every handler is a cookie-session web route: `const { tenantId } = session` from `getSession()`, which
reads `app_metadata.tenantId` (`lib/auth/supabase.ts:55`). Nothing needs a tenant threaded through a
signature. One edge, stated and not changed: `getSession` yields `tenantId: ''` when the claim is absent.
Before routing that request already failed (`tenantId: ''` against a `@db.Uuid` column); after routing it
fails the same way or raises TC001. No new failure mode for a valid session.

### Live policies — read from BOTH databases, byte-identical

| table | policies |
|---|---|
| `FleetMessage` | `bypass_rls_policy` · `tenant_isolation_policy` `USING/CHECK ("tenantId" = current_tenant_id())` |
| `User` | `bypass_rls_policy` · `tenant_isolation_policy` `USING/CHECK ("tenantId" = current_tenant_id())` |
| `dispatches` (`Trip`) | `bypass_rls_policy` · `tenant_isolation_policy` `USING/CHECK (org_id = current_tenant_id())` |

### Census correction — line 89 is NOT BROKEN_POLICY

quick-616 classified `stops/[id]/messages/route.ts:89` BROKEN_POLICY with the reason *"Design §3.1 item 6 —
`stops`, zero policies on production"*. The statement at line 89 guards **`tx.user.findMany`**, not a
`stops` query — no statement in that file's bypass transactions touches `stops`. `User` carries an ordinary
`tenant_isolation_policy` on both databases. The override in `616-census-classification.ts:182` names the
wrong table; it is reclassified **TENANT_KNOWN_UNSCOPED by measurement** and routed. Likewise the three
DECORATIVE rows (49/76/201) relied on "a `getTenantPrisma()` earlier in the request left the GUC set on the
pool" — pool inheritance quick-610 showed is latent, not safe — and "delete the flag only" would put
`FleetMessage.create` on a `getTenantPrisma()` client that forwards `userId` into the audit-columns
extension (`FleetMessage.createdById` exists). They are routed with the standard pattern instead.

### What the extension newly applies — checked per statement, before routing

`withTenantRLS` wraps `findMany`/`findFirst`/`updateMany` as `AND: [{ tenantId }, where]` and spreads
`tenantId` into `create.data`. `Trip` is EXEMPT (no injection; the explicit `orgId` predicate plus the
`dispatches` policy are the isolation).

- 10 statements already carry `tenantId` (or `orgId`) themselves — the injection is redundant.
- The two `updateMany({ id: { in: unreadIds } })` statements do not; their ids come from the
  immediately preceding `tenantId`-filtered read in the same handler, so the added predicate cannot hide a
  row the handler would otherwise have updated.
- `FleetMessage.tenantId` and `User.tenantId` are **NOT NULL** — no platform-global row exists to hide.

## Step 3 — findUnique / findUniqueOrThrow

`grep -c findUnique` over the 6 files: **0, 0, 0, 0, 0, 0.** None of the routed statements reaches
quick-618's fix, so nothing here depends on it. Shapes quick-618 did not test that this task makes live:
`updateMany` with `id: { in }` and `create` injection on `FleetMessage` — neither is a findUnique path;
both are exercised by real-row cells in step 6.

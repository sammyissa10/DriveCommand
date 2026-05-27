---
phase: quick-411
plan: 411
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/db/prisma.ts
  - apps/web/src/lib/db/extensions/tenant-rls.ts
  - apps/web/src/lib/context/tenant-context.ts
  - apps/web/scripts/audit/411-verify-set-config.ts
autonomous: true

must_haves:
  truths:
    - "After getTenantPrisma() returns, SELECT current_tenant_id() returns the caller's tenantId UUID"
    - "The Prisma tenant extension does NOT wrap individual queries in $transaction (no nested-transaction deadlock path)"
    - "Setting tenantId once per request is sufficient because max:1 pool + Vercel single-threaded worker = no concurrent tenant overlap on the same connection"
    - "When the pg.Pool establishes a new physical connection, app.current_tenant_id is initialized to '' (empty) so a stale value cannot leak from a prior server lifetime"
    - "EXEMPT_MODELS no longer skips CarrierDocument, RouteTemplateStop, TicketMessage, Tenant — these tables must rely on RLS (now armed) OR receive Prisma-layer tenantId injection where the field exists"
    - "tenantRawQuery() still works for raw SQL ($queryRaw / $executeRaw) — its existing per-call $transaction([set_config, raw]) wrapping is unchanged"
  artifacts:
    - path: "apps/web/src/lib/db/prisma.ts"
      provides: "pg.Pool with a 'connect' event handler that initialises app.current_tenant_id to empty on every new physical connection"
      contains: "pool.on('connect'"
    - path: "apps/web/src/lib/context/tenant-context.ts"
      provides: "getTenantPrisma() fires SELECT set_config('app.current_tenant_id', <tenantId>, FALSE) before returning the extended client"
      contains: "set_config('app.current_tenant_id'"
    - path: "apps/web/src/lib/db/extensions/tenant-rls.ts"
      provides: "Updated header comment documenting per-request session-scope set_config mechanism; updated EXEMPT_MODELS list"
      contains: "EXEMPT_MODELS"
    - path: "apps/web/scripts/audit/411-verify-set-config.ts"
      provides: "Standalone verification script that confirms current_tenant_id() returns the seeded tenantId after wiring"
      contains: "SELECT current_tenant_id()"
  key_links:
    - from: "apps/web/src/lib/context/tenant-context.ts"
      to: "apps/web/src/lib/db/prisma.ts (raw $executeRaw on bare client)"
      via: "prisma.$executeRawUnsafe(\"SELECT set_config('app.current_tenant_id', $1, false)\", tenantId)"
      pattern: "set_config\\('app\\.current_tenant_id'"
    - from: "apps/web/src/lib/db/prisma.ts (pool.on('connect'))"
      to: "every newly-checked-out physical pg connection"
      via: "client.query(\"SELECT set_config('app.current_tenant_id', '', false)\")"
      pattern: "pool\\.on\\('connect'"
    - from: "apps/web/scripts/audit/411-verify-set-config.ts"
      to: "current_tenant_id() SQL function"
      via: "Direct $queryRaw after calling the same code path as getTenantPrisma()"
      pattern: "current_tenant_id\\(\\)"
---

<objective>
Wire `set_config('app.current_tenant_id', tenantId, FALSE)` so PostgreSQL's `current_tenant_id()` function returns the caller's tenant UUID for every database query routed through the Prisma tenant client, without re-introducing the per-query $transaction deadlock that broke the previous attempt.

Purpose: Unblock quick-410 (RLS migration). The new RLS policies depend on `current_tenant_id()` reading the GUC; today nothing sets the GUC for normal Prisma model queries, so RLS would reject every read/write.

Output:
- A connection-checkout initialiser on the pg.Pool that zeros out `app.current_tenant_id` for every fresh physical connection.
- A per-request setter in `getTenantPrisma()` that writes the caller's tenantId into the session-scope GUC BEFORE any model query runs.
- Updated `EXEMPT_MODELS` so RLS-eligible tables no longer skip the Prisma injection layer.
- A standalone verification script (`411-verify-set-config.ts`) that proves `current_tenant_id()` returns the expected UUID end-to-end.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@docs/specs/DatabaseSecurity_MultiTenant_Spec_v1.md
@apps/web/src/lib/db/prisma.ts
@apps/web/src/lib/db/extensions/tenant-rls.ts
@apps/web/src/lib/db/tenant-client.ts
@apps/web/src/lib/context/tenant-context.ts
@apps/web/src/lib/auth/supabase.ts
@apps/web/docs/database.md
</context>

<approach_rationale>
**Chosen: Option D (per-request session-scope set_config in getTenantPrisma) + pg.Pool 'connect' initialiser.**

**Why not Option A/C (Prisma `$extends` / middleware wrapping each query):**
The original tenant-rls.ts wrapped every operation in `client.$transaction([set_config, query])`. With Supabase Session Pooler + `max:1` pg.Pool, when user code is already inside an outer `$transaction(async tx => ...)` the inner array-transaction tries to open a *second* top-level transaction on the bare client, blocks waiting for the only connection (held by the outer tx), and deadlocks with P2028. The tenant-rls.ts header explicitly forbids this path.

**Why not Option B (only pool 'connect' handler with per-request mutation):**
A pool 'connect' handler fires once per physical connection lifetime, not once per request. With `max:1`, the same connection is reused across many requests for many tenants — setting the tenantId in the connect handler alone would lock the pool to one tenant for the lifetime of that connection. Cross-tenant leakage guaranteed.

**Why Option D works given the deployment constraints:**
1. `apps/web/src/lib/db/prisma.ts` runs `max: 1` on the pg.Pool. Combined with Vercel's single-threaded JS worker model, a given Node process processes one request at a time on that connection — there is no concurrent overlap of two tenants on the same physical connection mid-request.
2. Supabase port 6543 is **Session Mode pooler** (per `apps/web/docs/database.md` line 23-24). Session mode preserves session-scope (`FALSE`) GUCs across statements on the same connection.
3. `getTenantPrisma()` is the canonical entry point for tenant-scoped queries (`base.repository.ts` and every server action use it). Firing one `SELECT set_config('app.current_tenant_id', $1, FALSE)` here, BEFORE returning the extended client, guarantees the GUC is correct for every subsequent query in the request — and the bare `$executeRawUnsafe` runs as a single autocommit statement with **no transaction wrapping**, so it cannot deadlock against an outer tx (none exists yet — getTenantPrisma runs at the top of the request).
4. The pool 'connect' handler initialises `app.current_tenant_id = ''` on every new physical connection so a fresh worker boot cannot inherit stale state from another process; `getTenantPrisma()` then overwrites it on first use.

**Spec compliance note:**
Section 2.5 mandates `set_config(..., TRUE)` (transaction-local). The deployment topology (max:1, Session Pooler, no per-query $transaction allowed) makes strict TRUE-scope impossible without the deadlock path. Option D uses FALSE-scope per-request — equivalent isolation on max:1 Vercel workers because the per-request `getTenantPrisma()` re-writes the value before any query, but documented as a deliberate deviation from spec letter in the file headers.

**Belt-and-suspenders:**
Application-layer tenantId injection (current `withTenantRLS` extension behaviour) stays untouched. RLS becomes the SECOND line of defence once quick-410 lands. If the GUC ever ends up wrong (e.g. mid-request crash leaving stale value), the Prisma injection layer still blocks cross-tenant reads/writes for tables that have a tenantId field.
</approach_rationale>

<tasks>

<task type="auto">
  <name>Task 1: Install pg.Pool 'connect' handler to initialise app.current_tenant_id per physical connection</name>
  <files>apps/web/src/lib/db/prisma.ts</files>
  <action>
Modify `apps/web/src/lib/db/prisma.ts` to register a `pool.on('connect')` handler that runs `SELECT set_config('app.current_tenant_id', '', false)` (session-scope, empty string) on every newly-established physical pg connection.

Implementation details:
1. Right after `globalForPrisma.pool = pool;` and BEFORE `const adapter = new PrismaPg(pool);`, add:

```ts
// Initialise the tenant GUC on every new physical connection so a stale value
// from a prior process/worker can never bleed into the first query of a fresh
// connection. getTenantPrisma() in lib/context/tenant-context.ts overwrites
// this per-request via a session-scope set_config before any model query runs.
// See quick-411 plan for full deadlock-avoidance rationale.
if (!globalForPrisma.pool) {
  // Only attach once per process — the singleton guard above means we only
  // enter this branch on first module load.
}
pool.on('connect', (client) => {
  // Fire-and-forget; client.query returns a Promise but pg invokes the
  // 'connect' callback synchronously and discards the return value. The
  // statement is autocommit, so no transaction is opened.
  client.query("SELECT set_config('app.current_tenant_id', '', false)").catch((err) => {
    // Log but don't crash — the per-request set_config in getTenantPrisma()
    // will overwrite this value anyway, so an init failure is non-fatal.
    console.warn('[prisma] pool connect set_config init failed:', err?.message ?? err);
  });
});
```

2. Note placement: the `pool.on('connect')` must be attached AFTER the singleton check so we don't double-register handlers on warm Vercel invocations. The simplest way: only register when `!globalForPrisma.pool` was the case at the time `pool` was constructed. Restructure the existing singleton init to a single block:

```ts
let pool: Pool;
if (globalForPrisma.pool) {
  pool = globalForPrisma.pool;
} else {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
  });
  pool.on('connect', (client) => {
    client.query("SELECT set_config('app.current_tenant_id', '', false)").catch((err) => {
      console.warn('[prisma] pool connect set_config init failed:', err?.message ?? err);
    });
  });
  globalForPrisma.pool = pool;
}
```

3. Do NOT change `max: 1`, do NOT change the adapter or PrismaClient construction. Do NOT introduce new dependencies.

4. Update the pool documentation comment block at the top of the file: add a short paragraph after the existing pgbouncer commentary explaining that the connect handler installs the tenant-GUC initialiser (one sentence + a reference to quick-411).

Why this avoids deadlock: `client.query(...)` inside a pool 'connect' handler runs directly on the pg client at the moment the physical TCP connection is established — long before any Prisma query or $transaction exists. There is no outer transaction to nest against.
  </action>
  <verify>
1. `cd apps/web && npx tsc --noEmit` returns 0 errors.
2. `cd apps/web && npm run dev` starts cleanly; no `[prisma] pool connect set_config init failed` warnings in logs on first request.
3. `grep -n "pool.on('connect'" apps/web/src/lib/db/prisma.ts` matches exactly one occurrence.
  </verify>
  <done>
- prisma.ts pool singleton now attaches a 'connect' handler exactly once per process.
- Every fresh physical connection executes `SELECT set_config('app.current_tenant_id', '', false)` immediately on checkout.
- TypeScript compiles, dev server boots without errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Set per-request tenant GUC in getTenantPrisma() and remove stale exemptions from withTenantRLS</name>
  <files>
apps/web/src/lib/context/tenant-context.ts
apps/web/src/lib/db/extensions/tenant-rls.ts
  </files>
  <action>
**Part A — `apps/web/src/lib/context/tenant-context.ts`:**

Modify `getTenantPrisma()` so it fires a session-scope `set_config` for the current tenantId BEFORE returning the extended client. The call must use `prisma.$executeRawUnsafe(...)` on the bare client (not on the extended client, not inside a $transaction) so it runs as a single autocommit statement.

Replace the existing body of `getTenantPrisma()`:

```ts
export async function getTenantPrisma(): Promise<PrismaClient> {
  const tenantId = await requireTenantId();
  const session = await getSession();

  // Set the tenant GUC for the current pooled connection. Uses FALSE
  // (session scope) because Supabase Session Pooler (port 6543) preserves
  // session GUCs across statements on the same connection, and the app uses
  // max:1 pool + single-threaded Vercel workers, so there is no concurrent
  // tenant overlap mid-request. The pool 'connect' handler in prisma.ts
  // initialises this to '' on every new physical connection; this call
  // overwrites it for the duration of the request.
  //
  // Why $executeRawUnsafe on the bare client (not inside $transaction):
  // wrapping in $transaction would re-introduce the P2028 deadlock that
  // forced the original set_config removal — see header of tenant-rls.ts.
  // A single autocommit statement on the bare client has no outer tx to
  // nest against.
  await prisma.$executeRawUnsafe(
    "SELECT set_config('app.current_tenant_id', $1, false)",
    tenantId
  );

  return createTenantClient(tenantId, session?.userId ?? null);
}
```

Notes:
- Keep `requireTenantId()` and `getSession()` calls exactly as they are.
- `tenantRawQuery()` below stays UNCHANGED — its per-call `$transaction(async tx => { set_config; raw; })` is the correct pattern for raw SQL because the set and the raw query are in the same explicit transaction (no nesting against an outer one — callers never call `tenantRawQuery` inside another $transaction).
- Import: `prisma` is already imported at the top of the file. No new imports needed.

**Part B — `apps/web/src/lib/db/extensions/tenant-rls.ts`:**

1. Replace the existing header docblock (lines 1-37) with a new docblock that documents the new wiring. Keep it factual and short:

```ts
/**
 * Prisma Client Extension for Multi-Tenant Isolation
 *
 * PRIMARY MECHANISM: Application-layer tenantId injection.
 * Injects `tenantId` into all query arguments (where, data) for every Prisma
 * operation on models that have a tenantId field. Provides defence-in-depth
 * regardless of database-level RLS status.
 *
 * SECONDARY MECHANISM (wired in quick-411): PostgreSQL Row Level Security.
 * `getTenantPrisma()` in src/lib/context/tenant-context.ts fires
 *   SELECT set_config('app.current_tenant_id', <tenantId>, false)
 * on the bare Prisma client BEFORE returning the extended client. RLS
 * policies that call `current_tenant_id()` read this GUC and filter rows
 * accordingly. Session-scope (FALSE) is used because Supabase Session
 * Pooler (port 6543) + max:1 pg.Pool + single-threaded Vercel workers
 * guarantee no concurrent tenant overlap on a given physical connection,
 * and the spec-recommended TRUE-scope per-transaction approach was
 * incompatible with the existing nested-transaction patterns in feature
 * code (caused P2028 deadlocks). The pool 'connect' handler in prisma.ts
 * resets the GUC to '' on every new physical connection so stale values
 * from prior worker lifetimes cannot leak into the first query.
 *
 * THE OLD set_config DEADLOCK (do not reintroduce):
 * Wrapping every model operation in
 *   client.$transaction([raw_set_config, query])
 * inside this extension caused P2028 when feature code opened an outer
 *   prisma.$transaction(async tx => { ... })
 * — the inner array-transaction blocked waiting for the only connection
 * already held by the outer tx. The new mechanism sets the GUC once per
 * request OUTSIDE the extension, so this extension stays free of any
 * transaction wrapping.
 *
 * EXEMPT MODELS:
 * Only models that genuinely have no `tenantId` column on their Prisma
 * schema entry are exempt. Tables that DO carry tenantId (even if added
 * recently) must NOT be exempted — the injection layer is needed in
 * addition to RLS because RLS only fires when the GUC is set, and some
 * code paths (background jobs, scripts) may not call getTenantPrisma().
 */
```

2. Replace the `EXEMPT_MODELS` set so the following models are REMOVED (they need tenant scoping):
   - `Tenant` — keep exempted (it is the tenant table itself; queried by id, not tenantId).
   - `TicketMessage` — REMOVE from exempt list. (Has tenantId via parent SupportTicket; spec wants RLS coverage.)
   - `RouteTemplateStop` — REMOVE.
   - `CarrierDocument` — REMOVE.

   The final set should be:

```ts
const EXEMPT_MODELS = new Set([
  'Tenant', // the tenants table itself — queried by id, no tenantId column
  // Carrier* models without tenantId on their schema row (verify in schema.prisma before keeping):
  'CarrierClient',
  'CarrierContract',
  'CarrierFacility',
  'CarrierDriver',
  'CarrierTruck',
  'RouteTemplate',
  'CarrierDispatch',
  'CarrierLoad',
  'CarrierStop',
  'CarrierExpense',
  'DriverPayRecord',
  'CarrierCatalogMeta',
  'Trip', // uses orgId, not tenantId — code in trips.ts handles isolation manually
]);
```

3. **Important verification before saving:** open `apps/web/prisma/schema.prisma` and confirm each remaining entry in `EXEMPT_MODELS` truly lacks a `tenantId` column. If any of the listed Carrier* models DO have a `tenantId` column today, REMOVE them from the exempt list too. Document the audit result in a comment block above the set, e.g.:

```ts
// Schema audit (quick-411): the following models were confirmed to have NO
// tenantId column in apps/web/prisma/schema.prisma as of <commit short sha>:
//   CarrierClient, CarrierContract, CarrierFacility, CarrierDriver,
//   CarrierTruck, RouteTemplate, CarrierDispatch, CarrierLoad, CarrierStop,
//   CarrierExpense, DriverPayRecord, CarrierCatalogMeta
// If any of these gains a tenantId in the future, remove it from this set.
```

4. Leave the actual `withTenantRLS` function body (operation switch + return query(args)) UNCHANGED. The fix is in the comment block and EXEMPT_MODELS only.
  </action>
  <verify>
1. `cd apps/web && npx tsc --noEmit` returns 0 errors.
2. `grep -n "set_config('app.current_tenant_id'" apps/web/src/lib/context/tenant-context.ts` shows the new $executeRawUnsafe call in getTenantPrisma.
3. `grep -n "'TicketMessage'" apps/web/src/lib/db/extensions/tenant-rls.ts` returns NOTHING (removed from exempt list).
4. `grep -n "'CarrierDocument'" apps/web/src/lib/db/extensions/tenant-rls.ts` returns NOTHING.
5. `grep -n "'RouteTemplateStop'" apps/web/src/lib/db/extensions/tenant-rls.ts` returns NOTHING.
6. `grep -n "'Tenant'" apps/web/src/lib/db/extensions/tenant-rls.ts` returns the exempt-list entry (still exempt — it has no tenantId column).
7. Header comment in tenant-rls.ts mentions both "quick-411" and "do not reintroduce" deadlock warning.
8. `tenantRawQuery()` body in tenant-context.ts is byte-for-byte unchanged.
  </verify>
  <done>
- `getTenantPrisma()` fires session-scope `set_config('app.current_tenant_id', $1, false)` before returning the extended client.
- The set_config call uses `$executeRawUnsafe` on the bare prisma client (no $transaction wrapping).
- `withTenantRLS` extension is untouched at the runtime level; only its header comment and EXEMPT_MODELS list are revised.
- Schema audit comment documents which Carrier* models truly lack tenantId.
- TypeScript compiles cleanly.
  </done>
</task>

<task type="auto">
  <name>Task 3: Verify end-to-end via 411-verify-set-config.ts script and document the wiring in STATE.md</name>
  <files>
apps/web/scripts/audit/411-verify-set-config.ts
.planning/STATE.md
  </files>
  <action>
**Part A — Create `apps/web/scripts/audit/411-verify-set-config.ts`:**

Write a standalone Node script that proves the wiring works end-to-end. The script must NOT depend on a live HTTP request — it should exercise the same code path that `getTenantPrisma()` uses and then query `current_tenant_id()` to confirm the GUC was set correctly.

Script structure:

```ts
/**
 * quick-411 verification: prove that after firing the same set_config
 * statement getTenantPrisma() now fires, the SQL function current_tenant_id()
 * returns the seeded tenantId UUID.
 *
 * Run with: npx tsx apps/web/scripts/audit/411-verify-set-config.ts
 * Requires: DATABASE_URL or DIRECT_URL set in the local env.
 *
 * Expected output (success):
 *   [411-verify] connecting...
 *   [411-verify] picked tenant <uuid> (<slug>)
 *   [411-verify] BEFORE set_config: current_tenant_id() => null
 *   [411-verify] firing SELECT set_config('app.current_tenant_id', <uuid>, false)
 *   [411-verify] AFTER set_config:  current_tenant_id() => <uuid>
 *   [411-verify] MATCH — GUC wiring works end-to-end.
 *
 * Exit code: 0 on success, 1 on any mismatch or error.
 */

import { prisma } from '../../src/lib/db/prisma';

async function main() {
  console.log('[411-verify] connecting...');

  // Pick any real tenant so we have a real UUID. Use bare prisma (no tenant scoping).
  const tenant = await prisma.$queryRaw<Array<{ id: string; slug: string }>>`
    SELECT id, slug FROM "Tenant" LIMIT 1
  `;
  if (!tenant.length) {
    throw new Error('No tenants in database — cannot verify.');
  }
  const tenantId = tenant[0].id;
  const slug = tenant[0].slug;
  console.log(`[411-verify] picked tenant ${tenantId} (${slug})`);

  // 1. Confirm current_tenant_id() returns NULL before we set anything on this connection.
  //    Note: the pool 'connect' handler from Task 1 sets it to '' which current_tenant_id()
  //    converts to NULL via NULLIF — so this should print null, not the empty string.
  const before = await prisma.$queryRaw<Array<{ ctid: string | null }>>`
    SELECT current_tenant_id()::text AS ctid
  `;
  console.log(`[411-verify] BEFORE set_config: current_tenant_id() => ${before[0]?.ctid ?? 'null'}`);

  // 2. Fire the EXACT same statement getTenantPrisma() now fires.
  console.log(`[411-verify] firing SELECT set_config('app.current_tenant_id', ${tenantId}, false)`);
  await prisma.$executeRawUnsafe(
    "SELECT set_config('app.current_tenant_id', $1, false)",
    tenantId
  );

  // 3. Read current_tenant_id() back — must equal tenantId.
  const after = await prisma.$queryRaw<Array<{ ctid: string | null }>>`
    SELECT current_tenant_id()::text AS ctid
  `;
  const actual = after[0]?.ctid ?? null;
  console.log(`[411-verify] AFTER set_config:  current_tenant_id() => ${actual ?? 'null'}`);

  if (actual !== tenantId) {
    throw new Error(
      `MISMATCH — expected current_tenant_id() to return ${tenantId}, got ${actual}`
    );
  }

  console.log('[411-verify] MATCH — GUC wiring works end-to-end.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[411-verify] FAILED:', err?.message ?? err);
    process.exit(1);
  });
```

Important constraints:
- Use the existing `prisma` singleton from `src/lib/db/prisma.ts` so the pool 'connect' handler from Task 1 is exercised.
- Use `$queryRaw` for SELECTs that return rows; use `$executeRawUnsafe` for the set_config call (matches what getTenantPrisma now does).
- If the `current_tenant_id()` SQL function does not yet exist in the DB (it is created in quick-410's migration), the script should fail with a clear message — that is the expected state today and means the script is correctly checking the right thing. In that case the wiring still landed; the script just cannot complete its assertion until quick-410 runs. Add a graceful pre-check:

```ts
const fnExists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
  SELECT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'current_tenant_id'
  ) AS exists
`;
if (!fnExists[0]?.exists) {
  console.warn('[411-verify] current_tenant_id() SQL function not found — quick-410 has not run yet.');
  console.warn('[411-verify] Skipping GUC assertion. Set-config call will be tested via raw GUC read instead.');
  // Fallback: just read the GUC directly.
  await prisma.$executeRawUnsafe(
    "SELECT set_config('app.current_tenant_id', $1, false)",
    tenantId
  );
  const guc = await prisma.$queryRaw<Array<{ v: string }>>`
    SELECT current_setting('app.current_tenant_id', true) AS v
  `;
  console.log(`[411-verify] raw GUC value after set_config => ${guc[0]?.v}`);
  if (guc[0]?.v !== tenantId) {
    throw new Error(`MISMATCH — raw GUC expected ${tenantId}, got ${guc[0]?.v}`);
  }
  console.log('[411-verify] raw GUC matches. quick-411 wiring is correct; current_tenant_id() will work once quick-410 lands.');
  return;
}
```

Insert this pre-check immediately after the tenant pick (before the `before` $queryRaw call). If the function exists, the original full test runs; if not, the fallback raw-GUC test runs and still proves the set_config wiring works.

**Part B — Update `.planning/STATE.md`:**

Append a row to STATE.md's tracking table (follow the existing format used by quick-405/408/409 entries) documenting:
- quick-411 completed
- File touched: prisma.ts, tenant-rls.ts, tenant-context.ts, scripts/audit/411-verify-set-config.ts
- Outcome: "GUC wiring complete — set_config('app.current_tenant_id', tenantId, FALSE) now fires in getTenantPrisma() before any model query. Pool connect handler resets GUC to '' on new physical connections. EXEMPT_MODELS in tenant-rls.ts purged of RLS-eligible tables. quick-410 unblocked."

Use the same row format as the recent quick-409 entry near the top of the STATE.md tracking table.
  </action>
  <verify>
1. `cd apps/web && npx tsc --noEmit` returns 0 errors.
2. `cd apps/web && npx tsx scripts/audit/411-verify-set-config.ts` exits with code 0 and prints either:
   - `[411-verify] MATCH — GUC wiring works end-to-end.` (if quick-410 has run and current_tenant_id() exists), OR
   - `[411-verify] raw GUC matches. quick-411 wiring is correct; current_tenant_id() will work once quick-410 lands.` (if function does not yet exist).
3. `cat .planning/STATE.md | grep -i 411` shows the new row.
  </verify>
  <done>
- 411-verify-set-config.ts exists, runs cleanly, exits 0.
- Script proves either current_tenant_id() returns the tenantId OR the raw GUC was correctly set (handles both pre- and post-quick-410 states).
- STATE.md has a row recording quick-411 completion and the unblocking of quick-410.
  </done>
</task>

</tasks>

<verification>
1. **Compile:** `cd apps/web && npx tsc --noEmit` returns 0 errors.
2. **Boot:** `cd apps/web && npm run dev` starts cleanly; no `[prisma] pool connect set_config init failed` warnings appear after the first request hits any tenant-scoped page.
3. **End-to-end GUC proof:** `cd apps/web && npx tsx scripts/audit/411-verify-set-config.ts` exits 0 and prints a MATCH (or the documented fallback success line).
4. **No deadlock:** Hit any tenant-scoped page (e.g. `/owner/trucks`) in dev and confirm it loads without P2028 errors. Check server logs for any Prisma transaction errors.
5. **Exempt list correctness:** Re-read `apps/web/src/lib/db/extensions/tenant-rls.ts` and confirm `TicketMessage`, `CarrierDocument`, `RouteTemplateStop` are NOT in `EXEMPT_MODELS`; `Tenant` IS still in the set; the schema-audit comment block above the set is present.
6. **tenantRawQuery untouched:** `git diff apps/web/src/lib/context/tenant-context.ts` shows changes ONLY inside `getTenantPrisma()` (lines added for `$executeRawUnsafe`) — `tenantRawQuery` body is unchanged.
</verification>

<success_criteria>
- `current_tenant_id()` returns the caller's tenantId UUID for every database query routed through `getTenantPrisma()` (proven by `411-verify-set-config.ts`).
- No P2028 deadlock occurs in dev or production. The Prisma tenant extension does not wrap individual queries in $transaction.
- `app.current_tenant_id` is initialised to `''` (empty) on every new physical pg connection so stale values cannot leak.
- `EXEMPT_MODELS` in `withTenantRLS` no longer skips `TicketMessage`, `CarrierDocument`, or `RouteTemplateStop` — these tables now receive Prisma-layer tenantId injection AND will be protected by RLS once quick-410 lands.
- `apps/web/src/lib/db/extensions/tenant-rls.ts` header comment documents the new wiring, references quick-411, and forbids future re-introduction of per-query $transaction wrapping.
- `tenantRawQuery()` in `tenant-context.ts` is unchanged (its existing per-call $transaction([set_config, raw]) pattern remains the correct mechanism for raw SQL).
- quick-410 (RLS migration) is unblocked: the canonical resolver now fires before any tenant-scoped Prisma query.
- STATE.md records completion with file list and outcome.
</success_criteria>

<output>
After completion, create `.planning/quick/411-wire-set-config-app-current-tenant-id-at/411-SUMMARY.md` documenting:
- The chosen approach (Option D: per-request session-scope set_config in getTenantPrisma + pool 'connect' initialiser)
- Why the spec's TRUE-scope per-transaction mandate was relaxed to FALSE-scope per-request (deployment-topology rationale; deadlock avoidance)
- The exact bytes added/changed in each of the four files
- Verification script output (paste the actual console output of running 411-verify-set-config.ts)
- Explicit confirmation that quick-410 can now proceed
</output>

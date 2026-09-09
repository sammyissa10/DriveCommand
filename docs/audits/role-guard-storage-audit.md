# Role guard, storage key, and open-question audit

**Prompt 4 of Phase 0 (revised).** Investigation only. No application code, schema,
configuration or migration was changed by the session that produced this file.

- **Date:** 2026-09-09
- **Branch:** `master`
- **Scope:** `apps/web` (the only surface with route handlers, server actions and DB access)
- **Production access:** read-only metadata only. See *Method and caveats*.
- **Inputs:** `.planning/phase-0-revised.md` §3 and §4; `src/lib/auth/supabase.ts`;
  `src/middleware.ts`; `src/lib/context/tenant-context.ts`; `src/lib/db/prisma.ts`;
  `src/lib/storage/*`.

---

## Method and caveats

Three things about the brief did not match the repository. They are recorded here
rather than silently worked around.

1. **`packages/database` does not exist.** The brief's pre-flight check names
   `apps/web`, `packages/database` and `.planning`. The workspace packages are
   `packages/api-client`, `packages/types` and `packages/validation`. The Prisma
   schema lives at `apps/web/prisma/schema.prisma`. Everything else in the brief
   is satisfiable, so the audit proceeded against the real layout.

2. **`requireAdminAccess` is not a shared helper.** The brief names it alongside
   `requireAuth` and `requireRole`, which are exported from
   `src/lib/auth/supabase.ts`. `requireAdminAccess` is instead defined **nine
   separate times as a private function** in nine different files. See finding 6.

3. **Production was queried through `list_tables`, not `execute_sql`.** The brief
   permits read-only production queries in one clause and forbids `execute_sql`
   against any project in another. The narrower prohibition was honoured: item 3
   was confirmed using the Supabase MCP `list_tables` call (read-only schema
   metadata, no SQL executed). Every other production fact in this document is
   quoted from `.planning/phase-0-revised.md` §4, which was gathered under
   Prompt 4's predecessor, and is attributed as such rather than re-measured.

**Storage is not Supabase Storage alone.** The brief asks for "the Supabase Storage
key scheme for the driver-documents bucket". The application actually uses **two
storage back ends against two buckets**, one of them through the AWS S3 SDK. Both
are mapped in section 2.

Route classification was produced by a static scan of all 272 `route.ts` files, 62
`use server` files and 37 tRPC procedures, then hand-verified against the guard
helpers. The scan's first pass under-reported guards because four wrapper-style
guards (`withMobileAuth`, `resolveReportAccess`, `requireDriverContext`,
`verifyCronSecret`) are not bare function calls in the handler body; they were added
and the scan re-run. The tables below reflect the corrected pass.

---

## Highest-risk findings, in order

### 1. Dropping `bypass_rls_policy` silently disables 211 live code paths — HIGH

`.planning/phase-0-revised.md` §4.5 establishes that `bypass_rls_policy` is
`TO public` on every tenant-scoped table, so `app_user` can switch off tenant
isolation for itself in one statement. §3 Q5 resolves this: if the sysadmin path
runs on the privileged `DATABASE_URL`, **drop the policy from every table and
remove the remaining `app.bypass_rls` `set_config` calls**.

Item 4 below confirms the sysadmin path does run on the privileged connection, so
that branch of Q5 is the live one. This audit supplies the number that branch was
missing:

| Measure | Count |
|---|---|
| Executed `set_config` statements in the repository | 255 |
| …of which set `app.bypass_rls` | 235 |
| `app.bypass_rls` statements in **runtime** `apps/web/src` (excludes tests, scripts, seeds) | **211** |
| Distinct runtime files containing at least one | **103** |
| `bypass_rls_policy` definitions across migration files | 128 statements in 32 migrations |

"Remove any remaining `app.bypass_rls` `set_config` calls" is therefore not a
cleanup. It is a change to 103 runtime files, and each one is a feature that
currently reads rows **only because** the bypass is in force. The affected set
includes the driver dashboard, the driver HOS and messages endpoints, the mobile
owner dashboard and driver list, the public shipment-tracking page, the login
route, six cron digests, and the notification dispatcher.

Today the calls are decorative: §4.1 records that the app connects as `postgres`,
which carries `rolbypassrls = true`, so RLS is not enforced at all and the bypass
statement changes nothing. That is precisely what makes the cutover dangerous —
these 211 statements have never been load-bearing and have never been tested in a
state where they were. At cutover there are only two outcomes, and both need
Prompt 1 and Prompt 2 to be sequenced against this file list:

- **Policy kept:** `app_user` reaches it, and tenant isolation is off. This is the
  §4.5 defect, unfixed.
- **Policy dropped:** all 211 paths lose their bypass. Any of them that genuinely
  needs cross-tenant or pre-tenant reach returns zero rows, with no error.

The full file:line enumeration is in section 5.1, shape 1.

### 2. The tenant is taken from a request header, and three middleware branches let the client's own header through — HIGH

`getTenantPrisma()` — the client behind roughly 140 route handlers and server
actions — derives the tenant from an HTTP request header, not from the session:

```
src/lib/context/tenant-context.ts:11-14
export async function getTenantId(): Promise<string | null> {
  const headersList = await headers();
  return headersList.get('x-tenant-id');
}
```

```
src/lib/context/tenant-context.ts:47-59
export async function getTenantPrisma(): Promise<PrismaClient> {
  const tenantId = await requireTenantId();
  ...
  await prisma.$executeRawUnsafe(
    "SELECT set_config('app.current_tenant_id', $1, false)",
    tenantId
  );
  return createTenantClient(tenantId, session?.userId ?? null);
}
```

`requireTenantId()` only checks the header is non-empty. It never compares it to
`session.tenantId`. The header is trustworthy only because middleware overwrites it,
which it does at exactly one place:

```
src/middleware.ts:166-167
const requestHeaders = new Headers(request.headers);
requestHeaders.set('x-tenant-id', appMeta.tenantId);
```

`new Headers(request.headers)` copies the inbound headers first, so this line is the
only thing standing between a client-supplied `x-tenant-id` and the database. Three
earlier `return` statements never reach it, and none of them strips the inbound
header:

| Line | Branch | Reached by |
|---|---|---|
| `src/middleware.ts:79` | `if (isPublicPath(pathname)) return NextResponse.next();` | anyone, on any of the 18 public paths |
| `src/middleware.ts:103` | unauthenticated request to `/api/*` → `return NextResponse.next();` | anyone, unauthenticated |
| `src/middleware.ts:124` | authenticated, **no `tenantId`**, `/api` path → `return response;` | an authenticated user whose tenant was never provisioned |

The first two are largely covered by the handlers' own guards: a public path that
needs a tenant uses `getTenantPrismaForOrg(invitation.tenantId)` from a verified
token rather than the header (`src/app/api/auth/accept-invitation/route.ts:301`,
with an explicit comment at :293 saying why), and an unauthenticated caller is
stopped by `getSession()` returning null.

**The third branch is the material one.** The precondition is real and is created by
the product's own sign-up flow:

```
src/app/(auth)/sign-up/actions.tsx:99-100
// app_metadata.tenantId is not yet known — it will be patched after provisioning.
const { data: authData, error: authCreateError } = await admin.auth.admin.createUser({
```

The auth user is created first and `app_metadata` is patched with
`{ role: 'OWNER', tenantId }` only afterwards, at `src/app/(auth)/sign-up/actions.tsx:167-170`.
Between those two points — and permanently, if `provisionTenant` throws (:162) or
`updateUserById` fails (:177) — the account is an authenticated user with
**`role: 'OWNER'` and no `tenantId`**. Such a user hitting any `/api/*` path takes
the `src/middleware.ts:124` branch, arrives at the handler with their own
`x-tenant-id` intact, passes `getSession()` and `requireRole([OWNER, MANAGER])` on
role, and `getTenantPrisma()` then scopes the query to whatever tenant they named.

Because the connection currently runs as `postgres` (`rolbypassrls = true`, §4.1),
the extension's injected `where` clause is the *only* tenant filter in the system
today. There is no database-level backstop behind it.

Separately, and lower severity: a **system admin** has no `tenantId` by design and
does *not* take the :124 branch (the condition at :116 excludes them). They fall
through to :167, where `requestHeaders.set('x-tenant-id', undefined)` coerces to the
string `"undefined"`. That is not a bypass — the client's value is still overwritten —
but it produces a `22P02` invalid-uuid cast in `current_tenant_id()` rather than a
clean failure.

### 3. The tenant GUC is session-scoped and is never reset — HIGH

There is **no SQL `RESET` or `DISCARD` statement anywhere in the repository**. All
five textual matches are English prose in comments and `console.log` strings
(section 5.4).

The tenant GUC is written with the third argument `false`, i.e. **session scope**,
so it persists on the physical connection after the request that set it finishes:

```
src/lib/context/tenant-context.ts:54-57
await prisma.$executeRawUnsafe(
  "SELECT set_config('app.current_tenant_id', $1, false)",
  tenantId
);
```

The only thing that ever clears it is a handler bound to **new physical connections
only**:

```
src/lib/db/prisma.ts:69
client.query("SELECT set_config('app.current_tenant_id', '', false)").catch((err) => {
```

`pool.on('connect', ...)` fires once per new TCP connection, not per checkout. A
connection returned to the pool and handed to the next request therefore still
carries the previous request's tenant id until something overwrites it. This is the
pool-leak behaviour already recorded in memory as `project_rls_guc_set_config_pattern.md`
(Quick-413), confirmed here from source.

The mitigation the design relies on is that `getTenantPrisma()` overwrites the value
before any model query runs. That holds for the ~140 call sites that use it. It does
**not** hold for the 103 files that use the bare `prisma` client with a bypass
transaction, nor for any raw query issued outside `tenantRawQuery()`. Once
`DATABASE_URL` moves to `app_user` and the GUC becomes the actual enforcement input,
a stale GUC is a cross-tenant read rather than a redundant filter.

### 4. `assertTenantKey` cannot be applied to one of the two buckets — MEDIUM

`assertTenantKey` validates that a key starts with `` `tenant-${tenantId}/` ``
(`src/lib/storage/tenant-key.ts:28`). Keys in the `drivecommand-files` bucket are
built as `` `${orgId}/${parentType}/...` `` and `` `${session.tenantId}/tasks/...` `` —
they carry the tenant id but **not** the `tenant-` prefix, so the shared helper
returns false for every legitimate key in that bucket and is, correctly, never
called on it. That bucket's three read paths are signed with the **service-role
admin client**, which bypasses Supabase Storage RLS entirely, leaving app-level row
ownership as the only control. Details and the full path table are in section 2.

### 5. `generateDownloadUrl` signs any key it is given — MEDIUM

```
src/lib/storage/presigned.ts:81-92
export async function generateDownloadUrl(s3Key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: getBucketName(),
    Key: s3Key,
```

The parameter comment at :78 reads "already validated with tenant prefix", but no
validation happens in this function. Safety is entirely the caller's, and callers do
not agree — there are three mechanisms in use for one rule: **14** call sites validate
with an inline `` startsWith(`tenant-${tenantId}/`) ``, **8** call sites use the shared
`assertTenantKey`, and **8** rely only on having loaded the row through a
tenant-scoped query. No path was found where a **client-supplied** key
reaches a signer unvalidated, so this is a latent hazard rather than a live hole —
but it is one edit away from being live, and the function's own doc comment already
misstates the contract.

### 6. Nine private copies of `requireAdminAccess`, one behaving differently — MEDIUM

Nine files each define their own `requireAdminAccess`. Eight are byte-identical in
behaviour (`requireAuth()` then `isSystemAdmin()`, throwing on failure). The ninth
redirects instead of throwing:

```
src/app/(admin)/notifications/page.tsx:18-24
async function requireAdminAccess() {
  await requireAuth();
  const admin = await isSystemAdmin();
  if (!admin) {
    redirect('/sign-in');
  }
}
```

This is the same divergence class that `requirePermission`'s header in
`src/lib/auth/supabase.ts:168-187` documents as having already caused a live bug —
five hand-written copies of one predicate, three of which disagreed. Full list in
section 3.

### 7. One server action has no guard at all — LOW

```
src/app/(owner)/actions/activation-congrats.ts:12-18
export async function markCongratsShown(): Promise<{ ok: boolean }> {
  try {
    const prisma = await getTenantPrisma();
    await prisma.activationProgress.updateMany({
```

No `requireAuth`, no `requireRole`, no `getSession`. It is a `use server` action, so
it is reachable as a POST by any authenticated session of any role, and the tenant
comes from the header. Middleware overwrites that header on the authenticated path,
so this is not cross-tenant; it is a DRIVER-writable owner-scoped table with a
`catch` that swallows the failure. Impact is small — the write is idempotent and
sets one timestamp — but it is the only unguarded, tenant-touching action in the repo.

---

## 1. Route, procedure, action and cron inventory

Totals: **272** HTTP route files, **37** tRPC procedures, **62** `use server` action
files, **14** cron handlers plus `/api/warmup`.

The four inventories are lettered A–D. **A** (all 272 route handlers) and **C** (all
62 server-action files) are long tables and live in the appendix at the end of this
document; **B** (tRPC) and **D** (cron) are short and are inline below. Every route
file in the router appears in table A.

Guard classes used below:

| Class | Meaning |
|---|---|
| `none` | no authentication or authorization check in the file |
| `auth-only` | proves a session or token exists; does not check role |
| `role-checked` | checks role and/or permission (`requireRole`, `withMobileAuth`, `resolveReportAccess`, `requirePermission`, `requireDriverContext`, `resolveInspectionAccess`) |
| `admin-only` | `isSystemAdmin()` / `requireAdminAccess()` |
| `cron-secret` | `verifyCronSecret()` — timing-safe `CRON_SECRET` bearer check |

Tenant-source values: `request header x-tenant-id` (client-supplied unless middleware
overwrote it — see finding 2), `session/token` (derived from the verified session or
Bearer token), `explicit arg` (`getTenantPrismaForOrg`), `**RLS bypassed**`
(`set_config('app.bypass_rls','on',TRUE)` in the file), `bare client (untenanted)`.

Risk column:

- **HIGH** — no guard, but the handler touches tenant data
- **MEDIUM** — tenant comes from the header with no session cross-check, or RLS is bypassed
- **LOW-MED** — authenticated but not role-checked, and touches tenant data
- **LOW** — role-checked and tenant derived from session
- **INFO** — unguarded and public by design (auth flows, health, token-gated tracking)

Route risk distribution: 3 HIGH, 88 MEDIUM, 131 LOW-MED, 45 LOW, 5 INFO.

### Routes reachable with no guard (8 files)

All eight were read in full. Five are public by design; three are flagged because
they touch tenant data.

| Route | Verdict |
|---|---|
| `api/health/route.ts` | INFO — no DB access |
| `api/auth/callback/route.ts` | INFO — Supabase OAuth callback, pre-auth by nature |
| `api/auth/logout/route.ts` | INFO — pre-auth by nature |
| `api/auth/me/route.ts` | INFO — validates cookie or Bearer itself before returning anything |
| `api/trpc/[trpc]/route.ts` | INFO — delegates to tRPC, which applies `tenantMemberProcedure` / `adminProcedure` |
| `api/auth/login/route.ts` | HIGH-by-scan, **accepted** — pre-auth by definition; bypasses RLS to look up the user being authenticated |
| `api/auth/accept-invitation/route.ts` | HIGH-by-scan, **accepted** — tenant comes from the verified invitation row, not the header (`:301`), with the reason stated at `:293` |
| `api/track/[token]/route.ts` | HIGH-by-scan, **accepted** — public tracking by unguessable token, IP rate-limited (`:16`), bypasses RLS deliberately for a cross-tenant token lookup (`:24`) |

### Routes where the role is checked but the tenant is not

The 88 MEDIUM rows in the full table below are exactly this class: the handler
establishes *who* is calling but takes *which tenant* from `x-tenant-id` without
comparing it to `session.tenantId`. Representative example, showing the two sources
side by side in one file:

```
src/app/api/documents/complete-upload/route.ts:18-33
await requireRole([UserRole.OWNER, UserRole.MANAGER]);
const tenantId = await requireTenantId();            // <- header
...
if (data.s3Key && !data.s3Key.startsWith(`tenant-${tenantId}/`)) {
```

The storage-key check is real, but it is anchored to the header value, so it
validates the key against the tenant the *caller named* rather than the tenant the
caller *belongs to*. Under middleware's authenticated path those are the same value;
under the `src/middleware.ts:124` branch they are not.

The same split appears inside tRPC, which otherwise derives tenancy cleanly from the
session (`src/server/api/trpc.ts:38`, `tenantId: ctx.session.tenantId`): the trigger
router mixes both in one query —

```
src/server/api/routers/workflows/trigger.ts:29-32
const tenantPrisma = await getTenantPrisma();          // header
const triggers = await tenantPrisma.playbookTrigger.findMany({
  where: { tenantId: ctx.tenantId, isActive: true },   // session
```

Here the session value is the effective filter, so this particular procedure is safe.
It is listed because it is the pattern to standardise on, and because the file proves
both values are available at the same point.

### B. tRPC procedures (37)

Context is built from `getSession()` at `src/server/api/trpc.ts:13-16`. `tenantId`
and `userId` are attached from the session at `:38-39`. No procedure takes a
client-supplied tenant.

| Router | Procedure | Base | Guard class | Roles | Tenant source |
|---|---|---|---|---|---|
| `workflows.stepTemplate` | `list` | `tenantMemberProcedure` | auth-only | any authenticated | session |
| `workflows.stepTemplate` | `getById` | `tenantMemberProcedure` | auth-only | any authenticated | session |
| `workflows.stepTemplate` | `create` | `adminProcedure` | role-checked | OWNER, MANAGER | session |
| `workflows.stepTemplate` | `update` | `adminProcedure` | role-checked | OWNER, MANAGER | session |
| `workflows.stepTemplate` | `archive` | `adminProcedure` | role-checked | OWNER, MANAGER | session |
| `workflows.playbook` | `list` | `tenantMemberProcedure` | auth-only | any authenticated | session |
| `workflows.playbook` | `getById` | `tenantMemberProcedure` | auth-only | any authenticated | session |
| `workflows.playbook` | `create` | `adminProcedure` | role-checked | OWNER, MANAGER | session |
| `workflows.playbook` | `update` | `adminProcedure` | role-checked | OWNER, MANAGER | session |
| `workflows.playbook` | `archive` | `adminProcedure` | role-checked | OWNER, MANAGER | session |
| `workflows.playbook` | `duplicate` | `adminProcedure` | role-checked | OWNER, MANAGER | session |
| `workflows.playbook` | `addStep` | `adminProcedure` | role-checked | OWNER, MANAGER | session |
| `workflows.playbook` | `removeStep` | `adminProcedure` | role-checked | OWNER, MANAGER | session |
| `workflows.playbook` | `updateStep` | `adminProcedure` | role-checked | OWNER, MANAGER | session |
| `workflows.playbook` | `reorderSteps` | `adminProcedure` | role-checked | OWNER, MANAGER | session |
| `workflows.instance` | `generate` | `adminProcedure` | role-checked | OWNER, MANAGER | session |
| `workflows.instance` | `list` | `tenantMemberProcedure` | auth-only | any authenticated | session |
| `workflows.instance` | `get` | `tenantMemberProcedure` | auth-only | any authenticated | session |
| `workflows.instance` | `getForEntity` | `tenantMemberProcedure` | auth-only | any authenticated | session |
| `workflows.instance` | `computeReadiness` | `adminProcedure` | role-checked | OWNER, MANAGER | session |
| `workflows.instance` | `getDriverReadiness` | `tenantMemberProcedure` | auth-only | any authenticated | session |
| `workflows.stepInstance` | `complete` | `tenantMemberProcedure` | auth-only | any authenticated | session |
| `workflows.stepInstance` | `skip` | `adminProcedure` | role-checked | OWNER, MANAGER | session |
| `workflows.stepInstance` | `getForDriver` | `tenantMemberProcedure` | auth-only | any authenticated | session |
| `workflows.stepInstance` | `fail` | `tenantMemberProcedure` | auth-only | any authenticated | session |
| `workflows.stepInstance` | `requestApproval` | `tenantMemberProcedure` | auth-only | any authenticated | session |
| `workflows.stepInstance` | `approve` | `adminProcedure` | role-checked | OWNER, MANAGER | session |
| `workflows.trigger` | `listRecipes` | `adminProcedure` | role-checked | OWNER, MANAGER | session (+ header client, filtered by session) |
| `workflows.trigger` | `enableRecipe` | `adminProcedure` | role-checked | OWNER, MANAGER | session (+ header client) |
| `workflows.trigger` | `disableRecipe` | `adminProcedure` | role-checked | OWNER, MANAGER | session (+ header client) |
| `workflows.trigger` | `listCustomRules` | `adminProcedure` | role-checked | OWNER, MANAGER | session (+ header client) |
| `workflows.trigger` | `createCustomRule` | `adminProcedure` | role-checked | OWNER, MANAGER | session (+ header client) |
| `workflows.trigger` | `deleteRule` | `adminProcedure` | role-checked | OWNER, MANAGER | session (+ header client) |
| `workflows.trigger` | `listActivityLog` | `adminProcedure` | role-checked | OWNER, MANAGER | session (+ header client) |
| `workflows.analytics` | `getPlaybookStats` | `tenantMemberProcedure` | auth-only | any authenticated | session |
| `workflows.analytics` | `getAvgCompletionTime` | `tenantMemberProcedure` | auth-only | any authenticated | session |
| `workflows.analytics` | `getStepDropOff` | `tenantMemberProcedure` | auth-only | any authenticated | session |

`publicProcedure` is exported at `src/server/api/trpc.ts:23` and is **used by no
procedure**. `stepInstance.complete` and `stepInstance.fail` are `tenantMemberProcedure`
by deliberate design (any authenticated user may answer a checklist item), noted in
that file's header at `:5-11`.

### D. Cron and job handlers (14 + warmup)

Every cron handler is guarded by `verifyCronSecret()`
(`src/lib/security/cron-auth.ts:15`), a timing-safe SHA-256 comparison of the
`authorization` header against `CRON_SECRET`, failing closed when the variable is
unset (`:20-23`). All are cross-tenant by design.

| Handler | Schedule | Guard | Tenant source |
|---|---|---|---|
| `api/cron/send-reminders` | `0 14 * * *` | cron-secret | bare client + **RLS bypassed** |
| `api/cron/auto-close-tickets` | `0 2 * * *` | cron-secret | bare client + **RLS bypassed** |
| `api/cron/mark-overdue-invoices` | `0 3 * * *` | cron-secret | bare client (untenanted) |
| `api/cron/carrier-auto-dispatch` | `0 0 * * *` | cron-secret | bare client (untenanted) |
| `api/cron/carrier-compliance-alerts` | `0 6 * * *` | cron-secret | bare client (untenanted) |
| `api/cron/workflow-notifications` | `0 7 * * *` | cron-secret | bare client + **RLS bypassed** |
| `api/cron/workflow-digest` | `0 8 * * *` | cron-secret | bare client + **RLS bypassed** |
| `api/cron/automations` | `0 0 * * *` | cron-secret | bare client + **RLS bypassed** |
| `api/cron/digest-daily-driver` | `0 22 * * *` | cron-secret | bare client + **RLS bypassed** |
| `api/cron/digest-weekly-owner` | `0 22 * * 5` | cron-secret | bare client + **RLS bypassed** |
| `api/cron/digest-compliance-30day` | `0 14 * * 1` | cron-secret | bare client + **RLS bypassed** |
| `api/cron/purge-deleted` | `0 3 * * *` | cron-secret | bare client (untenanted) |
| `api/cron/trip-reminders` | `0 13 * * *` | cron-secret | explicit arg + bare client |
| `api/cron/cleanup-quarantine` | `0 * * * *` (root `vercel.json`) | cron-secret | none |
| `api/warmup` | `0 8 * * *` | cron-secret | bare client (untenanted) |

`api/cron/trip-reminders` is the only cron that resolves tenancy properly, via
`getTenantPrismaForOrg`. The nine `RLS bypassed` rows are nine of the 103 files in
finding 1.

---

## 2. Storage key scheme and signing paths

### Buckets in use

| # | Bucket | Back end | Client used | Key scheme | Contains tenant id? | Predictable? |
|---|---|---|---|---|---|---|
| A | `process.env.S3_BUCKET`, defaulting to `'driver-documents'` | S3-compatible (Cloudflare R2 or AWS) via `@aws-sdk/client-s3` | presigned URLs, `src/lib/storage/s3-client.ts:40` | `tenant-{tenantId}/{category}/{fileId}-{fileName}` | **yes**, `tenant-` prefix | prefix yes, `fileId` is `nanoid()` — not guessable |
| A′ | same bucket name | **Supabase Storage** | `createAdminClient()` (service role) | `tenant-{tenantId}/support/{fileId}-screenshot.png` | yes | as above |
| B | `'drivecommand-files'` (hardcoded) | Supabase Storage | `createAdminClient()` (service role) | `{orgId}/{parentType}/{parentId}/{documentType}/{uuid}.{ext}` | **yes**, but **no `tenant-` prefix** | `uuid` not guessable |
| B′ | `'drivecommand-files'` | Supabase Storage | `createAdminClient()` (service role) | `{tenantId}/tasks/{fileId}-{sanitized}` | yes, no `tenant-` prefix | `fileId` is `nanoid()` |

Bucket A is addressed through **two different back ends with the same name**: the S3
SDK (`src/lib/storage/s3-client.ts:50-56`) and Supabase Storage
(`src/actions/support-tickets.ts:64`, `src/app/api/mobile/support/upload-screenshot/route.ts:59`,
`src/app/api/admin/support/screenshot/route.ts:30`). The Supabase-Storage callers
default to the literal `'driver-documents'` when `S3_BUCKET` is unset, while
`getBucketName()` throws in the same situation. A misconfigured environment
therefore fails loudly on one path and silently writes to a differently-named bucket
on the other.

Bucket B keys carry the tenant id as the **first path segment with no prefix**.
`isTenantKey` requires `` s3Key.startsWith(`tenant-${tenantId}/`) ``
(`src/lib/storage/tenant-key.ts:28`), so the shared helper is structurally
inapplicable to bucket B and is not used there. This is finding 4.

### Signing and write paths

| Path | Bucket | Key source | Tenant validated before signing/writing? | Risk |
|---|---|---|---|---|
| `src/lib/storage/presigned.ts:48-70` `generateUploadUrl` | A | **server-built** from `tenantId` arg | n/a — client cannot choose the key | LOW |
| `src/lib/storage/presigned.ts:81-92` `generateDownloadUrl` | A | caller-supplied | **no** — signs whatever it is given | MEDIUM (finding 5) |
| `src/lib/storage/presigned.ts:99-106` `deleteS3Object` | A | caller-supplied | **no** | MEDIUM |
| `src/lib/storage/restricted.ts:84` | A | caller-supplied | yes — `` startsWith(`tenant-${tenantId}/restricted/`) `` | LOW |
| `src/app/api/documents/download-url/[id]/route.ts:74` | A | DB row | yes — inline prefix check | LOW |
| `src/app/api/documents/delete/[id]/route.ts:36` | A | DB row | yes — inline prefix check | LOW |
| `src/app/api/documents/complete-upload/route.ts:33` | A | **client body** `data.s3Key` | yes, but against the **header** tenant (`requireTenantId()`, `:20`) | MEDIUM |
| `src/app/api/documents/multipart/part-url/route.ts:40` | A | **client body** | yes — `` startsWith(`tenant-${tenantId}/drivers/`) `` | LOW-MED |
| `src/app/api/documents/multipart/complete/route.ts:64` | A | **client body** | yes — same check | LOW-MED |
| `src/app/api/mobile/driver/documents/route.ts:172` | A | client-supplied | yes — `` startsWith(`tenant-${tenantId}/drivers/`) ``, tenant from Bearer token | LOW |
| `src/app/api/mobile/driver/documents/[id]/url/route.ts:47-71` | A | DB row, `where: { id, tenantId }` then `driverId` check | row-level only, no key check | LOW |
| `src/app/(owner)/actions/driver-documents.ts:249,349` | A | client / DB row | yes — inline prefix checks | LOW |
| `src/app/(owner)/actions/documents.ts:88,159,203` | A | client / DB row | yes — inline prefix checks | LOW |
| `src/app/(owner)/actions/load-documents.ts:177` | A | DB row | yes — `` startsWith(`tenant-${tenantId}/loads/`) `` | LOW |
| `src/app/(driver)/actions/driver-documents.ts:160` | A | DB row | yes — inline prefix check | LOW |
| `src/app/api/v1/carrier/fleet/trucks/[id]/photo-view-url/route.ts:28` | A | DB row | yes — inline prefix check | LOW |
| `src/app/(driver-fullscreen)/inspection/actions.ts:184,342` | A | client-supplied | yes — `assertTenantKey(..., g.session.tenantId)`, **session-derived** | LOW |
| `src/lib/document-import/*` (6 sites: `persistence.ts:333,743`, `materialise.ts:129`, `intake.ts:148`, `commit-service.ts:1100,1124`) | A | client / DB | yes — `assertTenantKey(..., orgId)` | LOW |
| `src/lib/document-import/intake.ts:779` | A | key already asserted at `:148` in the same flow | yes, upstream | LOW |
| `src/app/api/v1/messages/[id]/audio-url/route.ts:51` | A | DB row `message.audioUrl` | row-level only, no key check | LOW-MED |
| `src/app/(owner)/support/[id]/page.tsx:103` | A | DB row `ticket.attachmentKey` | row-level only, no key check | LOW-MED |
| `src/app/api/driver-pay/settlements/[settlementId]/pdf/route.ts:86` | A | DB row `settlement.pdfUrl` | row-level only, no key check | LOW-MED |
| `src/lib/carrier/documents.ts:153-162` (upload) | B | **server-built** `` `${orgId}/${parentType}/...` `` | n/a — client cannot choose the key | LOW |
| `src/lib/carrier/documents.ts:248` (sign) | B | DB row `doc.fileUrl` | row-level, via parent-chain org check | LOW-MED |
| `src/app/api/v1/carrier/documents/[id]/signed-url/route.ts:57` | B | DB row `doc.fileUrl` | row-level, explicit parent-chain check `:28-52`, fails closed on unknown `parentType` | LOW-MED |
| `src/app/(owner)/checklists/instances/[id]/_components/actions.ts:27` | B | DB row `result.photoPath` | row-level — `playbookInstance: { tenantId: session.tenantId }` (`:16`) | LOW-MED |
| `src/app/(driver)/actions/driver-tasks.ts:289` (upload) | B | **server-built** from `session.tenantId` | n/a — client cannot choose the key | LOW |
| `src/actions/support-tickets.ts:64-69` (upload) | A′ | **server-built** from `tenantId` | n/a | LOW |
| `src/app/api/mobile/support/upload-screenshot/route.ts:59-62` (upload) | A′ | **server-built** | n/a | LOW |
| `src/app/api/admin/support/screenshot/route.ts:30-33` (download) | A′ | client-supplied `s3Key` | admin-only guard; no key check | LOW-MED |

### Direct answers to the brief's storage questions

- **Does a key contain a tenant identifier?** Yes, in all four schemes. Bucket A uses
  a `tenant-` prefix; bucket B uses the bare id as the first segment.
- **Is it predictable?** The tenant prefix and category are fully predictable. The
  final component is a `nanoid()` or a `crypto.randomUUID()` in every scheme, so a
  specific object key is not guessable. Enumeration would require listing, which no
  application path exposes.
- **Does the signed-URL path validate that the key belongs to the session tenant
  before signing?** **Not uniformly, and by three different mechanisms.** Counting
  application call sites and excluding the helper modules themselves: 14 use an
  inline `` startsWith(`tenant-${tenantId}/`) ``, 8 use the shared `assertTenantKey`,
  and 8 perform no key-level check at all, relying solely on having loaded the row
  through a tenant-scoped query. None of that last group is reachable with a
  client-supplied key, so no crafted key is signed today.
- **Is an uploaded key prefixed with another tenant's identifier accepted on write?**
  **No.** Every upload path builds the key server-side from a tenant id the client
  did not supply. The three paths that accept a client-supplied key on the
  *metadata-recording* step — `complete-upload`, `multipart/part-url`,
  `multipart/complete` — all reject a foreign prefix. The one caveat is that
  `complete-upload` compares against `requireTenantId()` (the header) rather than
  `session.tenantId`, so it inherits finding 2.
- **Paths where a crafted key would be signed or accepted:** none found. The nearest
  approach is `src/app/api/admin/support/screenshot/route.ts:30-33`, which downloads a
  fully client-supplied `s3Key` from bucket A with no prefix check — gated to system
  admins only, so it is a privilege the role already has rather than an escalation.

---

## 3. `grid_view` and `grid_preference` columns

**Both tables carry a user id. Both are user-scoped. Neither is a defect.**

Confirmed against **production** (`oqdhberkghtnszrkdvfm`, `public` schema) via
read-only `list_tables` metadata, and against the checked-in schema. The two agree.

**`grid_preference`** — exact owner column name: **`userId`**, type `uuid`.

```
apps/web/prisma/schema.prisma:3948-3964
model GridPreference {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId        String   @db.Uuid
  gridId        String   @db.VarChar(100)
  ...
  @@unique([userId, gridId])
  @@index([userId])
  @@map("grid_preference")
}
```

Live columns: `id` uuid, **`userId` uuid**, `gridId` varchar, `columnOrder` array,
`columnWidths` jsonb, `hiddenColumns` array, `frozenColumns` array, `density` text,
`pageSize` integer, `createdAt` timestamptz, `updatedAt` timestamptz. `rls_enabled = false`.

**`grid_view`** — exact owner column name: **`userId`**, type `uuid`.

```
apps/web/prisma/schema.prisma:3966-3984
/// Saved grid views capturing complete grid state (filters, sort, columns, density).
/// Personal to user — not tenant-scoped.
model GridView {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  gridId        String   @db.VarChar(100)
  userId        String   @db.Uuid
  ...
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([gridId, userId, name])
  @@index([gridId, userId])
  @@map("grid_view")
}
```

Live columns: `id` uuid, `gridId` varchar, **`userId` uuid**, `name` varchar,
`isDefault` boolean, `schemaVersion` integer, `state` jsonb, `createdAt` timestamptz,
`updatedAt` timestamptz. `rls_enabled = false`.

Neither table has a `tenantId` or `org_id` column. `grid_view.userId` is a real
foreign key to `User` with `onDelete: Cascade`; `grid_preference.userId` is not
declared as a relation in Prisma and has no FK.

Per `.planning/phase-0-revised.md` §3 Q4, this resolves to: **add both to
`EXEMPT_MODELS` with the reason "user-scoped, owner column `userId`, no tenant
column"**. The stop-and-report branch does not apply.

One observation for Prompt 1 rather than a finding: the two tables are only
user-scoped in the sense that they carry a user id. With RLS disabled and no policy,
nothing in the database prevents one user's row being read by another; the scoping is
enforced solely by the `where: { userId }` clauses in application code. That is a
weaker position than "tenant-scoped", not a stronger one, and exempting them from
tenant policy should not be read as exempting them from access control.

---

## 4. Which connection the sysadmin cross-tenant read path uses

**It runs on the privileged `DATABASE_URL`, not as `app_user`.** Q5's first branch is
the live one: drop `bypass_rls_policy` and remove the `app.bypass_rls` calls — subject
to finding 1's file count.

Full trace, four hops, with file and line.

**Hop 1 — the sysadmin route handler imports the bare client.** Every file in the
`(admin)` route group does; `tenants.ts` is the canonical cross-tenant read.

```
src/app/(admin)/actions/tenants.ts:6
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
```

```
src/app/(admin)/actions/tenants.ts:24-31
/**
 * Get all tenants with resource counts.
 * Uses base Prisma client for cross-tenant access (NOT getTenantPrisma).
 */
export async function getAllTenants() {
  await requireAdminAccess();

  const tenants = await prisma.tenant.findMany({
```

The same import appears at `src/app/(admin)/actions/users.ts:4`,
`sysadmin-invoices.ts:4`, `promos.ts:4`, `plans.ts:4`, `notifications.ts:6`,
`automations.ts:4`, and in the admin pages `admin-support/page.tsx:8`,
`billing/[id]/page.tsx:8`, `tenants/[id]/page.tsx:16`,
`tenants/[id]/automation-runs-section.tsx:3`,
`tenants/[id]/activation-progress-section.tsx:2`. **No file in `(admin)` imports
`getTenantPrisma`.** `users.ts:35` states the intent explicitly: "Uses bare Prisma
client (NOT getTenantPrisma) — intentional cross-tenant".

**Hop 2 — the bare client is the module singleton, with no tenant extension.**

```
src/lib/db/prisma.ts:83
export const prisma = globalForPrisma.prisma || new PrismaClient({ adapter });
```

`createTenantClient` (which applies `withTenantRLS` and `withAuditColumns`) is never
applied here, and no `set_config('app.current_tenant_id', ...)` runs on this path.

**Hop 3 — the adapter wraps a `pg` pool.**

```
src/lib/db/prisma.ts:79
const adapter = new PrismaPg(pool);
```

**Hop 4 — the pool's connection string is `DATABASE_URL`.**

```
src/lib/db/prisma.ts:44-45
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
```

`DATABASE_URL` is the only connection string in application code; the sole other
references are in test files. There is no `APP_USER_DATABASE_URL` or equivalent in
`apps/web/src`.

**What that connection is.** Per `.planning/phase-0-revised.md` §4.1, the application
connects as `postgres` through Supavisor, and §4.3 records `postgres` with
`rolbypassrls = true`. So the sysadmin cross-tenant read reaches every tenant's rows
because the role bypasses RLS entirely — not because of `bypass_rls_policy`, and not
because of any GUC. Removing the policy will not affect it.

Two consequences for Prompt 1:

1. A `BYPASSRLS` role does not need a policy, so `bypass_rls_policy` can be dropped
   without touching the sysadmin surfaces. §3 Q5 already says this; this audit
   confirms the premise.
2. **The 103 non-sysadmin files in finding 1 are a different matter.** They are on
   the *same* connection and also currently reach rows via `rolbypassrls`, not via
   the policy. When Prompt 2 moves `DATABASE_URL` to `app_user`, they lose that
   reach whether or not the policy is dropped. The sysadmin path will lose it too,
   and `(admin)` has no fallback — it does not set a tenant GUC, so under `app_user`
   with policies enforced it would return zero rows for every tenant. Prompt 2's
   cutover needs a decision for the admin surface that Q5 does not currently contain.

---

## 5. Verbatim occurrences: `set_config`, `app.current_tenant_id`, `app.bypass_rls`, `RESET`, `DISCARD`

Search scope: `apps/web/src`, `apps/web/prisma`, `apps/web/scripts`, all `.ts`,
`.tsx` and `.sql`, excluding `src/generated/**`. Migration SQL is summarised
separately at the end because `bypass_rls_policy` appears there 128 times across 32
migration files as policy DDL, not as application calls.

Totals: **255 executed `set_config` statements** (221 in runtime `src`, 5 in tests,
29 in scripts and seeds); of those, **235 set `app.bypass_rls`** and **20 set
`app.current_tenant_id`**. A further 12 textual matches are comments or test
assertions, marked as such in the table below.

**Every executed call is unconditional.** Not one is guarded by a comparison against
the current value — there is no `current_setting(...)` read anywhere that feeds a
conditional around a `set_config`. This was verified by inspecting all 28 distinct
call shapes; only five of them are executed SQL in runtime code, and each emits the
statement on entry to its transaction or request.

**Third-argument summary.** `TRUE` (transaction-local) is used for every
`app.bypass_rls` call and for the `tenantRawQuery` / integration / login variants of
`app.current_tenant_id`. `FALSE` (session scope, persisting on the pooled connection)
is used by the two functions that matter most for isolation —
`getTenantPrisma` and `getTenantPrismaForOrg` — and by the pool initialiser. That
split is deliberate and documented at `src/lib/context/tenant-context.ts:36-43`; it is
also what makes finding 3 possible, because nothing ever clears the session-scoped
value.


#### 5.1 `set_config` — every call site

No call site anywhere in the repository is guarded by a comparison against the current value. Every one is unconditional: the statement is emitted on entry to the transaction or request with no `current_setting(...)` read first. This was checked by reading each distinct call shape below; there are only five distinct shapes in runtime code.

| # | Kind | Verbatim statement | 3rd arg | Scope | Guarded? | Sites |
|---|---|---|---|---|---|---|
| 1 | SQL | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` | TRUE | transaction-local | unconditional | 222 |
| 2 | SQL | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`` | TRUE | transaction-local | unconditional | 8 |
| 3 | SQL | `await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;` | TRUE | transaction-local | unconditional | 8 |
| 4 | SQL | `"SELECT set_config('app.current_tenant_id', $1, false)",` | FALSE | SESSION (survives release to pool) | unconditional | 4 |
| 5 | SQL | `await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${appMeta.tenantId as string}, TRUE)`;` | TRUE | transaction-local | unconditional | 2 |
| 6 | comment/assertion | `// Legitimate bypass_rls pattern: $executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`` | n/a | n/a — not executed | n/a | 1 |
| 7 | comment/assertion | `hit.lineText.includes("set_config('app.bypass_rls'")` | n/a | n/a — not executed | n/a | 1 |
| 8 | comment/assertion | `(fileContent.includes("set_config('app.bypass_rls'") \|\|` | n/a | n/a — not executed | n/a | 1 |
| 9 | comment/assertion | `fileContent.includes('set_config("app.bypass_rls"') \|\|` | n/a | n/a — not executed | n/a | 1 |
| 10 | comment/assertion | `fileContent.includes("set_config('app.bypass_rls','on'"))` | n/a | n/a — not executed | n/a | 1 |
| 11 | SQL | `await (tx as any).$executeRawUnsafe("SELECT set_config('app.bypass_rls', 'on', TRUE)");` | TRUE | transaction-local | unconditional | 1 |
| 12 | SQL | `await tx.$executeRawUnsafe("SELECT set_config('app.bypass_rls', 'on', TRUE)");` | TRUE | transaction-local | unconditional | 1 |
| 13 | comment/assertion | `* bypass_rls file-level check (set_config('app.bypass_rls', 'on', TRUE) is present).` | n/a | n/a — not executed | n/a | 1 |
| 14 | SQL | `"SELECT set_config('app.bypass_rls','on',true)",` | TRUE | transaction-local | unconditional | 1 |
| 15 | SQL | `prisma.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`,` | TRUE | transaction-local | unconditional | 1 |
| 16 | comment/assertion | `* sets set_config('app.bypass_rls', 'on') inside each transaction and uses` | n/a | n/a — not executed | n/a | 1 |
| 17 | SQL | `.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` | TRUE | transaction-local | unconditional | 1 |
| 18 | comment/assertion | `* [411-verify] firing SELECT set_config('app.current_tenant_id', <uuid>, false)` | n/a | n/a — not executed | n/a | 1 |
| 19 | comment/assertion | `console.log(`[411-verify] firing SELECT set_config('app.current_tenant_id', ${tenantId}, false)`);` | n/a | n/a — not executed | n/a | 1 |
| 20 | SQL | `await client.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [tenantId ?? '']);` | FALSE | SESSION (survives release to pool) | unconditional | 1 |
| 21 | SQL | `await client.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [tenantId]);` | FALSE | SESSION (survives release to pool) | unconditional | 1 |
| 22 | SQL | `await client.query(`SELECT set_config('app.current_tenant_id', '', false)`);` | FALSE | SESSION (survives release to pool) | unconditional | 1 |
| 23 | SQL | ``SELECT set_config('app.current_tenant_id', $1, false)`,` | FALSE | SESSION (survives release to pool) | unconditional | 1 |
| 24 | SQL | `await c1.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [tenantA]);` | FALSE | SESSION (survives release to pool) | unconditional | 1 |
| 25 | comment/assertion | `// Legitimate current_tenant_id pattern: $executeRaw`SELECT set_config('app.current_tenant_id', ...)`` | n/a | n/a — not executed | n/a | 1 |
| 26 | comment/assertion | `hit.lineText.includes("set_config('app.current_tenant_id'")` | n/a | n/a — not executed | n/a | 1 |
| 27 | SQL | `client.query("SELECT set_config('app.current_tenant_id', '', false)").catch((err) => {` | FALSE | SESSION (survives release to pool) | unconditional | 1 |
| 28 | comment/assertion | `* SELECT set_config('app.current_tenant_id', <tenantId>, false)` | n/a | n/a — not executed | n/a | 1 |

**Full file:line enumeration, by shape.**

<details><summary>Shape 1 — 222 site(s): <code>await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;</code></summary>

Runtime code (200):

- `src/actions/support-tickets.ts:98`
- `src/actions/support-tickets.ts:169`
- `src/actions/support-tickets.ts:217`
- `src/actions/support-tickets.ts:341`
- `src/actions/support-tickets.ts:371`
- `src/actions/support-tickets.ts:410`
- `src/actions/support-tickets.ts:475`
- `src/actions/support-tickets.ts:542`
- `src/actions/doc-feedback.ts:32`
- `src/app/onboarding/welcome/page.tsx:27`
- `src/app/onboarding/welcome/page.tsx:50`
- `src/app/onboarding/welcome/page.tsx:70`
- `src/app/api/v1/messages/[id]/audio-url/route.ts:36`
- `src/app/api/v1/messages/thread/route.ts:79`
- `src/app/api/v1/messages/thread/route.ts:105`
- `src/app/api/v1/messages/thread/route.ts:118`
- `src/app/api/v1/messages/send/route.ts:64`
- `src/app/api/v1/messages/send/route.ts:76`
- `src/server/services/workflows/notifications.ts:49`
- `src/server/services/workflows/notifications.ts:62`
- `src/server/services/workflows/notifications.ts:80`
- `src/server/services/workflows/notifications.ts:95`
- `src/server/services/workflows/notifications.ts:106`
- `src/server/services/workflows/notifications.ts:127`
- `src/server/services/workflows/notifications.ts:149`
- `src/server/services/workflows/notifications.ts:251`
- `src/server/services/workflows/notifications.ts:316`
- `src/server/services/workflows/notifications.ts:557`
- `src/server/services/workflows/generatePlaybookInstance.ts:65`
- `src/app/api/v1/messages/conversations/route.ts:38`
- `src/app/api/v1/messages/conversations/route.ts:74`
- `src/app/api/v1/messages/conversations/route.ts:94`
- `src/app/api/v1/messages/broadcast/route.ts:54`
- `src/app/api/push-tokens/route.ts:54`
- `src/server/api/routers/workflows/analytics.ts:26`
- `src/server/api/routers/workflows/analytics.ts:34`
- `src/server/api/routers/workflows/analytics.ts:42`
- `src/server/api/routers/workflows/analytics.ts:71`
- `src/server/api/routers/workflows/analytics.ts:110`
- `src/server/api/routers/workflows/analytics.ts:126`
- `src/server/api/routers/workflows/analytics.ts:142`
- `src/app/api/mobile/support/ticket/route.ts:39`
- `src/app/api/mobile/support/ticket/route.ts:97`
- `src/app/api/auth/login/route.ts:154`
- `src/app/(auth)/sign-up/actions.tsx:183`
- `src/server/api/routers/workflows/instance.ts:105`
- `src/app/api/auth/accept-invitation/route.ts:44`
- `src/app/api/auth/accept-invitation/route.ts:121`
- `src/app/api/auth/accept-invitation/route.ts:156`
- `src/app/api/auth/accept-invitation/route.ts:240`
- `src/app/api/mobile/owner/trucks/[id]/scheduled-service/route.ts:84`
- `src/app/api/mobile/owner/trucks/[id]/scheduled-service/route.ts:206`
- `src/app/api/mobile/owner/trucks/[id]/scheduled-service/route.ts:319`
- `src/app/api/mobile/owner/trucks/[id]/route.ts:40`
- `src/app/api/mobile/owner/trucks/[id]/route.ts:202`
- `src/app/api/mobile/owner/trucks/[id]/maintenance/route.ts:39`
- `src/app/api/mobile/owner/trucks/[id]/maintenance/route.ts:157`
- `src/app/api/mobile/owner/trucks/route.ts:76`
- `src/app/api/mobile/owner/trucks/route.ts:143`
- `src/app/api/v1/carrier/stops/[id]/messages/route.ts:49`
- `src/app/api/v1/carrier/stops/[id]/messages/route.ts:76`
- `src/app/api/v1/carrier/stops/[id]/messages/route.ts:89`
- `src/app/api/v1/carrier/stops/[id]/messages/route.ts:201`
- `src/app/api/mobile/owner/safety/route.ts:49`
- `src/app/api/cron/workflow-notifications/route.ts:57`
- `src/app/api/cron/workflow-notifications/route.ts:81`
- `src/app/api/cron/workflow-notifications/route.ts:96`
- `src/app/api/cron/workflow-notifications/route.ts:121`
- `src/app/api/mobile/owner/routes/[id]/route.ts:44`
- `src/app/api/mobile/owner/routes/[id]/route.ts:140`
- `src/app/api/cron/workflow-digest/route.ts:50`
- `src/app/api/cron/workflow-digest/route.ts:73`
- `src/app/api/cron/workflow-digest/route.ts:93`
- `src/app/api/cron/workflow-digest/route.ts:164`
- `src/app/api/cron/workflow-digest/route.ts:173`
- `src/app/api/mobile/owner/routes/route.ts:61`
- `src/app/api/mobile/owner/routes/route.ts:208`
- `src/app/api/mobile/owner/profit-predictor/route.ts:66`
- `src/app/api/cron/send-reminders/route.ts:62`
- `src/app/api/mobile/owner/payroll/[id]/route.ts:41`
- `src/app/api/mobile/owner/payroll/route.ts:38`
- `src/app/api/mobile/owner/payroll/route.ts:175`
- `src/app/api/cron/digest-weekly-owner/route.ts:42`
- `src/app/api/mobile/owner/map/vehicles/route.ts:44`
- `src/app/api/mobile/owner/maintenance/route.ts:81`
- `src/app/api/cron/digest-daily-driver/route.ts:42`
- `src/app/api/cron/digest-compliance-30day/route.ts:42`
- `src/app/api/mobile/owner/loads/[id]/route.ts:53`
- `src/app/api/mobile/owner/loads/[id]/route.ts:177`
- `src/app/api/mobile/owner/loads/[id]/route.ts:206`
- `src/app/api/mobile/owner/loads/[id]/route.ts:243`
- `src/app/api/cron/automations/route.ts:179`
- `src/app/api/mobile/owner/loads/[id]/assign-truck/route.ts:55`
- `src/app/api/mobile/owner/loads/route.ts:65`
- `src/app/api/mobile/owner/loads/route.ts:185`
- `src/app/api/cron/auto-close-tickets/route.ts:53`
- `src/app/api/mobile/owner/invoices/[id]/route.ts:34`
- `src/app/api/mobile/owner/invoices/route.ts:39`
- `src/app/api/mobile/owner/invoices/route.ts:160`
- `src/app/api/mobile/owner/fuel/route.ts:37`
- `src/app/api/mobile/owner/fuel/route.ts:153`
- `src/app/api/driver-pay/me/settlements/[id]/dispute/route.ts:60`
- `src/app/api/driver-pay/me/settlements/[id]/dispute/route.ts:108`
- `src/app/api/mobile/owner/fleet-positions/route.ts:40`
- `src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts:50`
- `src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts:126`
- `src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts:143`
- `src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts:153`
- `src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts:164`
- `src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts:243`
- `src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts:286`
- `src/app/api/mobile/owner/fleet/messages/route.ts:44`
- `src/app/api/mobile/owner/fleet/messages/route.ts:93`
- `src/app/api/mobile/owner/fleet/messages/route.ts:115`
- `src/app/api/mobile/owner/fleet/messages/route.ts:129`
- `src/app/api/mobile/owner/fleet/messages/route.ts:278`
- `src/app/api/mobile/owner/fleet/messages/route.ts:303`
- `src/app/api/mobile/driver/tracking-token/route.ts:43`
- `src/app/(owner)/carrier/trips/[id]/stops/page.tsx:118`
- `src/app/api/mobile/owner/drivers/[id]/route.ts:83`
- `src/app/api/mobile/owner/drivers/[id]/route.ts:291`
- `src/app/(admin)/actions/tenants.ts:586`
- `src/app/api/mobile/owner/drivers/invite/route.ts:68`
- `src/app/api/mobile/owner/drivers/invite/route.ts:81`
- `src/app/api/mobile/owner/drivers/invite/route.ts:106`
- `src/app/api/mobile/owner/drivers/invite/route.ts:126`
- `src/app/api/gps/report/route.ts:88`
- `src/app/api/gps/report/route.ts:120`
- `src/app/(owner)/carrier/trips/[id]/page.tsx:137`
- `src/app/api/mobile/owner/drivers/active/route.ts:41`
- `src/app/(admin)/actions/automations.ts:107`
- `src/app/(admin)/actions/automations.ts:141`
- `src/app/(admin)/actions/automations.ts:151`
- `src/app/api/mobile/driver/route/route.ts:40`
- `src/lib/security/audit-log.ts:68`
- `src/app/api/mobile/owner/customers/route.ts:41`
- `src/app/api/mobile/owner/customers/route.ts:96`
- `src/app/api/mobile/owner/crm/[id]/route.ts:41`
- `src/app/api/mobile/owner/crm/[id]/route.ts:194`
- `src/app/api/mobile/owner/crm/route.ts:42`
- `src/app/api/mobile/driver/messages/unread-count/route.ts:49`
- `src/app/api/mobile/owner/compliance/route.ts:45`
- `src/app/api/driver/stops/[stopId]/messages/route.ts:66`
- `src/app/api/driver/stops/[stopId]/messages/route.ts:92`
- `src/app/api/driver/stops/[stopId]/messages/route.ts:105`
- `src/app/api/driver/stops/[stopId]/messages/route.ts:209`
- `src/app/api/driver/stops/[stopId]/messages/route.ts:219`
- `src/app/api/mobile/driver/messages/route-thread/route.ts:45`
- `src/app/api/mobile/driver/messages/route-thread/route.ts:114`
- `src/app/api/email-confirm/[token]/route.ts:54`
- `src/app/api/mobile/driver/loads/[id]/status/route.ts:98`
- `src/app/api/mobile/driver/loads/[id]/route.ts:48`
- `src/app/api/mobile/driver/documents/[id]/url/route.ts:48`
- `src/lib/onboarding/provision-tenant.ts:36`
- `src/app/api/mobile/driver/loads/[id]/revert/route.ts:59`
- `src/lib/onboarding/hydrate-tenant.ts:13`
- `src/lib/onboarding/hydrate-tenant.ts:36`
- `src/app/api/mobile/driver/loads/[id]/rate-confirmation/route.ts:53`
- `src/app/api/driver/gps-ping/route.ts:69`
- `src/app/api/mobile/driver/loads/route.ts:55`
- `src/app/api/mobile/driver/documents/route.ts:55`
- `src/app/api/mobile/driver/documents/route.ts:201`
- `src/lib/onboarding/activation-tracker.ts:48`
- `src/lib/onboarding/activation-tracker.ts:177`
- `src/app/api/mobile/driver/incidents/route.ts:38`
- `src/app/api/mobile/driver/incidents/route.ts:134`
- `src/app/api/track/[token]/route.ts:24`
- `src/app/api/track/[token]/route.ts:49`
- `src/app/(owner)/carrier/stops/[id]/page.tsx:91`
- `src/app/(owner)/carrier/stops/[id]/page.tsx:110`
- `src/app/(owner)/carrier/stops/[id]/page.tsx:153`
- `src/lib/notifications/send-push.ts:27`
- `src/lib/notifications/send-push.ts:68`
- `src/lib/notifications/send-push.ts:111`
- `src/lib/notifications/send-push.ts:158`
- `src/lib/automations/evaluator.ts:95`
- `src/lib/automations/evaluator.ts:203`
- `src/lib/email/sender-config.ts:135`
- `src/lib/geofencing/geofence-check.ts:46`
- `src/lib/geofencing/geofence-check.ts:81`
- `src/lib/geofencing/geofence-check.ts:97`
- `src/lib/geofencing/geofence-check.ts:138`
- `src/lib/geofencing/geofence-check.ts:153`
- `src/lib/geofencing/geofence-check.ts:184`
- `src/lib/geofencing/geofence-check.ts:214`
- `src/lib/geofencing/geofence-check.ts:230`
- `src/lib/email/send-geofence-alert.ts:52`
- `src/app/(driver)/tasks/[id]/page.tsx:95`
- `src/app/(driver)/tasks/[id]/page.tsx:207`
- `src/app/(driver)/actions/driver-routes.ts:202`
- `src/app/(driver)/tasks/page.tsx:148`
- `src/app/(driver)/actions/driver-dashboard.ts:74`
- `src/app/(driver)/actions/driver-dashboard.ts:86`
- `src/lib/db/repositories/tenant.repository.ts:33`
- `src/lib/db/repositories/tenant.repository.ts:66`
- `src/lib/db/repositories/tenant.repository.ts:87`
- `src/app/(owner)/carrier/dashboard/page.tsx:24`
- `src/app/(owner)/carrier/dashboard/page.tsx:30`
- `src/app/api/integrations/motive/sync/route.ts:54`
- `src/app/api/integrations/samsara/sync/route.ts:54`

Tests / scripts / seeds (22):

- `scripts/backfill/encrypt-carrier-driver-cdl.ts:45`
- `prisma/seed.ts:98`
- `prisma/seed.ts:131`
- `prisma/seed.ts:149`
- `prisma/seed.ts:161`
- `prisma/seed.ts:189`
- `prisma/seed.ts:198`
- `prisma/seed.ts:258`
- `prisma/seed.ts:284`
- `prisma/seed.ts:332`
- `prisma/seed.ts:366`
- `prisma/seed.ts:388`
- `prisma/seed.ts:456`
- `prisma/seed.ts:479`
- `prisma/seed.ts:501`
- `prisma/seed.ts:537`
- `scripts/backfill/backfill-driver-invitation-pii.ts:98`
- `scripts/refresh-template-cache.ts:144`
- `scripts/refresh-template-cache.ts:231`
- `src/lib/db/__tests__/driver-pay-tenant-isolation.test.ts:62`
- `src/lib/db/__tests__/driver-pay-tenant-isolation.test.ts:419`
- `src/lib/db/__tests__/driver-pay-tenant-isolation.test.ts:549`

</details>

<details><summary>Shape 2 — 8 site(s): <code>await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`</code></summary>

Runtime code (8):

- `src/app/api/mobile/owner/drivers/route.ts:62`
- `src/app/api/mobile/driver/tasks/route.ts:26`
- `src/app/api/mobile/owner/dashboard/route.ts:30`
- `src/app/api/mobile/driver/messages/route.ts:31`
- `src/app/api/mobile/driver/messages/route.ts:109`
- `src/app/api/mobile/driver/hos/route.ts:29`
- `src/app/api/mobile/driver/hos/route.ts:174`
- `src/app/api/mobile/driver/dashboard/route.ts:30`

</details>

<details><summary>Shape 3 — 8 site(s): <code>await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;</code></summary>

Runtime code (5):

- `src/lib/integrations/samsara.ts:109`
- `src/lib/integrations/samsara.ts:169`
- `src/lib/integrations/motive.ts:116`
- `src/lib/integrations/motive.ts:174`
- `src/lib/context/tenant-context.ts:101`

Tests / scripts / seeds (3):

- `prisma/seeds/safety-events.ts:133`
- `prisma/seeds/gps-locations.ts:124`
- `prisma/seeds/fuel-records.ts:106`

</details>

<details><summary>Shape 4 — 4 site(s): <code>"SELECT set_config('app.current_tenant_id', $1, false)",</code></summary>

Runtime code (2):

- `src/lib/context/tenant-context.ts:55`
- `src/lib/context/tenant-context.ts:81`

Tests / scripts / seeds (2):

- `scripts/audit/411-verify-set-config.ts:88`
- `scripts/audit/411-verify-set-config.ts:113`

</details>

<details><summary>Shape 5 — 2 site(s): <code>await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${appMeta.tenantId as string}, TRUE)</code></summary>

Runtime code (2):

- `src/app/api/auth/login/route.ts:74`
- `src/app/api/auth/login/route.ts:113`

</details>

<details><summary>Shape 6 — 1 site(s): <code>// Legitimate bypass_rls pattern: $executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`</code></summary>


Tests / scripts / seeds (1):

- `scripts/audit/raw-prisma-usage.ts:207`

</details>

<details><summary>Shape 7 — 1 site(s): <code>hit.lineText.includes("set_config('app.bypass_rls'")</code></summary>


Tests / scripts / seeds (1):

- `scripts/audit/raw-prisma-usage.ts:212`

</details>

<details><summary>Shape 8 — 1 site(s): <code>(fileContent.includes("set_config('app.bypass_rls'") ||</code></summary>


Tests / scripts / seeds (1):

- `scripts/audit/raw-prisma-usage.ts:267`

</details>

<details><summary>Shape 9 — 1 site(s): <code>fileContent.includes('set_config("app.bypass_rls"') ||</code></summary>


Tests / scripts / seeds (1):

- `scripts/audit/raw-prisma-usage.ts:268`

</details>

<details><summary>Shape 10 — 1 site(s): <code>fileContent.includes("set_config('app.bypass_rls','on'"))</code></summary>


Tests / scripts / seeds (1):

- `scripts/audit/raw-prisma-usage.ts:269`

</details>

<details><summary>Shape 11 — 1 site(s): <code>await (tx as any).$executeRawUnsafe("SELECT set_config('app.bypass_rls', 'on', TRUE)");</code></summary>


Tests / scripts / seeds (1):

- `src/__tests__/security/inspection-route-guard.test.ts:93`

</details>

<details><summary>Shape 12 — 1 site(s): <code>await tx.$executeRawUnsafe("SELECT set_config('app.bypass_rls', 'on', TRUE)");</code></summary>


Tests / scripts / seeds (1):

- `src/__tests__/security/inspection-route-guard.test.ts:205`

</details>

<details><summary>Shape 13 — 1 site(s): <code>* bypass_rls file-level check (set_config('app.bypass_rls', 'on', TRUE) is present).</code></summary>

Runtime code (1):

- `src/lib/security/audit-log.ts:13`

</details>

<details><summary>Shape 14 — 1 site(s): <code>"SELECT set_config('app.bypass_rls','on',true)",</code></summary>

Runtime code (1):

- `src/lib/notifications/audit-log.ts:48`

</details>

<details><summary>Shape 15 — 1 site(s): <code>prisma.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`,</code></summary>

Runtime code (1):

- `src/lib/auth/supabase.ts:147`

</details>

<details><summary>Shape 16 — 1 site(s): <code>* sets set_config('app.bypass_rls', 'on') inside each transaction and uses</code></summary>

Runtime code (1):

- `src/lib/auth/mobile-auth.ts:24`

</details>

<details><summary>Shape 17 — 1 site(s): <code>.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;</code></summary>

Runtime code (1):

- `src/lib/driver-pay/require-driver.ts:106`

</details>

<details><summary>Shape 18 — 1 site(s): <code>* [411-verify] firing SELECT set_config('app.current_tenant_id', &lt;uuid>, false)</code></summary>


Tests / scripts / seeds (1):

- `scripts/audit/411-verify-set-config.ts:13`

</details>

<details><summary>Shape 19 — 1 site(s): <code>console.log(`[411-verify] firing SELECT set_config('app.current_tenant_id', ${tenantId}, false)`);</code></summary>


Tests / scripts / seeds (1):

- `scripts/audit/411-verify-set-config.ts:111`

</details>

<details><summary>Shape 20 — 1 site(s): <code>await client.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [tenantId ?? '']);</code></summary>


Tests / scripts / seeds (1):

- `scripts/audit/app-user-connection-harness.ts:181`

</details>

<details><summary>Shape 21 — 1 site(s): <code>await client.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [tenantId]);</code></summary>


Tests / scripts / seeds (1):

- `scripts/audit/verify-app-user-role.ts:106`

</details>

<details><summary>Shape 22 — 1 site(s): <code>await client.query(`SELECT set_config('app.current_tenant_id', '', false)`);</code></summary>


Tests / scripts / seeds (1):

- `scripts/audit/verify-app-user-role.ts:133`

</details>

<details><summary>Shape 23 — 1 site(s): <code>`SELECT set_config('app.current_tenant_id', $1, false)`,</code></summary>


Tests / scripts / seeds (1):

- `scripts/audit/422-diagnose-tenant-policy.ts:172`

</details>

<details><summary>Shape 24 — 1 site(s): <code>await c1.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [tenantA]);</code></summary>


Tests / scripts / seeds (1):

- `scripts/audit/test-advisor-fix-isolation.ts:460`

</details>

<details><summary>Shape 25 — 1 site(s): <code>// Legitimate current_tenant_id pattern: $executeRaw`SELECT set_config('app.current_tenant_id', ...)</code></summary>


Tests / scripts / seeds (1):

- `scripts/audit/raw-prisma-usage.ts:221`

</details>

<details><summary>Shape 26 — 1 site(s): <code>hit.lineText.includes("set_config('app.current_tenant_id'")</code></summary>


Tests / scripts / seeds (1):

- `scripts/audit/raw-prisma-usage.ts:225`

</details>

<details><summary>Shape 27 — 1 site(s): <code>client.query("SELECT set_config('app.current_tenant_id', '', false)").catch((err) => {</code></summary>

Runtime code (1):

- `src/lib/db/prisma.ts:69`

</details>

<details><summary>Shape 28 — 1 site(s): <code>* SELECT set_config('app.current_tenant_id', &lt;tenantId>, false)</code></summary>

Runtime code (1):

- `src/lib/db/extensions/tenant-rls.ts:13`

</details>

#### 5.2 `app.bypass_rls` — occurrences that are not `set_config` calls

9 occurrences: annotations (`@bypass_rls reason:`), comments, audit-script patterns and test assertions. Full list:

- `scripts/audit/raw-prisma-usage.ts:217` — `reason: 'Legitimate bypass_rls admin/seed pattern (set_config app.bypass_rls)',`
- `src/__tests__/isolation/group-c-isolation.test.ts:156` — `// current_setting('app.bypass_rls', TRUE) = 'on'  (text, no cast)`
- `src/__tests__/isolation/group-c-isolation.test.ts:157` — `// NOT: current_setting('app.bypass_rls', TRUE)::boolean  (incorrect pattern)`
- `src/__tests__/isolation/group-c-isolation.test.ts:158` — `const bypassCondition = "current_setting('app.bypass_rls', TRUE) = 'on'";`
- `src/__tests__/isolation/group-b-isolation.test.ts:60` — `//   FOR ALL USING (current_setting('app.bypass_rls', TRUE) = 'on');`
- `src/__tests__/isolation/group-b-isolation.test.ts:61` — `const bypassCondition = "current_setting('app.bypass_rls', TRUE) = 'on'";`
- `src/__tests__/isolation/group-a-isolation.test.ts:59` — `it('bypass_rls_policy allows service-role queries (app.bypass_rls = on)', () => {`
- `src/__tests__/isolation/group-a-isolation.test.ts:63` — `//   FOR ALL USING (current_setting('app.bypass_rls', TRUE) = 'on');`
- `src/__tests__/isolation/group-a-isolation.test.ts:64` — `const bypassCondition = "current_setting('app.bypass_rls', TRUE) = 'on'";`

#### 5.3 `app.current_tenant_id` — occurrences that are not `set_config` calls

- `scripts/audit/411-verify-set-config.ts:92` — `SELECT current_setting('app.current_tenant_id', true) AS v`
- `prisma/rls-tenant-integrations.sql:3` — `USING ("tenantId" = current_setting('app.current_tenant_id', true)::uuid);`
- `scripts/audit/test-advisor-fix-isolation.ts:24` — `* - Uses raw pg.Pool (not Prisma) for explicit SET LOCAL app.current_tenant_id`
- `scripts/audit/test-advisor-fix-isolation.ts:84` — `await client.query(`SET LOCAL app.current_tenant_id = '${tenantId}'`);`
- `scripts/audit/raw-prisma-usage.ts:246` — `reason: 'Query inside tenantRawQuery() wrapper (sets app.current_tenant_id before query)',`
- `src/app/(driver)/actions/driver-routes.ts:38` — `* (app.current_tenant_id set for the session's tenant), not a bypass one.`
- `src/app/api/auth/login/route.ts:69` — `// Quick-423: set app.current_tenant_id GUC inside a tx before querying Tenant so`
- `prisma/migrations/20260515_pii_encryption_pr1/migration.sql:47` — `USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);`
- `prisma/migrations/20260515000001_db_security_standardization/migration.sql:14` — `SELECT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID;`
- `prisma/migrations/20260215000002_add_tags/migration.sql:68` — `CREATE POLICY "tenant_isolation_policy" ON "Tag" USING ("tenantId"::text = current_setting('app.current_tenant_id', TRUE));`
- `prisma/migrations/20260215000002_add_tags/migration.sql:75` — `CREATE POLICY "tenant_isolation_policy" ON "TagAssignment" USING ("tenantId"::text = current_setting('app.current_tenant_id', TRUE));`
- `prisma/migrations/00000000000000_init/migration.sql:53` — `SELECT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID;`
- `prisma/migrations/20260311000001_add_sysadmin_invoices/migration.sql:53` — `USING (current_setting('app.current_tenant_id', TRUE) IS NULL`
- `prisma/migrations/20260311000001_add_sysadmin_invoices/migration.sql:54` — `OR current_setting('app.current_tenant_id', TRUE) = '');`
- `prisma/migrations/20260311000001_add_sysadmin_invoices/migration.sql:58` — `USING (current_setting('app.current_tenant_id', TRUE) IS NULL`
- `prisma/migrations/20260311000001_add_sysadmin_invoices/migration.sql:59` — `OR current_setting('app.current_tenant_id', TRUE) = '');`
- `src/lib/db/prisma.ts:34` — `* initialises app.current_tenant_id to '' (empty string). This prevents stale`
- `src/lib/context/tenant-context.ts:37` — `* set_config to write the caller's tenantId into app.current_tenant_id on the pooled`
- `src/lib/context/tenant-context.ts:71` — `* It sets the app.current_tenant_id GUC (session scope) exactly like getTenantPrisma()`
- `src/lib/context/tenant-context.ts:93` — `* This helper wraps raw queries in a transaction that sets app.current_tenant_id first.`
- `src/lib/document-import/cache.ts:22` — `* `app.current_tenant_id` GUC, and applies the same `withTenantRLS` extension.`
- `src/lib/carrier/route-template-save.ts:142` — `* `routeTemplateStop` rows never had `app.current_tenant_id` set on the pooled`

#### 5.4 `RESET` and `DISCARD`

**No SQL `RESET` or `DISCARD` statement exists anywhere in the repository.** All five textual matches are English prose in comments or console output, not SQL:

- `prisma/seed.ts:94` — `console.log('⚠️  RESET MODE: Clearing all existing data...');`
- `prisma/seeds/seed-fleet-intelligence.ts:28` — `console.log('⚠️  RESET MODE: Clearing all existing fleet intelligence data...');`
- `scripts/audit/verify-app-user-role.ts:121` — `// Client. Reason: pgBouncer Session Pooler does NOT run DISCARD ALL between`
- `scripts/audit/app-user-connection-harness.ts:174` — `* the Session Pooler does NOT run DISCARD ALL between client sessions (see`
- `src/emails/_system/Shell.tsx:26` — `* THE BODY RESET IS THE OTHER HALF OF THE JOB`

#### 5.5 `bypass_rls_policy` in migration SQL

128 statements across 32 migration files define or reference `bypass_rls_policy`.
These are the policy DDL that Prompt 1 would drop. They are not application calls and are
not enumerated line-by-line here; the file list is reproducible with:

```
rg -n bypass_rls_policy apps/web/prisma/migrations
```

---

## Appendix — full route and server-action tables

### A. HTTP route handlers (272 files)

Sorted by risk, then path. `?` in Methods means the file exports handlers indirectly (wrapper or re-export).

| Route file | Methods | Guard | Guard class | Roles | Tenant source | Risk |
|---|---|---|---|---|---|---|
| `api/auth/accept-invitation/route.ts` | GET, POST | `NONE` | none | - | request header `x-tenant-id` + explicit arg + **RLS bypassed** | HIGH |
| `api/auth/login/route.ts` | POST | `NONE` | none | - | **RLS bypassed** | HIGH |
| `api/track/[token]/route.ts` | GET | `NONE` | none | - | **RLS bypassed** | HIGH |
| `api/cron/auto-close-tickets/route.ts` | GET | `CRON_SECRET+verifyCronSecret` | cron-secret | - | **RLS bypassed** | MEDIUM |
| `api/cron/automations/route.ts` | GET | `CRON_SECRET+verifyCronSecret` | cron-secret | - | **RLS bypassed** | MEDIUM |
| `api/cron/digest-compliance-30day/route.ts` | GET | `CRON_SECRET+verifyCronSecret` | cron-secret | - | **RLS bypassed** | MEDIUM |
| `api/cron/digest-daily-driver/route.ts` | GET | `CRON_SECRET+verifyCronSecret` | cron-secret | - | **RLS bypassed** | MEDIUM |
| `api/cron/digest-weekly-owner/route.ts` | GET | `CRON_SECRET+verifyCronSecret` | cron-secret | - | **RLS bypassed** | MEDIUM |
| `api/cron/send-reminders/route.ts` | GET | `CRON_SECRET+verifyCronSecret` | cron-secret | - | **RLS bypassed** | MEDIUM |
| `api/cron/workflow-digest/route.ts` | GET | `CRON_SECRET+verifyCronSecret` | cron-secret | - | **RLS bypassed** | MEDIUM |
| `api/cron/workflow-notifications/route.ts` | GET | `CRON_SECRET+verifyCronSecret` | cron-secret | - | **RLS bypassed** | MEDIUM |
| `api/documents/complete-upload/route.ts` | POST | `requireRole+getCurrentUser` | role-checked | OWNER,MANAGER | request header `x-tenant-id` | MEDIUM |
| `api/documents/delete/[id]/route.ts` | DELETE | `requireRole` | role-checked | OWNER,MANAGER | request header `x-tenant-id` | MEDIUM |
| `api/documents/download-url/[id]/route.ts` | GET | `requireRole+getSession+requireRestrictedDocAccess` | role-checked | OWNER,MANAGER,DRIVER | request header `x-tenant-id` | MEDIUM |
| `api/documents/multipart/complete/route.ts` | POST | `requireRole+getCurrentUser` | role-checked | OWNER,MANAGER | request header `x-tenant-id` | MEDIUM |
| `api/documents/multipart/initiate/route.ts` | POST | `requireRole` | role-checked | OWNER,MANAGER | request header `x-tenant-id` | MEDIUM |
| `api/documents/multipart/part-url/route.ts` | POST | `requireRole` | role-checked | OWNER,MANAGER | request header `x-tenant-id` | MEDIUM |
| `api/documents/request-upload-url/route.ts` | POST | `requireRole` | role-checked | OWNER,MANAGER | request header `x-tenant-id` | MEDIUM |
| `api/documents/upload/route.ts` | POST | `requireRole+getCurrentUser` | role-checked | OWNER,MANAGER | request header `x-tenant-id` | MEDIUM |
| `api/driver-pay/assignments/[assignmentId]/components/[componentId]/attachments/[attachmentId]/download-url/route.ts` | GET | `getSession` | auth-only | - | request header `x-tenant-id` | MEDIUM |
| `api/driver-pay/assignments/[assignmentId]/components/[componentId]/attachments/[attachmentId]/route.ts` | DELETE | `getSession` | auth-only | - | request header `x-tenant-id` | MEDIUM |
| `api/driver-pay/assignments/[assignmentId]/components/[componentId]/route.ts` | PATCH, DELETE | `getSession` | auth-only | - | request header `x-tenant-id` | MEDIUM |
| `api/driver-pay/assignments/[assignmentId]/components/route.ts` | GET, POST | `getSession` | auth-only | - | request header `x-tenant-id` | MEDIUM |
| `api/driver-pay/assignments/[assignmentId]/components/suggest-detention/route.ts` | GET | `getSession` | auth-only | - | request header `x-tenant-id` | MEDIUM |
| `api/driver-pay/assignments/[assignmentId]/corrections/route.ts` | POST | `getSession` | auth-only | DRIVER | request header `x-tenant-id` | MEDIUM |
| `api/driver-pay/assignments/[assignmentId]/transitions/route.ts` | POST | `getSession` | auth-only | DRIVER | request header `x-tenant-id` | MEDIUM |
| `api/driver-pay/drivers/[driverId]/bonuses/[bonusId]/route.ts` | PUT, PATCH | `getSession` | auth-only | SYSTEM_ADMIN,OWNER,MANAGER | request header `x-tenant-id` | MEDIUM |
| `api/driver-pay/drivers/[driverId]/deductions/[deductionId]/route.ts` | PUT, PATCH | `getSession` | auth-only | SYSTEM_ADMIN,OWNER,MANAGER | request header `x-tenant-id` | MEDIUM |
| `api/driver-pay/me/settlements/[id]/dispute/route.ts` | POST | `requireDriverContext` | role-checked | - | session/token + **RLS bypassed** | MEDIUM |
| `api/driver-pay/pending-queue/route.ts` | GET | `getSession` | auth-only | DRIVER | request header `x-tenant-id` | MEDIUM |
| `api/driver/gps-ping/route.ts` | POST | `getSession` | auth-only | - | request header `x-tenant-id` + session/token + **RLS bypassed** | MEDIUM |
| `api/driver/stops/[stopId]/messages/route.ts` | GET, POST | `requireRole+getSession` | role-checked | DRIVER | request header `x-tenant-id` + session/token + **RLS bypassed** | MEDIUM |
| `api/email-confirm/[token]/route.ts` | GET | `verifyEmailToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/gps/report/route.ts` | POST | `validateMobileToken+getSession` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/integrations/motive/sync/route.ts` | POST | `validateMobileToken+CRON_SECRET+getSession+verifyCronSecret` | cron-secret | - | session/token + **RLS bypassed** | MEDIUM |
| `api/integrations/samsara/sync/route.ts` | POST | `validateMobileToken+CRON_SECRET+getSession+verifyCronSecret` | cron-secret | - | session/token + **RLS bypassed** | MEDIUM |
| `api/mobile/driver/dashboard/route.ts` | GET | `withMobileAuth` | role-checked | - | **RLS bypassed** | MEDIUM |
| `api/mobile/driver/documents/[id]/url/route.ts` | GET | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/driver/documents/route.ts` | GET, POST | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/driver/hos/route.ts` | GET, POST | `withMobileAuth` | role-checked | - | **RLS bypassed** | MEDIUM |
| `api/mobile/driver/incidents/route.ts` | GET, POST | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/driver/loads/[id]/rate-confirmation/route.ts` | GET | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/driver/loads/[id]/revert/route.ts` | PATCH | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/driver/loads/[id]/route.ts` | GET | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/driver/loads/[id]/status/route.ts` | POST | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/driver/loads/route.ts` | GET | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/driver/messages/route-thread/route.ts` | GET, POST | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/driver/messages/route.ts` | GET, POST | `withMobileAuth` | role-checked | - | **RLS bypassed** | MEDIUM |
| `api/mobile/driver/messages/unread-count/route.ts` | GET | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/driver/route/route.ts` | GET | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/driver/tasks/route.ts` | GET | `withMobileAuth` | role-checked | - | **RLS bypassed** | MEDIUM |
| `api/mobile/driver/tracking-token/route.ts` | GET | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/owner/compliance/route.ts` | GET | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/owner/crm/[id]/route.ts` | GET, PATCH | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/owner/crm/route.ts` | GET | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/owner/customers/route.ts` | GET, POST | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/owner/dashboard/route.ts` | GET | `withMobileAuth` | role-checked | - | **RLS bypassed** | MEDIUM |
| `api/mobile/owner/drivers/[id]/route.ts` | GET, PATCH | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/owner/drivers/active/route.ts` | GET | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/owner/drivers/invite/route.ts` | POST | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/owner/drivers/route.ts` | GET | `withMobileAuth` | role-checked | - | **RLS bypassed** | MEDIUM |
| `api/mobile/owner/fleet-positions/route.ts` | GET | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/owner/fleet/messages/[recipientId]/route.ts` | GET, POST | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/owner/fleet/messages/route.ts` | GET, POST | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/owner/fuel/route.ts` | GET, POST | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/owner/invoices/[id]/route.ts` | GET | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/owner/invoices/route.ts` | GET, POST | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/owner/loads/[id]/assign-truck/route.ts` | PATCH | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/owner/loads/[id]/route.ts` | GET, PATCH | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/owner/loads/route.ts` | GET, POST | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/owner/maintenance/route.ts` | GET | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/owner/map/vehicles/route.ts` | GET | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/owner/payroll/[id]/route.ts` | GET | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/owner/payroll/route.ts` | GET, POST | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/owner/profit-predictor/route.ts` | POST | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/owner/routes/[id]/route.ts` | GET, PATCH | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/owner/routes/route.ts` | GET, POST | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/owner/safety/route.ts` | GET | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/owner/trucks/[id]/maintenance/route.ts` | GET, POST | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/owner/trucks/[id]/route.ts` | GET, PATCH | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/owner/trucks/[id]/scheduled-service/route.ts` | GET, POST, PATCH | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/owner/trucks/route.ts` | POST, GET | `validateMobileToken` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/mobile/support/ticket/route.ts` | POST | `validateMobileToken` | auth-only | - | session/token + **RLS bypassed** | MEDIUM |
| `api/push-tokens/route.ts` | POST | `validateMobileToken` | auth-only | - | session/token + **RLS bypassed** | MEDIUM |
| `api/support/upload-attachment/route.ts` | POST | `requireAuth` | auth-only | - | request header `x-tenant-id` | MEDIUM |
| `api/v1/carrier/stops/[id]/messages/route.ts` | GET, POST | `getSession` | auth-only | - | request header `x-tenant-id` + session/token + **RLS bypassed** | MEDIUM |
| `api/v1/messages/[id]/audio-url/route.ts` | GET | `getSession` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/v1/messages/broadcast/route.ts` | POST | `getSession` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/v1/messages/conversations/route.ts` | GET | `getSession` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/v1/messages/send/route.ts` | POST | `getSession` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/v1/messages/thread/route.ts` | GET | `getSession` | auth-only | - | **RLS bypassed** | MEDIUM |
| `api/driver-pay/assignments/[assignmentId]/components/[componentId]/attachments/route.ts` | GET, POST | `getSession` | auth-only | - | request header `x-tenant-id` + session/token | LOW-MED |
| `api/driver-pay/drivers/[driverId]/bonuses/route.ts` | GET, POST | `getSession` | auth-only | SYSTEM_ADMIN,OWNER,MANAGER | request header `x-tenant-id` + session/token | LOW-MED |
| `api/driver-pay/drivers/[driverId]/deductions/route.ts` | GET, POST | `getSession` | auth-only | SYSTEM_ADMIN,OWNER,MANAGER | request header `x-tenant-id` + session/token | LOW-MED |
| `api/driver-pay/reports/accessorial-spend/route.ts` | GET | `getSession` | auth-only | - | request header `x-tenant-id` + session/token | LOW-MED |
| `api/driver-pay/reports/component-type/route.ts` | GET | `getSession` | auth-only | - | request header `x-tenant-id` + session/token | LOW-MED |
| `api/driver-pay/reports/deduction-balances/route.ts` | GET | `getSession` | auth-only | - | request header `x-tenant-id` + session/token | LOW-MED |
| `api/driver-pay/reports/drivers/[driverId]/route.ts` | GET | `getSession` | auth-only | - | request header `x-tenant-id` + session/token | LOW-MED |
| `api/driver-pay/reports/load-profitability/route.ts` | GET | `getSession` | auth-only | - | request header `x-tenant-id` + session/token | LOW-MED |
| `api/driver-pay/reports/operational-metrics/route.ts` | GET | `getSession` | auth-only | - | request header `x-tenant-id` + session/token | LOW-MED |
| `api/driver-pay/reports/override-audit/route.ts` | GET | `getSession` | auth-only | - | request header `x-tenant-id` + session/token | LOW-MED |
| `api/driver-pay/reports/overtime-exposure/route.ts` | GET | `getSession` | auth-only | - | request header `x-tenant-id` + session/token | LOW-MED |
| `api/driver-pay/reports/overview/route.ts` | GET | `getSession` | auth-only | - | request header `x-tenant-id` + session/token | LOW-MED |
| `api/driver-pay/reports/settlement-history/route.ts` | GET | `getSession` | auth-only | - | request header `x-tenant-id` + session/token | LOW-MED |
| `api/driver-pay/reports/settlements/route.ts` | GET | `getSession` | auth-only | - | request header `x-tenant-id` + session/token | LOW-MED |
| `api/driver-pay/settlements/[settlementId]/finalize/route.ts` | POST | `getSession` | auth-only | OWNER,SYSTEM_ADMIN | request header `x-tenant-id` + session/token | LOW-MED |
| `api/driver-pay/settlements/[settlementId]/mark-paid/route.ts` | POST | `getSession` | auth-only | OWNER,SYSTEM_ADMIN | request header `x-tenant-id` + session/token | LOW-MED |
| `api/driver-pay/settlements/[settlementId]/pdf/route.ts` | GET | `getSession` | auth-only | SYSTEM_ADMIN,OWNER,MANAGER,DRIVER | request header `x-tenant-id` + session/token | LOW-MED |
| `api/driver-pay/settlements/[settlementId]/route.ts` | GET | `getSession` | auth-only | SYSTEM_ADMIN,OWNER,MANAGER,DRIVER | request header `x-tenant-id` + session/token | LOW-MED |
| `api/driver-pay/settlements/[settlementId]/void/route.ts` | POST | `getSession` | auth-only | OWNER,MANAGER,SYSTEM_ADMIN | request header `x-tenant-id` + session/token | LOW-MED |
| `api/driver-pay/settlements/generate/route.ts` | POST | `getSession` | auth-only | OWNER,SYSTEM_ADMIN | request header `x-tenant-id` + session/token | LOW-MED |
| `api/driver-pay/settlements/route.ts` | GET | `getSession` | auth-only | SYSTEM_ADMIN,OWNER,MANAGER,DRIVER | request header `x-tenant-id` + session/token | LOW-MED |
| `api/driver/notifications/mark-read/route.ts` | PATCH | `getSession` | auth-only | - | request header `x-tenant-id` + session/token | LOW-MED |
| `api/driver/notifications/route.ts` | GET | `getSession` | auth-only | - | request header `x-tenant-id` + session/token | LOW-MED |
| `api/mobile/carrier/driver/dispatches/[id]/expenses/route.ts` | POST | `validateMobileToken` | auth-only | - | explicit arg + session/token | LOW-MED |
| `api/mobile/carrier/driver/dispatches/[id]/route.ts` | GET | `validateMobileToken` | auth-only | - | request header `x-tenant-id` + explicit arg + session/token | LOW-MED |
| `api/mobile/carrier/driver/dispatches/route.ts` | GET | `validateMobileToken` | auth-only | - | request header `x-tenant-id` + explicit arg + session/token | LOW-MED |
| `api/mobile/carrier/driver/stops/[stopId]/documents/route.ts` | POST | `validateMobileToken` | auth-only | - | explicit arg + session/token | LOW-MED |
| `api/mobile/carrier/owner/dispatches/[id]/route.ts` | GET | `validateMobileToken` | auth-only | - | request header `x-tenant-id` + explicit arg + session/token | LOW-MED |
| `api/mobile/carrier/owner/document-imports/[id]/commit/route.ts` | GET, POST | `validateMobileToken` | auth-only | - | session/token | LOW-MED |
| `api/mobile/carrier/owner/document-imports/[id]/end-stop/route.ts` | GET, POST | `validateMobileToken` | auth-only | - | session/token | LOW-MED |
| `api/mobile/carrier/owner/document-imports/[id]/extract/route.ts` | POST | `validateMobileToken` | auth-only | - | session/token | LOW-MED |
| `api/mobile/carrier/owner/document-imports/[id]/optimisation/route.ts` | GET, POST | `validateMobileToken` | auth-only | - | session/token | LOW-MED |
| `api/mobile/carrier/owner/document-imports/[id]/pages/route.ts` | PUT | `validateMobileToken` | auth-only | - | session/token | LOW-MED |
| `api/mobile/carrier/owner/document-imports/[id]/resolution/client/route.ts` | POST | `validateMobileToken` | auth-only | - | session/token | LOW-MED |
| `api/mobile/carrier/owner/document-imports/[id]/resolution/contract/route.ts` | POST | `validateMobileToken` | auth-only | - | session/token | LOW-MED |
| `api/mobile/carrier/owner/document-imports/[id]/stops/bulk/route.ts` | POST | `validateMobileToken` | auth-only | - | session/token | LOW-MED |
| `api/mobile/carrier/owner/document-imports/[id]/stops/facility/route.ts` | POST | `validateMobileToken` | auth-only | - | session/token | LOW-MED |
| `api/mobile/carrier/owner/document-imports/[id]/stops/order/route.ts` | POST | `validateMobileToken` | auth-only | - | session/token | LOW-MED |
| `api/mobile/carrier/owner/document-imports/[id]/stops/review/route.ts` | GET, PATCH | `validateMobileToken` | auth-only | - | session/token | LOW-MED |
| `api/mobile/carrier/owner/document-imports/[id]/stops/route.ts` | GET, POST | `validateMobileToken` | auth-only | - | session/token | LOW-MED |
| `api/mobile/carrier/owner/document-imports/[id]/template/offer/route.ts` | GET, POST | `validateMobileToken` | auth-only | - | session/token | LOW-MED |
| `api/mobile/carrier/owner/document-imports/[id]/template/route.ts` | GET, POST | `validateMobileToken` | auth-only | - | session/token | LOW-MED |
| `api/mobile/support/upload-screenshot/route.ts` | POST | `validateMobileToken` | auth-only | - | session/token | LOW-MED |
| `api/reports/payroll-export/route.ts` | POST | `getSession` | auth-only | OWNER,SYSTEM_ADMIN | request header `x-tenant-id` + session/token | LOW-MED |
| `api/user/grid-preferences/[gridId]/route.ts` | GET, PUT | `getSession` | auth-only | - | bare client (untenanted) | LOW-MED |
| `api/user/grid-views/[gridId]/[viewId]/route.ts` | PUT, DELETE | `getSession` | auth-only | - | bare client (untenanted) | LOW-MED |
| `api/user/grid-views/[gridId]/route.ts` | GET, POST | `getSession` | auth-only | - | bare client (untenanted) | LOW-MED |
| `api/v1/carrier/clients/[id]/documents/route.ts` | GET | `getSession` | auth-only | - | request header `x-tenant-id` + session/token | LOW-MED |
| `api/v1/carrier/clients/[id]/route.ts` | GET, PATCH, DELETE | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/clients/route.ts` | GET, POST | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/compliance-alerts/route.ts` | GET | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/contracts/[id]/documents/route.ts` | GET | `getSession` | auth-only | - | request header `x-tenant-id` + session/token | LOW-MED |
| `api/v1/carrier/contracts/[id]/loads/route.ts` | GET | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/contracts/[id]/route.ts` | GET, PATCH, DELETE | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/contracts/route.ts` | GET, POST | `getSession` | auth-only | - | request header `x-tenant-id` + session/token | LOW-MED |
| `api/v1/carrier/dashboard/activity/route.ts` | GET | `getSession` | auth-only | - | explicit arg + session/token | LOW-MED |
| `api/v1/carrier/dashboard/alerts/route.ts` | GET | `getSession` | auth-only | - | explicit arg + session/token | LOW-MED |
| `api/v1/carrier/dashboard/drivers-status/route.ts` | GET | `getSession` | auth-only | - | explicit arg + session/token | LOW-MED |
| `api/v1/carrier/dashboard/kpi/route.ts` | GET | `getSession` | auth-only | - | request header `x-tenant-id` + explicit arg + session/token | LOW-MED |
| `api/v1/carrier/dashboard/messages/route.ts` | GET, POST | `getSession` | auth-only | - | explicit arg + session/token | LOW-MED |
| `api/v1/carrier/dispatches/[id]/inspection/checklist/route.ts` | GET, POST | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/dispatches/[id]/inspection/route.ts` | GET | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/dispatches/[id]/remove-load/route.ts` | POST | `getSession` | auth-only | - | request header `x-tenant-id` + session/token | LOW-MED |
| `api/v1/carrier/dispatches/[id]/route.ts` | GET, PATCH | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/dispatches/[id]/start/route.ts` | POST | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/dispatches/[id]/status/route.ts` | PATCH | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/dispatches/route.ts` | GET, POST | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/document-imports/[id]/commit/route.ts` | GET, POST | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/document-imports/[id]/end-stop/route.ts` | GET, POST | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/document-imports/[id]/extract/route.ts` | POST | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/document-imports/[id]/optimisation/route.ts` | GET, POST | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/document-imports/[id]/pages/route.ts` | PUT | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/document-imports/[id]/resolution/client/route.ts` | POST | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/document-imports/[id]/resolution/contract/route.ts` | POST | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/document-imports/[id]/resolution/route.ts` | GET, PATCH | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/document-imports/[id]/route.ts` | GET, DELETE | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/document-imports/[id]/stops/bulk/route.ts` | POST | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/document-imports/[id]/stops/facility/route.ts` | POST | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/document-imports/[id]/stops/order/route.ts` | POST | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/document-imports/[id]/stops/review/route.ts` | GET, PATCH | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/document-imports/[id]/stops/route.ts` | GET, POST | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/document-imports/[id]/template/offer/route.ts` | GET, POST | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/document-imports/[id]/template/route.ts` | GET, POST | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/document-imports/route.ts` | GET, POST | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/document-imports/upload-url/route.ts` | POST | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/document-types/[id]/route.ts` | PATCH, DELETE | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/document-types/route.ts` | GET, POST | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/documents/[id]/route.ts` | DELETE, PATCH | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/documents/[id]/signed-url/route.ts` | GET | `getSession` | auth-only | - | request header `x-tenant-id` + session/token | LOW-MED |
| `api/v1/carrier/documents/route.ts` | POST, GET | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/expenses/[id]/approve/route.ts` | PATCH | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/expenses/[id]/route.ts` | GET, PATCH, DELETE | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/expenses/route.ts` | GET, POST | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/facilities/[id]/route.ts` | GET, PATCH, DELETE | `getSession` | auth-only | - | explicit arg + session/token | LOW-MED |
| `api/v1/carrier/facilities/route.ts` | GET, POST | `getSession` | auth-only | - | explicit arg + session/token | LOW-MED |
| `api/v1/carrier/fleet/drivers/[id]/resend-invitation/route.ts` | POST | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/fleet/drivers/[id]/restore-access/route.ts` | POST | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/fleet/drivers/[id]/revoke-access/route.ts` | POST | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/fleet/drivers/[id]/route.ts` | GET, DELETE, PATCH | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/fleet/drivers/route.ts` | GET, POST | `getSession` | auth-only | - | request header `x-tenant-id` + explicit arg + session/token | LOW-MED |
| `api/v1/carrier/fleet/trucks/[id]/photo-upload-url/route.ts` | POST | `getSession` | auth-only | - | request header `x-tenant-id` + session/token | LOW-MED |
| `api/v1/carrier/fleet/trucks/[id]/photo-view-url/route.ts` | GET | `getSession` | auth-only | - | request header `x-tenant-id` + session/token | LOW-MED |
| `api/v1/carrier/fleet/trucks/[id]/route.ts` | GET, PATCH | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/fleet/trucks/route.ts` | GET, POST | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/live-board/route.ts` | GET | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/live-map/history/route.ts` | GET | `getSession` | auth-only | - | request header `x-tenant-id` + session/token | LOW-MED |
| `api/v1/carrier/live-map/trips/route.ts` | GET | `getSession` | auth-only | - | request header `x-tenant-id` + session/token | LOW-MED |
| `api/v1/carrier/live-map/vehicles/route.ts` | GET | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/loads/[id]/cancel/route.ts` | POST | `getSession` | auth-only | - | request header `x-tenant-id` + session/token | LOW-MED |
| `api/v1/carrier/loads/[id]/revenue/route.ts` | PATCH | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/loads/[id]/route.ts` | GET, PATCH | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/loads/route.ts` | GET, POST | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/notifications/mark-read/route.ts` | PATCH | `getSession` | auth-only | - | request header `x-tenant-id` + session/token | LOW-MED |
| `api/v1/carrier/notifications/route.ts` | GET | `getSession` | auth-only | - | request header `x-tenant-id` + session/token | LOW-MED |
| `api/v1/carrier/pay-records/[id]/approve/route.ts` | PATCH | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/pay-records/[id]/mark-paid/route.ts` | PATCH | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/pay-records/[id]/recalculate/route.ts` | PATCH | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/pay-records/[id]/void/route.ts` | PATCH | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/pay-records/route.ts` | GET | `getSession` | auth-only | - | request header `x-tenant-id` + session/token | LOW-MED |
| `api/v1/carrier/route-templates/[id]/generate/route.ts` | POST | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/route-templates/[id]/route.ts` | GET, PATCH, DELETE | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/route-templates/active/route.ts` | GET | `getSession` | auth-only | - | request header `x-tenant-id` + session/token | LOW-MED |
| `api/v1/carrier/route-templates/route.ts` | GET, POST | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/stops/[id]/arrived/route.ts` | PATCH | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/stops/[id]/complete/route.ts` | PATCH | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/stops/[id]/route.ts` | GET, PATCH | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/stops/[id]/skip/route.ts` | PATCH | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/stops/route.ts` | GET, POST | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/templates/[id]/optimisation/route.ts` | GET, POST | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/trips/[id]/loads/route.ts` | POST | `getSession` | auth-only | - | session/token | LOW-MED |
| `api/v1/carrier/trips/[id]/reorder/route.ts` | POST | `getSession` | auth-only | - | session/token | LOW-MED |
| `(admin)/api/docs-index/route.ts` | GET | `isSystemAdmin` | admin-only | - | none | LOW |
| `api/admin/support/screenshot/route.ts` | GET | `requireAuth+isSystemAdmin` | admin-only | - | none | LOW |
| `api/admin/tenants/[id]/users/route.ts` | GET | `requireAuth+isSystemAdmin` | admin-only | - | bare client (untenanted) | LOW |
| `api/admin/users/[id]/role/route.ts` | PATCH | `requireAuth+isSystemAdmin` | admin-only | - | session/token | LOW |
| `api/auth/admin-reset-password/route.ts` | POST | `requireAuth+isSystemAdmin` | admin-only | - | none | LOW |
| `api/cron/carrier-auto-dispatch/route.ts` | GET | `CRON_SECRET+verifyCronSecret` | cron-secret | - | bare client (untenanted) | LOW |
| `api/cron/carrier-compliance-alerts/route.ts` | GET | `CRON_SECRET+verifyCronSecret` | cron-secret | - | bare client (untenanted) | LOW |
| `api/cron/cleanup-quarantine/route.ts` | GET | `CRON_SECRET+verifyCronSecret` | cron-secret | - | none | LOW |
| `api/cron/mark-overdue-invoices/route.ts` | GET | `CRON_SECRET+verifyCronSecret` | cron-secret | - | bare client (untenanted) | LOW |
| `api/cron/purge-deleted/route.ts` | GET | `verifyCronSecret` | cron-secret | - | bare client (untenanted) | LOW |
| `api/cron/trip-reminders/route.ts` | GET | `CRON_SECRET+verifyCronSecret` | cron-secret | - | explicit arg | LOW |
| `api/driver-pay/me/bonuses/route.ts` | GET | `requireDriverContext` | role-checked | - | session/token | LOW |
| `api/driver-pay/me/current-period/route.ts` | GET | `requireDriverContext` | role-checked | - | session/token | LOW |
| `api/driver-pay/me/deductions/route.ts` | GET | `requireDriverContext` | role-checked | - | session/token | LOW |
| `api/driver-pay/me/settlements/[id]/pdf/route.ts` | GET | `requireDriverContext` | role-checked | - | session/token | LOW |
| `api/driver-pay/me/settlements/[id]/route.ts` | GET | `requireDriverContext` | role-checked | - | session/token | LOW |
| `api/driver-pay/me/settlements/route.ts` | GET | `requireDriverContext` | role-checked | - | session/token | LOW |
| `api/driver/stops/[stopId]/documents/route.ts` | POST, GET | `requireRole+getSession` | role-checked | DRIVER | request header `x-tenant-id` + session/token | LOW |
| `api/geocoding/autocomplete/route.ts` | POST | `validateMobileToken+getSession` | auth-only | - | none | LOW |
| `api/geocoding/directions/route.ts` | POST | `validateMobileToken+getSession` | auth-only | - | none | LOW |
| `api/geocoding/distance/route.ts` | POST | `validateMobileToken+getSession` | auth-only | - | none | LOW |
| `api/gps/locations/route.ts` | GET | `getSession` | auth-only | OWNER,MANAGER | none | LOW |
| `api/mobile/carrier/driver/dispatches/[id]/inspection/checklist/route.ts` | POST | `withMobileAuth` | role-checked | - | none | LOW |
| `api/mobile/carrier/driver/dispatches/[id]/inspection/route.ts` | GET | `withMobileAuth` | role-checked | - | none | LOW |
| `api/mobile/carrier/driver/dispatches/[id]/inspection/submit/route.ts` | POST | `withMobileAuth` | role-checked | - | none | LOW |
| `api/mobile/carrier/driver/dispatches/[id]/start/route.ts` | POST | `withMobileAuth` | role-checked | - | none | LOW |
| `api/mobile/carrier/owner/document-imports/[id]/resolution/route.ts` | GET, PATCH | `validateMobileToken+withMobileAuth` | role-checked | - | session/token | LOW |
| `api/mobile/carrier/owner/document-imports/[id]/route.ts` | GET, DELETE | `validateMobileToken+withMobileAuth` | role-checked | - | session/token | LOW |
| `api/mobile/carrier/owner/document-imports/route.ts` | GET, POST | `withMobileAuth` | role-checked | - | session/token | LOW |
| `api/mobile/carrier/owner/document-imports/upload-url/route.ts` | POST | `withMobileAuth` | role-checked | - | session/token | LOW |
| `api/mobile/driver/documents/upload-url/route.ts` | POST | `validateMobileToken` | auth-only | - | none | LOW |
| `api/mobile/driver/incidents/upload-photo/route.ts` | POST | `validateMobileToken` | auth-only | - | none | LOW |
| `api/mobile/driver/messages/mark-read/route.ts` | POST | `validateMobileToken` | auth-only | - | none | LOW |
| `api/mobile/driver/tasks/[id]/complete/route.ts` | POST | `withMobileAuth` | role-checked | - | none | LOW |
| `api/mobile/driver/tasks/[id]/fail/route.ts` | POST | `withMobileAuth` | role-checked | - | none | LOW |
| `api/mobile/driver/tasks/[id]/skip/route.ts` | POST | `withMobileAuth` | role-checked | - | none | LOW |
| `api/mobile/driver/tasks/upload-photo/route.ts` | POST | `withMobileAuth` | role-checked | - | none | LOW |
| `api/v1/carrier/dispatches/[id]/inspection/override/route.ts` | POST | `requireRole+getSession` | role-checked | OWNER,MANAGER | session/token | LOW |
| `api/v1/carrier/reports/aging/route.ts` | GET | `resolveReportAccess` | role-checked | - | none | LOW |
| `api/v1/carrier/reports/driver-pay/route.ts` | GET | `resolveReportAccess` | role-checked | - | none | LOW |
| `api/v1/carrier/reports/performance/route.ts` | GET | `resolveReportAccess` | role-checked | - | none | LOW |
| `api/v1/carrier/reports/revenue/route.ts` | GET | `resolveReportAccess` | role-checked | - | none | LOW |
| `api/v1/carrier/reports/todays-trips/route.ts` | GET | `resolveReportAccess` | role-checked | - | none | LOW |
| `api/v1/messages/upload-audio/route.ts` | POST | `getSession` | auth-only | - | none | LOW |
| `api/warmup/route.ts` | GET | `CRON_SECRET+verifyCronSecret` | cron-secret | - | bare client (untenanted) | LOW |
| `api/auth/callback/route.ts` | GET | `NONE` | none | - | none | INFO (public by design) |
| `api/auth/logout/route.ts` | POST | `NONE` | none | - | none | INFO (public by design) |
| `api/auth/me/route.ts` | GET | `NONE` | none | - | none | INFO (public by design) |
| `api/health/route.ts` | GET | `NONE` | none | - | none | INFO (public by design) |
| `api/trpc/[trpc]/route.ts` | ? | `NONE` | none | - | none | INFO (public by design) |

### C. Server action files (62 files with `use server`)

| File | Exported actions | Guard | Guard class | Roles | Tenant source | Risk |
|---|---|---|---|---|---|---|
| `app/(auth)/sign-up/actions.tsx` | signUpAction | `NONE` | none | - | **RLS bypassed** | HIGH |
| `app/(owner)/actions/activation-congrats.ts` | markCongratsShown | `NONE` | none | - | request header `x-tenant-id` | HIGH |
| `actions/doc-feedback.ts` | submitDocFeedback | `requireAuth` | auth-only | - | request header `x-tenant-id` + **RLS bypassed** | MEDIUM |
| `actions/support-tickets.ts` | uploadSupportScreenshot,createSupportTicket,getMyTickets,getAllTickets,updateTicketStatus,getTicketById,addOwnerReply,ad | `requireAuth+requireAdminAccess+isSystemAdmin+getSession` | admin-only | - | request header `x-tenant-id` + session/token + **RLS bypassed** | MEDIUM |
| `app/(admin)/actions/automations.ts` | getAutomationRules,getRuleWithRuns,toggleRuleActive,manualTriggerRule | `requireAuth+requireAdminAccess+isSystemAdmin` | admin-only | - | **RLS bypassed** | MEDIUM |
| `app/(admin)/actions/tenants.ts` | getAllTenants,createTenant,suspendTenant,reactivateTenant,getSystemMetrics,getTenantById,resendOwnerInvitation,updateTen | `requireAuth+requireAdminAccess+isSystemAdmin` | admin-only | - | session/token + **RLS bypassed** | MEDIUM |
| `app/(driver)/actions/driver-dashboard.ts` | getDriverDashboardData,getDriverQuickActionBadges | `requireRole+getCurrentUser` | role-checked | DRIVER | request header `x-tenant-id` + session/token + **RLS bypassed** | MEDIUM |
| `app/(driver)/actions/driver-documents.ts` | getMyRouteDocuments,getMyTruckDocuments,getDriverDownloadUrl | `requireRole+getCurrentUser` | role-checked | DRIVER | request header `x-tenant-id` | MEDIUM |
| `app/(driver)/actions/driver-routes.ts` | getMyActiveDispatch,getMyDispatchHistory,startTrip,arriveAtStop,completeCurrentStop | `requireRole+getSession` | role-checked | DRIVER | request header `x-tenant-id` + session/token + **RLS bypassed** | MEDIUM |
| `app/(owner)/actions/compliance.ts` | getComplianceDashboard | `requireRole` | role-checked | OWNER,MANAGER | request header `x-tenant-id` | MEDIUM |
| `app/(owner)/actions/customers.ts` | createCustomer,updateCustomer,deleteCustomer,addInteraction | `requireRole+getSession` | role-checked | OWNER,MANAGER | request header `x-tenant-id` | MEDIUM |
| `app/(owner)/actions/documents.ts` | requestUploadUrl,completeUpload,getDownloadUrl,deleteDocument,listDocuments | `requireRole+getCurrentUser` | role-checked | OWNER,MANAGER,DRIVER | request header `x-tenant-id` | MEDIUM |
| `app/(owner)/actions/driver-compensation-templates.ts` | listTemplatesForDriver,getActiveTemplate,createTemplate,getCopyableTemplates | `requireAuth+requireRole` | role-checked | OWNER,MANAGER | request header `x-tenant-id` | MEDIUM |
| `app/(owner)/actions/driver-documents.ts` | requestDriverUploadUrl,uploadDriverDocument,completeDriverDocumentUpload,listDriverDocuments,deleteDriverDocument,update | `requireRole+getCurrentUser` | role-checked | OWNER,MANAGER,DRIVER | request header `x-tenant-id` | MEDIUM |
| `app/(owner)/actions/driver-route-joins.ts` | listDriverRouteJoinsByRoute,listDriverRouteJoinsByDriver,createDriverRouteJoin,updateDriverRouteJoin,listDriverPrimaryRo | `requireRole` | role-checked | OWNER,MANAGER,DRIVER | request header `x-tenant-id` | MEDIUM |
| `app/(owner)/actions/drivers.ts` | inviteDriver,listDrivers,getDriver,updateDriver,deactivateDriver,reactivateDriver,listInvitations | `requireRole` | role-checked | OWNER,MANAGER | request header `x-tenant-id` | MEDIUM |
| `app/(owner)/actions/expense-categories.ts` | createCategory,deleteCategory,listCategories | `requireRole` | role-checked | OWNER,MANAGER,DRIVER | request header `x-tenant-id` | MEDIUM |
| `app/(owner)/actions/expense-templates.ts` | createTemplate,deleteTemplate,listTemplates,applyTemplate | `requireRole` | role-checked | OWNER,MANAGER,DRIVER | request header `x-tenant-id` | MEDIUM |
| `app/(owner)/actions/expenses.ts` | createExpense,updateExpense,deleteExpense,listExpenses,listExpenseCategories | `requireRole` | role-checked | OWNER,MANAGER,DRIVER | request header `x-tenant-id` | MEDIUM |
| `app/(owner)/actions/ifta.ts` | getIFTAReport,generateIFTACSV | `requireRole` | role-checked | OWNER,MANAGER | request header `x-tenant-id` | MEDIUM |
| `app/(owner)/actions/integrations.ts` | listIntegrations,toggleIntegration,saveIntegrationConfig | `requireRole` | role-checked | OWNER,MANAGER | request header `x-tenant-id` | MEDIUM |
| `app/(owner)/actions/invoices.ts` | createInvoice,updateInvoice,markInvoicePaid,deleteInvoice | `requireAuth+requireRole` | role-checked | OWNER,MANAGER | request header `x-tenant-id` | MEDIUM |
| `app/(owner)/actions/lane-analytics.ts` | getLaneAnalytics | `requireRole` | role-checked | OWNER,MANAGER | request header `x-tenant-id` | MEDIUM |
| `app/(owner)/actions/load-documents.ts` | uploadLoadDocument,listLoadDocuments,deleteLoadDocument | `requireRole+getCurrentUser` | role-checked | OWNER,MANAGER | request header `x-tenant-id` | MEDIUM |
| `app/(owner)/actions/load-driver-assignments.ts` | listAssignmentsForLoad,createAssignment,updateAssignment,deleteAssignment | `requireAuth+requireRole` | role-checked | OWNER,MANAGER | request header `x-tenant-id` | MEDIUM |
| `app/(owner)/actions/loads.ts` | createLoad,updateLoad,deleteLoad,dispatchLoad,reassignTruck,updateLoadStatus,updateLoadSequence,revertLoadStatus | `requireAuth+requireRole` | role-checked | OWNER,MANAGER | request header `x-tenant-id` | MEDIUM |
| `app/(owner)/actions/maintenance.ts` | createMaintenanceEvent,listMaintenanceEvents,deleteMaintenanceEvent,createScheduledService,listScheduledServices,deleteS | `requireRole` | role-checked | OWNER,MANAGER | request header `x-tenant-id` | MEDIUM |
| `app/(owner)/actions/onboarding-tour.ts` | markTourSeen | `requireAuth` | auth-only | - | request header `x-tenant-id` | MEDIUM |
| `app/(owner)/actions/payments.ts` | createPayment,updatePayment,deletePayment,listPayments | `requireRole` | role-checked | OWNER,MANAGER,DRIVER | request header `x-tenant-id` | MEDIUM |
| `app/(owner)/actions/payroll.ts` | createPayrollRecord,updatePayrollRecord,getDriverPayPeriodStats,deletePayrollRecord | `requireAuth+requireRole` | role-checked | OWNER,MANAGER | request header `x-tenant-id` | MEDIUM |
| `app/(owner)/actions/rate-confirmation.tsx` | generateRateConfirmationPDF | `requireRole` | role-checked | OWNER,MANAGER | request header `x-tenant-id` | MEDIUM |
| `app/(owner)/actions/route-analytics.ts` | getRouteFinancialAnalytics,getFleetAverageCostPerMile | `requireRole` | role-checked | OWNER,MANAGER,DRIVER | request header `x-tenant-id` | MEDIUM |
| `app/(owner)/actions/routes.ts` | createRoute,updateRoute,updateRouteStatus,deleteRoute,listRoutes,getRoute,updateRouteCoDrivers | `requireAuth+requireRole` | role-checked | OWNER,MANAGER,DRIVER | request header `x-tenant-id` | MEDIUM |
| `app/(owner)/actions/tags.ts` | createTag,deleteTag,listTags,listTagsWithAssignments,assignTag,unassignTag,getTagsForEntity | `requireRole` | role-checked | OWNER,MANAGER | request header `x-tenant-id` | MEDIUM |
| `app/(owner)/actions/team-permissions.ts` | getTeamMembers,updateUserPermissions,inviteTeamMember | `requireRole` | role-checked | OWNER,MANAGER | request header `x-tenant-id` | MEDIUM |
| `app/(owner)/actions/trucks.ts` | createTruck,updateTruck,deleteTruck,listTrucks,toggleTruckMaintenance,listTruckRoutes,getTruck | `requireAuth+requireRole` | role-checked | OWNER,MANAGER,DRIVER | request header `x-tenant-id` | MEDIUM |
| `app/(owner)/fuel/actions.ts` | getFleetFuelSummary,getFuelEfficiencyTrend,getCO2Emissions,getIdleTimeAnalysis,getFuelEfficiencyRankings | `requireRole` | role-checked | OWNER,MANAGER | request header `x-tenant-id` | MEDIUM |
| `app/(owner)/live-map/actions.ts` | getLatestVehicleLocations,getVehicleRouteHistory,getVehicleDiagnostics | `requireRole` | role-checked | OWNER,MANAGER | request header `x-tenant-id` | MEDIUM |
| `app/(owner)/safety/actions.ts` | getFleetSafetyScore,getEventDistribution,getSafetyScoreTrend,getDriverRankings | `requireRole` | role-checked | OWNER,MANAGER | request header `x-tenant-id` | MEDIUM |
| `actions/carrier/save-route-template.ts` | saveRouteTemplate | `getSession` | auth-only | - | request header `x-tenant-id` + session/token | LOW-MED |
| `actions/carrier/soft-delete.ts` | softDeleteRecords,restoreRecords,permanentlyDeleteRecords | `getSession` | auth-only | - | request header `x-tenant-id` + session/token | LOW-MED |
| `app/(driver)/actions/driver-hos.ts` | getDriverHOS,updateDutyStatus | `getSession` | auth-only | - | request header `x-tenant-id` + session/token | LOW-MED |
| `app/(owner)/actions/my-notifications.ts` | getMyPreferences,updateMyPreference,updateMySubscription | `requireAuth+getSession` | auth-only | - | request header `x-tenant-id` + session/token | LOW-MED |
| `app/(owner)/actions/subscription.ts` | getMySubscriptionInvoices | `getSession` | auth-only | OWNER,MANAGER | session/token | LOW-MED |
| `app/(owner)/checklists/instances/[id]/_components/actions.ts` | getSignedPhotoUrl | `getSession` | auth-only | - | request header `x-tenant-id` + session/token | LOW-MED |
| `app/(admin)/actions/notifications.ts` | listNotificationTemplates,getNotificationTemplate,updateNotificationTemplate,toggleNotificationTemplateActive,getNotific | `requireAuth+requireAdminAccess+isSystemAdmin` | admin-only | - | bare client (untenanted) | LOW |
| `app/(admin)/actions/plans.ts` | getPlans,getPlanById,createPlan,updatePlan | `requireAuth+requireAdminAccess+isSystemAdmin` | admin-only | - | bare client (untenanted) | LOW |
| `app/(admin)/actions/promos.ts` | getPromos,createPromo | `requireAuth+requireAdminAccess+isSystemAdmin` | admin-only | - | bare client (untenanted) | LOW |
| `app/(admin)/actions/sysadmin-invoices.ts` | generateInvoiceNumber,createSysAdminInvoice,getSysAdminInvoices,getSysAdminInvoiceById,updateSysAdminInvoice,markInvoice | `requireAuth+requireAdminAccess+isSystemAdmin` | admin-only | - | bare client (untenanted) | LOW |
| `app/(admin)/actions/users.ts` | getAllUsers,updateUserProfile | `requireAuth+requireAdminAccess+isSystemAdmin` | admin-only | - | bare client (untenanted) | LOW |
| `app/(driver-fullscreen)/inspection/actions.ts` | openInspectionChecklist,answerInspectionPass,answerInspectionFail,answerInspectionNotApplicable,requestInspectionPhotoUp | `getSession+getRole+resolveInspectionAccess+assertTenantKey` | role-checked | - | session/token | LOW |
| `app/(driver)/actions/driver-incidents.ts` | submitIncidentReport,getMyIncidentReports | `requireRole+getSession+getCurrentUser` | role-checked | DRIVER | request header `x-tenant-id` + session/token | LOW |
| `app/(driver)/actions/driver-load.ts` | getMyLoads | `requireRole+getSession` | role-checked | DRIVER | request header `x-tenant-id` + session/token | LOW |
| `app/(driver)/actions/driver-messages.ts` | getDriverMessages,sendDriverMessage,sendDriverVoiceMessage | `requireRole+getCurrentUser` | role-checked | DRIVER | request header `x-tenant-id` + session/token | LOW |
| `app/(driver)/actions/driver-tasks.ts` | completeDriverTask,failDriverInspection,markDriverTaskNotApplicable,uploadTaskFile | `requireRole+getSession` | role-checked | DRIVER | request header `x-tenant-id` + session/token | LOW |
| `app/(owner)/actions/ai-documents.ts` | analyzeDocument | `requireRole+requirePermission` | role-checked | OWNER,MANAGER | none | LOW |
| `app/(owner)/actions/dashboard.ts` | getNotificationAlerts,getDashboardMetrics,getFleetStats | `requireRole+getSession` | role-checked | OWNER,MANAGER | request header `x-tenant-id` + session/token | LOW |
| `app/(owner)/actions/fleet-messages.ts` | getRouteMessages,getLoadMessages,sendOwnerLoadReply,sendOwnerReply | `requireRole+getCurrentUser` | role-checked | OWNER,MANAGER | request header `x-tenant-id` + session/token | LOW |
| `app/(owner)/actions/notifications.ts` | getUpcomingMaintenance,getExpiringDocuments,sendLoadUpdateNotification,sendETANotification | `requireRole+getSession` | role-checked | OWNER,MANAGER | request header `x-tenant-id` + session/token | LOW |
| `app/(owner)/actions/profit-predictor.ts` | predictLoadProfitability | `requireRole` | role-checked | OWNER,MANAGER | none | LOW |
| `app/(owner)/actions/tenant-notification-settings.ts` | listTenantNotificationSettings,getSettingForTrigger,customizeTemplate,restoreDefault,toggleTenantNotificationActive,list | `requireRole+getSession` | role-checked | OWNER,MANAGER | request header `x-tenant-id` + session/token | LOW |
| `app/(owner)/settings/operations/actions.ts` | saveOperationsSettings | `requireRole+getSession` | role-checked | OWNER,MANAGER | explicit arg + session/token | LOW |

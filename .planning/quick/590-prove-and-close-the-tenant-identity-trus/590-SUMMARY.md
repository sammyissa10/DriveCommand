# Quick 590 — Summary

**Date:** 2026-09-09
**Commits:** `0e1911bc` (proof, committed red) · `d7f9083c` (fix)
**Outcome:** vector proved end to end against real data, then closed at the resolver.

---

## 1. The three middleware early returns

`middleware.ts:166-167` (pre-fix numbering) was the only line that overwrote the
inbound header:

```ts
const requestHeaders = new Headers(request.headers);   // copies the caller's header
requestHeaders.set('x-tenant-id', appMeta.tenantId);   // then overwrites it
```

Three returns never reached it. Every other return in the function is a redirect
or a 403, which ends the request and cannot deliver a forged header to a handler.

| # | Line (pre-fix) | Branch | Precondition that reaches it | Forged header survives to `getTenantPrisma()`? | Disposition |
|---|---|---|---|---|---|
| 1 | `middleware.ts:79` | `if (isPublicPath(pathname)) return NextResponse.next();` | Any caller, on any of the 18 `PUBLIC_PATHS` | **Yes, but not exploitable.** The only public path that resolves a tenant is `/api/auth/accept-invitation`, which uses `getTenantPrismaForOrg(invitation.tenantId)` from the verified invitation row (`:301`, with the reason stated at `:293`) and never the header. | **Closed anyway** — header stripped before the branch |
| 2 | `middleware.ts:103` | unauthenticated `/api/*` → `return NextResponse.next();` | Any caller with no session, on `/api/*` | **Yes, but not exploitable.** Handlers run their own auth; `getSession()` returns null, so the resolver had no session to pair the header with, and every guarded handler 401s first. | **Closed anyway** — header stripped before the branch |
| 3 | `middleware.ts:124` | authenticated, **no `tenantId`**, `/api` path → `return response;` | An authenticated account with no tenant assigned | **Yes — this is the live vector.** `response` is the Supabase cookie-refresh response, which carries the original request headers. | **Closed** — now returns 403 |

`response` at #3 is built by `createMiddlewareClient(request)`, which was verified
not to touch `x-tenant-id` (grep returns no matches in `src/lib/supabase/middleware.ts`).

**The precondition for #3 is created by the product's own sign-up flow.**
`sign-up/actions.tsx:99-100` creates the auth user before the tenant exists and
patches `app_metadata` only afterwards at `:167-170`. If `provisionTenant` throws
(`:162`) the rollback `deleteUser` is best-effort; if the metadata patch failed it
was logged as "Non-fatal" and the flow continued. Either way the account persists,
authenticated, with no tenant.

**System admins do not take branch #3** — the condition at `:116` excludes them.
They fall through to `:167`, where `set('x-tenant-id', undefined)` coerces to the
string `"undefined"`. Not a bypass (the client value is still overwritten), but it
produced a `22P02` invalid-uuid cast instead of a clean failure. The resolver fix
now rejects it cleanly, since a sysadmin session carries no tenant.

---

## 2. The proof (step 2, committed red in `0e1911bc`)

`apps/web/src/__tests__/security/tenant-header-forgery.test.ts`, two suites.

**Why not seeded.** Repo convention (quick-549) is a disposable tenant written to
production, because DEC-3 says there is no local database. Phase 0 forbids
production writes. Proving the vector never required *creating* tenants — only
that two exist and the forged header picks between them. The suite reads two that
already exist, discovers their ids at runtime, and writes nothing: no INSERT,
UPDATE, DELETE or DDL anywhere in the file.

**Why two suites.** `npm test` runs with no `DATABASE_URL`, so a DB-dependent
assertion silently skips and gates nothing — the same trap the 17 isolation tests
sit in. Suite 1 needs no database and is what fails the build.

### Output BEFORE the fix — vector confirmed

Resolver suite:

```
[quick-590][VECTOR] session tenant = ""
[quick-590][VECTOR] forged header  = 73c69018-9047-40d0-9203-631985ca1ccd
[quick-590][VECTOR] client scoped to = 73c69018-9047-40d0-9203-631985ca1ccd
[quick-590][VECTOR] GUC write = {"sql":"SELECT set_config('app.current_tenant_id', $1, false)",
                                 "params":["73c69018-9047-40d0-9203-631985ca1ccd"]}
```

Live suite, against the real database through the real `withTenantRLS` extension:

```
[quick-590][LIVE] session tenant  = ""
[quick-590][LIVE] forged header   = 37c5a354-ea02-46d8-a134-a3f552b397f0
[quick-590][LIVE] rows returned   = [
 { "id": "ac724a1f-00ab-465a-84be-aede5732d617",
   "tenantId": "37c5a354-ea02-46d8-a134-a3f552b397f0",
   "payStatus": "APPROVED" } ]
```

A session carrying **no tenant at all** read a production row belonging to tenant
`37c5a354` (demoteam). Both layers were defeated by the same single value: the
Prisma filter and the GUC.

### The endpoint and payload that worked

- **Reachability precondition:** authenticated account with `app_metadata.tenantId`
  absent. Reaches `/api/*` via `middleware.ts:124`.
- **Payload:** any request to a tenant-scoped `/api` route carrying
  `x-tenant-id: <victim tenant uuid>`.
- **Model read:** `LoadDriverAssignment` — it carries a real `tenantId`, so it is
  not in `EXEMPT_MODELS` and the extension genuinely injects a filter for it.
- **36 endpoints are in the exploitable set**: they call `getTenantPrisma()`, are
  not under `/api/mobile`, and have no `if (!orgId) return 403` guard. Enumerated
  by grep; `/api/driver-pay/pending-queue` and `/api/driver-pay/reports/overview`
  are representative — `getSession()` only, role check that a non-driver passes,
  and no session-tenant comparison anywhere in the handler.

### Output AFTER the fix

```
✓ a tenantless account cannot borrow a tenant from a forged header
✓ a header disagreeing with the session is rejected, not honoured
✓ resolves the session tenant when the header agrees
✓ resolves the session tenant when no header is present at all
✓ a forged header reads zero rows of the victim tenant
Test Files 1 passed (1) · Tests 5 passed (5)

[quick-590][LIVE] session tenant = ""
[quick-590][LIVE] forged header  = 37c5a354-ea02-46d8-a134-a3f552b397f0
[quick-590][LIVE] result         = rejected, 0 rows readable
```

Security event emitted on mismatch:

```
ERROR: [security] x-tenant-id does not match the session tenant — request rejected
{"event":"tenant_header_mismatch",
 "userId":"00000000-0000-4000-8000-00000000dead",
 "sessionTenantId":"37c5a354-ea02-46d8-a134-a3f552b397f0",
 "requestedTenantId":"73c69018-9047-40d0-9203-631985ca1ccd",
 "role":"OWNER"}
```

---

## 3. The fix

Applied at the resolver, not the callers: `requireTenantId()` has ~90 call sites
across server actions and pages that all read the header, so fixing only
`getTenantPrisma()` would have left every one of them and failed the grep check.

`resolveSessionTenantId()` in `lib/context/tenant-context.ts` is now the single
source. The header is a **veto, never a source**:

| Condition | Result |
|---|---|
| no session | `TenantContextError` |
| session with no tenant | `TenantContextError` |
| header absent | session tenant |
| header === session tenant | session tenant (the normal path) |
| header !== session tenant | security event logged, `TenantMismatchError` |

A mismatch is rejected rather than silently overwritten, because a request naming
another tenant is this attack's signature and this is the only place able to
observe it. The header read is wrapped in `try/catch` — `headers()` throws outside
a request scope, and a value that can only veto is safe to fail to read.

`getTenantPrismaForOrg()` is unchanged and remains the explicit escape hatch:
cron, `/api/mobile/*` (Bearer token, no cookie, no header — DEC-11) and the
pre-auth invitation flow have no session, and pass a tenant they already verified.

Locked decisions untouched: GUC name `app.current_tenant_id`, session scope
`false`. Asserted directly by a test.

---

## 4. Is signup atomic now? **No — and it cannot be.**

Supabase Auth and Postgres are separate systems with no shared transaction, so
"create auth user" and "create tenant" cannot commit or abort together. Stating
that plainly rather than claiming a guarantee that is not there.

What changed is **compensation**, which is what is actually available:

- The `app_metadata` patch was "non-fatal", logged, and the flow continued. That
  is precisely how a durable signable-in account with no tenant was created. It is
  now **fatal**: retry once, then delete the auth user, then return an error.
- The provisioned tenant is deliberately left in place. It is unreachable without
  an auth user, and a repeat sign-up with the same email hits the existing
  `EMAIL_TAKEN` path. Deleting a fresh tenant from a failure handler would be a
  destructive write on an already-failing path.
- If the compensating `deleteUser` itself fails, the account survives. It is now
  **inert rather than exploitable**: middleware refuses it the `/api` surface and
  the resolver refuses to resolve a tenant for it. That case is logged as CRITICAL.

Per the brief's fallback clause, the guard is in place as well as the source fix:
`middleware.ts` returns 403 for any tenantless account on `/api`. This is what
covers accounts already in that state in production, which a signup fix cannot
reach. It is safe because a tenantless account is never legitimate — `/onboarding`
provisions nothing (it is a dead-end page telling the user to contact an
administrator) and `provisionTenant` is called only from sign-up.

---

## 5. Verification

**Full suite, measured by stashing this task's changes — same reporter, same env,
not taken from a previous summary (quick-561/565/567 each published a baseline
that was measuring something else).**

| Run | Files failed | Tests failed | Tests passed |
|---|---|---|---|
| Before (stashed) | 27 | 71 | 1837 |
| After | 26 | 70 | 1838 |

The single delta is this task's own test flipping green. The 70 remaining
failures are pre-existing and unrelated.

- **17/17 isolation tests pass** (`group-a` 4, `group-b` 6, `group-c` 7).
- **`tsc --noEmit` clean, and probed.** An injected `const x: number = 'y'` in
  `tenant-context.ts` produced `TS2322` at line 230, confirming the gate was not
  blind; probe removed and the clean run re-confirmed. No stray `__probe` files.
- **`npm run build` exits 0**, "Compiled successfully in 37.7s".
- **Grep — no remaining code path reads `x-tenant-id` as a tenant source:**

```
src/middleware.ts:91          sanitizedHeaders.delete('x-tenant-id');
src/middleware.ts:211         requestHeaders.set('x-tenant-id', appMeta.tenantId);
src/lib/context/tenant-context.ts:74    return (await headers()).get('x-tenant-id');
src/lib/context/tenant-context.ts:101   '[security] x-tenant-id does not match the session tenant — request rejected',
src/lib/context/tenant-context.ts:102   new TenantMismatchError('x-tenant-id / session tenant mismatch'),
```

  `:91` strips, `:211` produces from session `app_metadata`, `:101`/`:102` are log
  strings. The single `.get()` at `:74` lives in `readTenantHeaderForComparison()`,
  whose value is only ever compared and logged inside `resolveSessionTenantId()`;
  the sole return is `sessionTenantId`.

## Files changed

| File | Change |
|---|---|
| `apps/web/src/lib/context/tenant-context.ts` | Resolver rewritten: session-derived tenant, header demoted to a veto, `TenantContextError` / `TenantMismatchError`, security-event logging |
| `apps/web/src/middleware.ts` | `x-tenant-id` stripped once before any branch; both pass-throughs pass the sanitised request; tenantless `/api` returns 403 |
| `apps/web/src/app/(auth)/sign-up/actions.tsx` | `app_metadata` patch made fatal: retry once, then roll back the auth user |
| `apps/web/src/__tests__/security/tenant-header-forgery.test.ts` | New. Committed red asserting the hole, then inverted |

## Not done, deliberately

- RLS policies, grants, migrations, and the 211 `app.bypass_rls` calls are
  untouched — Prompt 1 owns those.
- The other 35 endpoints in the exploitable set were not individually guarded.
  The resolver fix covers all of them at once; adding per-handler checks would be
  the fifth copy of a predicate that already has one home.

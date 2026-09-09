# Quick 590 — Prove and close the tenant identity trust boundary

**Date:** 2026-09-09
**Mode:** quick (planner + executor collapsed; task is investigative-then-surgical)
**Source:** `docs/audits/role-guard-storage-audit.md` finding 2; `.planning/phase-0-revised.md` §3–§4

## Problem

`getTenantPrisma()` derives the tenant from the client-supplied `x-tenant-id`
request header and never compares it to the authenticated session. The header is
trustworthy only because `middleware.ts` overwrites it at one line, and three
earlier returns never reach that line. Both enforcement layers — the Prisma
filter injected by `withTenantRLS` and the `app.current_tenant_id` GUC the RLS
policies consult — read the same value, so one forged header defeats both.

## Constraints

- Do not change the GUC name or its session scope (`app.current_tenant_id`, `set_config(..., FALSE)`).
- Do not touch RLS policies, grants, or migrations. That is Prompt 1.
- Do not remove any `app.bypass_rls` call. That is Prompt 1.
- No middleware refactor beyond closing the reachable early returns.
- No new packages. No production writes.

## Tasks

1. **Enumerate the three early returns.** Exact precondition per return, and
   whether a forged header survives to `getTenantPrisma()`. File and line each.
2. **Prove the vector.** A test that fails the build by passing. Report the exact
   endpoint and payload. Stop and report if not exploitable.
3. **Fix at the resolver.** Session-derived tenant only. Header ignored unless it
   matches; mismatch rejected and logged as a security event, not overwritten.
   No tenant in session throws. Never falls back to the header, never returns an
   unscoped client.
4. **Close the no-tenant account state at its source.** Atomic provisioning, or
   state plainly that atomicity is unavailable and add a guard refusing that state.
5. **Invert the step 2 test.** Same request, assert rejection and zero victim rows.

## Verification gates

- Step 2 output before the fix (victim rows returned) and after (rejected).
- Every early return either unreachable with a forged header or explicitly closed.
- Grep confirms no remaining code path reads `x-tenant-id` as a tenant source.
- The 17 existing isolation tests still pass.
- `npm run build` succeeds.
- File list, and a plain statement of whether signup is now atomic.

---
phase: quick-114
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/mobile/driver/documents/route.ts
  - apps/web/src/app/api/mobile/driver/documents/upload-url/route.ts
  - apps/web/src/app/api/mobile/driver/documents/[id]/url/route.ts
  - apps/web/src/app/api/mobile/driver/hos/route.ts
  - apps/web/src/app/api/mobile/driver/incidents/route.ts
  - apps/web/src/app/api/mobile/driver/incidents/upload-photo/route.ts
  - apps/web/src/app/api/mobile/driver/loads/route.ts
  - apps/web/src/app/api/mobile/driver/loads/[id]/rate-confirmation/route.ts
  - apps/web/src/app/api/mobile/driver/loads/[id]/revert/route.ts
  - apps/web/src/app/api/mobile/driver/loads/[id]/route.ts
  - apps/web/src/app/api/mobile/driver/loads/[id]/status/route.ts
  - apps/web/src/app/api/mobile/driver/messages/mark-read/route.ts
  - apps/web/src/app/api/mobile/driver/messages/route.ts
  - apps/web/src/app/api/mobile/driver/messages/unread-count/route.ts
  - apps/web/src/app/api/mobile/driver/tracking-token/route.ts
  - apps/web/src/app/api/mobile/owner/compliance/route.ts
  - apps/web/src/app/api/mobile/owner/crm/route.ts
  - apps/web/src/app/api/mobile/owner/customers/route.ts
  - apps/web/src/app/api/mobile/owner/drivers/active/route.ts
  - apps/web/src/app/api/mobile/owner/drivers/invite/route.ts
  - apps/web/src/app/api/mobile/owner/drivers/route.ts
  - apps/web/src/app/api/mobile/owner/drivers/[id]/route.ts
  - apps/web/src/app/api/mobile/owner/fleet/messages/route.ts
  - apps/web/src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts
  - apps/web/src/app/api/mobile/owner/fleet-positions/route.ts
  - apps/web/src/app/api/mobile/owner/invoices/route.ts
  - apps/web/src/app/api/mobile/owner/invoices/[id]/route.ts
  - apps/web/src/app/api/mobile/owner/loads/route.ts
  - apps/web/src/app/api/mobile/owner/loads/[id]/assign-truck/route.ts
  - apps/web/src/app/api/mobile/owner/loads/[id]/route.ts
  - apps/web/src/app/api/mobile/owner/map/vehicles/route.ts
  - apps/web/src/app/api/mobile/owner/payroll/route.ts
  - apps/web/src/app/api/mobile/owner/trucks/route.ts
  - apps/web/src/app/api/cron/send-reminders/route.ts
autonomous: true
must_haves:
  truths:
    - "All 35 /api/mobile/* routes apply rate limiting via mobileLimiter"
    - "Rate limit uses auth.userId as the identifier (per-user, not per-IP)"
    - "send-reminders cron endpoint has zero @ts-ignore comments"
  artifacts:
    - path: "apps/web/src/app/api/mobile/driver/loads/route.ts"
      provides: "Example of rate-limited mobile route"
      contains: "applyRateLimit"
    - path: "apps/web/src/app/api/cron/send-reminders/route.ts"
      provides: "Clean cron endpoint without ts-ignore"
  key_links:
    - from: "all /api/mobile/* routes"
      to: "@/lib/rate-limit"
      via: "import { mobileLimiter, applyRateLimit }"
      pattern: "applyRateLimit\\(mobileLimiter"
---

<objective>
Add rate limiting to all 33 unprotected /api/mobile/* routes and fix @ts-ignore comments in the send-reminders cron endpoint.

Purpose: Close the rate-limiting gap across mobile API surface (only 2 of 35 routes currently have it) and eliminate unsafe type suppressions.
Output: All mobile routes rate-limited, clean TypeScript in send-reminders.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/rate-limit.ts
@apps/web/src/app/api/mobile/driver/dashboard/route.ts
@apps/web/src/app/api/mobile/owner/dashboard/route.ts
@apps/web/src/app/api/cron/send-reminders/route.ts
@apps/web/src/lib/db/prisma.ts
@apps/web/src/lib/db/extensions/tenant-rls.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add rate limiting to all 33 unprotected /api/mobile/* routes</name>
  <files>
    apps/web/src/app/api/mobile/driver/documents/route.ts
    apps/web/src/app/api/mobile/driver/documents/upload-url/route.ts
    apps/web/src/app/api/mobile/driver/documents/[id]/url/route.ts
    apps/web/src/app/api/mobile/driver/hos/route.ts
    apps/web/src/app/api/mobile/driver/incidents/route.ts
    apps/web/src/app/api/mobile/driver/incidents/upload-photo/route.ts
    apps/web/src/app/api/mobile/driver/loads/route.ts
    apps/web/src/app/api/mobile/driver/loads/[id]/rate-confirmation/route.ts
    apps/web/src/app/api/mobile/driver/loads/[id]/revert/route.ts
    apps/web/src/app/api/mobile/driver/loads/[id]/route.ts
    apps/web/src/app/api/mobile/driver/loads/[id]/status/route.ts
    apps/web/src/app/api/mobile/driver/messages/mark-read/route.ts
    apps/web/src/app/api/mobile/driver/messages/route.ts
    apps/web/src/app/api/mobile/driver/messages/unread-count/route.ts
    apps/web/src/app/api/mobile/driver/tracking-token/route.ts
    apps/web/src/app/api/mobile/owner/compliance/route.ts
    apps/web/src/app/api/mobile/owner/crm/route.ts
    apps/web/src/app/api/mobile/owner/customers/route.ts
    apps/web/src/app/api/mobile/owner/drivers/active/route.ts
    apps/web/src/app/api/mobile/owner/drivers/invite/route.ts
    apps/web/src/app/api/mobile/owner/drivers/route.ts
    apps/web/src/app/api/mobile/owner/drivers/[id]/route.ts
    apps/web/src/app/api/mobile/owner/fleet/messages/route.ts
    apps/web/src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts
    apps/web/src/app/api/mobile/owner/fleet-positions/route.ts
    apps/web/src/app/api/mobile/owner/invoices/route.ts
    apps/web/src/app/api/mobile/owner/invoices/[id]/route.ts
    apps/web/src/app/api/mobile/owner/loads/route.ts
    apps/web/src/app/api/mobile/owner/loads/[id]/assign-truck/route.ts
    apps/web/src/app/api/mobile/owner/loads/[id]/route.ts
    apps/web/src/app/api/mobile/owner/map/vehicles/route.ts
    apps/web/src/app/api/mobile/owner/payroll/route.ts
    apps/web/src/app/api/mobile/owner/trucks/route.ts
  </files>
  <action>
    Follow the exact pattern already used in `apps/web/src/app/api/mobile/driver/dashboard/route.ts` and `apps/web/src/app/api/mobile/owner/dashboard/route.ts`.

    For each of the 33 route files listed above:

    1. Add the import (if not already present):
       `import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';`

    2. In EVERY exported handler function (GET, POST, PUT, PATCH, DELETE — whatever the file exports), add the rate limit check AFTER auth validation but BEFORE any business logic:
       ```
       const limited = await applyRateLimit(mobileLimiter, auth.userId);
       if (limited) return limited;
       ```

    3. Remove any `// TODO: Apply mobileLimiter` comments if found.

    Key details:
    - The identifier MUST be `auth.userId` (per-user limiting, not per-IP) — matching the existing dashboard routes.
    - The rate limit check goes AFTER `validateMobileToken()` and role checks, but BEFORE any database queries or business logic.
    - For files with multiple exported handlers (e.g., GET and POST in same file), add rate limiting to EACH handler separately.
    - Do NOT change any other logic in the files — only add the import and the rate limit block.
    - Also remove the `// TODO: Apply mobileLimiter to all /api/mobile/* routes` comments from the two dashboard routes that already have rate limiting.
  </action>
  <verify>
    Run: `grep -rL "applyRateLimit" apps/web/src/app/api/mobile/` — should return zero files (all routes have rate limiting).
    Run: `grep -r "TODO.*mobileLimiter" apps/web/src/app/api/mobile/` — should return zero results.
    Run: `npx tsc --noEmit` from apps/web — should pass with no new errors.
  </verify>
  <done>All 35 /api/mobile/* route files import and apply mobileLimiter with auth.userId. No TODO comments remain about rate limiting.</done>
</task>

<task type="auto">
  <name>Task 2: Fix @ts-ignore comments in send-reminders cron endpoint</name>
  <files>apps/web/src/app/api/cron/send-reminders/route.ts</files>
  <action>
    The file has 4 `@ts-ignore` comments for Prisma 7 type issues. Fix each:

    1. Lines 59-60 — `tx.$executeRaw` inside `$transaction` interactive callback:
       The issue is that Prisma 7's interactive transaction `tx` type doesn't expose `$executeRaw` cleanly.
       Fix: Cast tx appropriately. Use `(tx as any).$executeRaw` is worse than @ts-ignore. Instead, use the bypass_rls pattern from the codebase — replace the interactive transaction with the system-level prisma client approach:
       ```typescript
       tenants = await prisma.$transaction(async (tx: any) => {
         await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
         return tx.tenant.findMany({
           where: { isActive: true },
           select: { id: true, name: true },
         });
       }, TX_OPTIONS);
       ```
       Type the `tx` parameter explicitly as `any` in the callback signature — this is a single typed parameter rather than scattered @ts-ignore on every line. This is the pragmatic fix since Prisma 7's interactive transaction types don't expose `$executeRaw`.

    2. Lines 87-88 — `prisma.$extends(withTenantRLS(tenant.id))`:
       The `$extends` return type loses model method inference.
       Fix: Type the result: `const tenantPrisma: any = prisma.$extends(withTenantRLS(tenant.id));`
       This is one explicit `any` annotation vs two scattered @ts-ignore comments.

    3. Lines 91-92 — `tenantPrisma.user.findMany(...)`:
       This is caused by the same issue as #2 — once tenantPrisma is typed as `any`, this @ts-ignore is no longer needed. Simply remove it.

    Remove all 4 `// @ts-ignore` comments. The result should have zero @ts-ignore in the file.
  </action>
  <verify>
    Run: `grep -c "@ts-ignore" apps/web/src/app/api/cron/send-reminders/route.ts` — should return 0.
    Run: `npx tsc --noEmit` from apps/web — should pass with no new errors related to this file.
  </verify>
  <done>send-reminders/route.ts has zero @ts-ignore comments and compiles cleanly.</done>
</task>

</tasks>

<verification>
1. `grep -rL "applyRateLimit" apps/web/src/app/api/mobile/` returns no files
2. `grep -rc "applyRateLimit" apps/web/src/app/api/mobile/ | grep ":0$"` returns no results
3. `grep -r "@ts-ignore" apps/web/src/app/api/cron/send-reminders/route.ts` returns nothing
4. `npx tsc --noEmit` passes from apps/web directory
5. `npm run build` succeeds (or at minimum `next lint` passes)
</verification>

<success_criteria>
- All 35 /api/mobile/* routes apply rate limiting using mobileLimiter with auth.userId
- send-reminders cron endpoint has zero @ts-ignore comments
- TypeScript compilation passes with no new errors
</success_criteria>

<output>
After completion, create `.planning/quick/114-add-rate-limiting-to-all-api-mobile-rout/114-SUMMARY.md`
</output>

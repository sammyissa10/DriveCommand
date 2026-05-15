---
phase: quick-323
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/actions/tenant-notification-settings.ts
autonomous: true

must_haves:
  truths:
    - "Owner on tenant A only sees users from tenant A in the Add Subscriber picker"
    - "Owner on tenant A only sees send log rows belonging to tenant A"
    - "Send Log tab renders without error and shows correct row count"
    - "Send Log filters (status / triggerKey / channel) return correctly filtered rows"
    - "Send Log KPI stats reflect tenant A data only"
  artifacts:
    - path: "apps/web/src/app/(owner)/actions/tenant-notification-settings.ts"
      provides: "Tenant-scoped notification settings server actions"
      contains: "getTenantPrisma"
  key_links:
    - from: "listTenantUsers / listTenantSendLog / getTenantSendLogStats"
      to: "session.tenantId"
      via: "requireTenantAccess()"
      pattern: "tenantId.*session"
    - from: "Tenant-facing data reads (User, NotificationSubscription, TenantNotificationSettings)"
      to: "RLS auto-filter"
      via: "getTenantPrisma()"
      pattern: "getTenantPrisma"
    - from: "NotificationSendLog reads (no RLS on table)"
      to: "explicit tenantId filter from session"
      via: "bypass_rls transaction with where: { tenantId }"
      pattern: "set_config\\('app.bypass_rls'"
---

<objective>
Fix two P0 bugs on `/settings/notifications`:
1. **Cross-tenant data leak** — Add Subscriber user picker shows users from OTHER tenants.
2. **Broken Send Log tab** — Send Log tab fails to load / throws error / returns wrong data.

Root cause: The owner-facing server actions in `tenant-notification-settings.ts` have subtle defects in how the Prisma client is constructed for `NotificationSendLog` reads (no RLS table) and possibly in how the user picker is filtered. This plan audits, then corrects each deviating action to the canonical isolation pattern.

Purpose: Restore tenant isolation guarantees and fix a broken settings tab that owners depend on.
Output: Patched `tenant-notification-settings.ts` plus passing TypeScript and build checks.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Suspect action file (target of all edits)
@apps/web/src/app/(owner)/actions/tenant-notification-settings.ts

# Canonical helpers — DO NOT modify, only consume
@apps/web/src/lib/context/tenant-context.ts
@apps/web/src/lib/db/tenant-client.ts
@apps/web/src/lib/auth/supabase.ts

# UI consumers of the broken actions (for understanding flow, no edits expected)
@apps/web/src/app/(owner)/settings/notifications/page.tsx
@apps/web/src/app/(owner)/settings/notifications/subscribers-tab.tsx
@apps/web/src/app/(owner)/settings/notifications/tenant-send-log-tab.tsx

# CANONICAL ISOLATION PATTERN
# - Tenant-facing UI actions reading RLS-protected tables (User, NotificationSubscription,
#   TenantNotificationSettings): use getTenantPrisma() — RLS auto-applies via
#   current_setting('app.current_tenant_id'). No manual tenantId filter required.
# - tenantId for ANY explicit filter MUST come from session via requireTenantAccess(),
#   never from request body / query param / headers directly.
# - bypass_rls is ONLY for system contexts (dispatcher, cron) OR tables without RLS
#   (NotificationSendLog, InAppNotification). When using bypass_rls in tenant context,
#   the explicit where: { tenantId } filter MUST use the session tenantId.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Audit every exported server action in tenant-notification-settings.ts</name>
  <files>(read-only) apps/web/src/app/(owner)/actions/tenant-notification-settings.ts</files>
  <action>
Read the file end-to-end. For EACH exported `async function`, record in a working table (keep it inline in your thinking, do NOT write a .md report file):

| # | Function | Line | Prisma client | tenantId source | Has where.tenantId filter? | Deviates? |
|---|---|---|---|---|---|---|

Classify each row using this decision tree:

  A. If the function reads/writes an RLS-protected table (User, NotificationSubscription,
     TenantNotificationSettings, NotificationTemplate) AND uses getTenantPrisma() AND
     either omits a redundant where.tenantId OR includes one sourced from session:
     -> OK, no change needed.

  B. If the function reads/writes an RLS-protected table but uses BASE `prisma` (not
     getTenantPrisma) without bypass_rls:
     -> DEVIATES. Will fail closed (no rows) or leak (no filter). Must switch to getTenantPrisma().

  C. If the function reads/writes the NotificationSendLog table (NO RLS):
     -> Required pattern: prisma.$transaction with bypass_rls SET FIRST, where: { tenantId: <session value> } applied to every count/findMany. Verify the array destructuring matches the transaction array length.

  D. If the function takes tenantId from a parameter or from request headers directly:
     -> DEVIATES. Must derive from session via requireTenantAccess().

Also explicitly inspect:

  - `listTenantUsers` (line ~367): confirm it uses getTenantPrisma() AND that the
     `where: { tenantId, isActive: true }` filter uses the session tenantId
     returned by requireTenantAccess(). If tenantId is unbound or shadowed, that
     is the user-picker leak.

  - `listTenantSendLog` (line ~484) and `getTenantSendLogStats` (line ~524):
     verify:
       * Transaction returns array length matches destructured tuple length.
       * `where = { tenantId, ... }` uses the session tenantId (not a param).
       * `prisma.$executeRaw` for `app.bypass_rls` is the FIRST statement so it
         applies to subsequent queries inside the same transaction.
       * The destructured `rows` is typed as SendLogRow[] but Prisma returns the
         model shape — confirm the cast `as [unknown, number, SendLogRow[]]` is
         compatible with the actual return. Note: `findMany` returns full model
         records, not just SendLogRow fields. If the schema includes columns that
         don't exist on the type, there is no runtime issue, but consumers may
         break if they read fields not present.

  - `removeSubscriber` (line ~462): `delete({ where: { id } })` — confirm RLS
     prevents deletion across tenants (it does, because getTenantPrisma sets
     app.current_tenant_id and the RLS policy on NotificationSubscription
     restricts to that tenant). OK as-is.

Output of this task: an updated mental model identifying EXACTLY which functions
need patching in Task 2. Print the audit table to the chat so the user can see
what's about to change.
  </action>
  <verify>Audit table printed to chat. Each deviating function flagged with: function name, line range, defect (one of: wrong-client / wrong-tenant-source / missing-filter / broken-transaction-shape), and proposed fix.</verify>
  <done>Every exported function in `tenant-notification-settings.ts` is classified OK or DEVIATES; for each DEVIATES entry, a concrete fix is specified.</done>
</task>

<task type="auto">
  <name>Task 2: Apply fixes to deviating actions</name>
  <files>apps/web/src/app/(owner)/actions/tenant-notification-settings.ts</files>
  <action>
Apply the fixes identified in Task 1's audit. Use Edit tool, NOT Write — preserve unrelated code exactly.

Mandatory fixes (apply each only if Task 1 confirmed the defect; skip if Task 1 marked OK):

  1. **User picker (listTenantUsers)** — Canonical pattern is:
     ```ts
     export async function listTenantUsers(): Promise<TenantUserRow[]> {
       await requireTenantAccess(); // auth guard only
       const tenantDb = await getTenantPrisma(); // RLS-bound to session tenant
       const users = await tenantDb.user.findMany({
         where: { isActive: true }, // RLS handles tenantId — no manual filter
         select: { id: true, email: true, firstName: true, lastName: true, role: true },
         orderBy: { email: 'asc' },
       });
       return users.map((u) => ({
         id: u.id,
         email: u.email,
         firstName: u.firstName,
         lastName: u.lastName,
         role: u.role as string,
       }));
     }
     ```
     Rationale: relying on RLS removes any chance the explicit filter uses a
     wrong/unbound tenantId variable. If audit confirms current code already
     uses session tenantId correctly AND leak is reproducible, the alternate
     cause is the `getTenantPrisma()` header value drifting from session.
     In that case ALSO change to derive from session and pass directly:
     ```ts
     const { tenantId } = await requireTenantAccess();
     const tenantDb = await createTenantClient(tenantId); // bind to session, not header
     ```
     Pick whichever variant Task 1 demonstrated to be correct. Default to the
     first variant unless evidence shows header/session divergence.

  2. **listTenantSubscribers** — same treatment: drop `where: { tenantId }`,
     rely on RLS. Keep include & orderBy unchanged.

  3. **listTenantNotificationSettings** — drop `where: { tenantId }` on the
     `tenantNotificationSettings.findMany` call (RLS-protected; redundant filter).

  4. **listActiveTemplatesForTenant** — drop `where: { tenantId, isActive: false }`
     on the tenant settings lookup, replace with `where: { isActive: false }`
     (tenantId comes from RLS).

  5. **listTenantSendLog** — `NotificationSendLog` has NO RLS, so we MUST keep
     the explicit `where.tenantId` filter AND keep the bypass_rls transaction.
     Required corrections:
       * Confirm `tenantId` in the `where` object is the session value from
         `requireTenantAccess()` (it is — keep it).
       * Replace the array-form `$transaction` with the callback form to make
         the bypass_rls + queries sequencing unambiguous:
         ```ts
         const { total, rows } = await prisma.$transaction(async (tx) => {
           await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
           const total = await tx.notificationSendLog.count({ where });
           const rows = await tx.notificationSendLog.findMany({
             where,
             orderBy: { createdAt: 'desc' },
             skip,
             take: pageSize,
           });
           return { total, rows };
         }, TX_OPTIONS);
         ```
         Import `TX_OPTIONS` from `@/lib/db/prisma` (it is exported there).
       * Drop the `as [unknown, number, SendLogRow[]]` cast — the callback form
         returns properly typed values from Prisma model methods.
       * Map the returned rows to the `SendLogRow` shape explicitly if there
         are extra fields on the model:
         ```ts
         const mappedRows: SendLogRow[] = rows.map((r) => ({
           id: r.id,
           tenantId: r.tenantId,
           triggerKey: r.triggerKey,
           recipientUserId: r.recipientUserId,
           recipientEmail: r.recipientEmail,
           channel: r.channel,
           subject: r.subject,
           status: r.status,
           errorMessage: r.errorMessage,
           idempotencyKey: r.idempotencyKey,
           relatedEntityType: r.relatedEntityType,
           relatedEntityId: r.relatedEntityId,
           sentAt: r.sentAt,
           createdAt: r.createdAt,
         }));
         ```
         Then return `{ rows: mappedRows, total, page, pageSize, totalPages }`.

  6. **getTenantSendLogStats** — same callback-style rewrite:
     ```ts
     const { total, sent, failed, pending } = await prisma.$transaction(async (tx) => {
       await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
       const total = await tx.notificationSendLog.count({ where });
       const sent = await tx.notificationSendLog.count({ where: { ...where, status: 'SENT' } });
       const failed = await tx.notificationSendLog.count({ where: { ...where, status: 'FAILED' } });
       const pending = await tx.notificationSendLog.count({ where: { ...where, status: 'PENDING' } });
       return { total, sent, failed, pending };
     }, TX_OPTIONS);
     const skipped = total - sent - failed - pending;
     return { total, sent, failed, skipped: skipped > 0 ? skipped : 0, pending };
     ```
     The `where` already includes `{ tenantId, createdAt: { gte: thirtyDaysAgo } }`
     using session tenantId — preserve it.

DO NOT touch:
  - Dispatcher library (`apps/web/src/lib/notifications/*`) — system context, base prisma is correct.
  - `apps/web/src/app/(admin)/actions/notifications.ts` — sysadmin, cross-tenant by design.
  - Plan 03 sysadmin actions.

After edits, re-read the file once to verify the patches are syntactically correct.
  </action>
  <verify>
    grep -n "where: { tenantId }" apps/web/src/app/(owner)/actions/tenant-notification-settings.ts
    # Expect: appears ONLY in the send-log functions (NotificationSendLog has no RLS), NOT in tenant subscribers / users / settings / templates.
    grep -n "prisma.\$transaction(async" apps/web/src/app/(owner)/actions/tenant-notification-settings.ts
    # Expect: 2 matches (listTenantSendLog + getTenantSendLogStats)
    grep -n "as \[unknown" apps/web/src/app/(owner)/actions/tenant-notification-settings.ts
    # Expect: 0 matches (array-form transaction cast removed)
  </verify>
  <done>All deviations identified in Task 1 are fixed. Tenant-facing reads on RLS-protected tables rely on RLS via `getTenantPrisma()`. NotificationSendLog reads use the callback-form `$transaction` with bypass_rls + session-derived `where.tenantId`. No edits to dispatcher or admin actions.</done>
</task>

<task type="auto">
  <name>Task 3: TypeScript check + Next.js build</name>
  <files>(no edits — verification only)</files>
  <action>
Run these two checks in order; STOP at the first failure and fix before continuing:

  1. TypeScript compile check:
     ```
     cd apps/web && npx tsc --noEmit
     ```
     Fix any type errors introduced by the rewrite (most likely:
     missing TX_OPTIONS import, Prisma model field name mismatches in the
     row mapper, or NotificationSendStatus / NotificationChannel enum
     import paths).

  2. Next.js production build:
     ```
     cd apps/web && npm run build
     ```
     This catches Server Action serialization issues, missing
     `'use server'` directives, and route-level errors that `tsc` misses.

If both pass: print "READY TO TEST" with manual smoke-test steps:
  - Sign in as tenant A owner -> `/settings/notifications`
  - Click "Add Subscriber" -> user picker MUST only show tenant A users
  - Open "Send Log" tab -> KPI cards render with numbers
  - Send Log table renders rows for tenant A only (verify by spot-checking
    tenantId column in DB if needed)
  - Filters (status / triggerKey / channel) narrow the list correctly
  - Pagination next/prev work
  </action>
  <verify>
    Both commands exit with code 0.
    `tsc --noEmit` prints no errors.
    `npm run build` completes the build and prints "Compiled successfully".
  </verify>
  <done>TypeScript clean. Production build succeeds. Manual smoke-test steps printed for the user to verify in the browser.</done>
</task>

</tasks>

<verification>
- `grep -n "getTenantPrisma" apps/web/src/app/(owner)/actions/tenant-notification-settings.ts` — every tenant-facing read of an RLS table uses it.
- `grep -n "where: { tenantId" apps/web/src/app/(owner)/actions/tenant-notification-settings.ts` — explicit `tenantId` filters appear ONLY in `listTenantSendLog` and `getTenantSendLogStats` (NotificationSendLog has no RLS).
- `apps/web/src/lib/notifications/**` is unchanged (`git diff --stat apps/web/src/lib/notifications/`).
- `apps/web/src/app/(admin)/actions/notifications.ts` is unchanged.
- `cd apps/web && npx tsc --noEmit` exits 0.
- `cd apps/web && npm run build` exits 0.
</verification>

<success_criteria>
- Owner on tenant A sees ONLY tenant A users in the Add Subscriber picker (manual verification by user).
- Send Log tab loads without error and displays rows belonging to tenant A only (manual verification).
- Filters and KPIs on the Send Log tab work correctly.
- No regressions to dispatcher, cron jobs, or sysadmin notification UI.
- TypeScript and Next.js build remain green.
</success_criteria>

<output>
After completion, create `.planning/quick/323-p0-cross-tenant-data-leak-and-broken-sen/323-SUMMARY.md` capturing:
- Audit table (function -> client used -> defect status -> action taken)
- Diff summary (functions modified, before/after pattern)
- Smoke-test results
- Any leftover concerns (e.g., other tenant-facing notification surfaces not in scope)
</output>

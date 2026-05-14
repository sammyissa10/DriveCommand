---
phase: quick
plan: 315
subsystem: notifications
tags: [schema, migration, rls, seed, tiptap, templates]
dependency_graph:
  requires: []
  provides: [NotificationTemplate, TenantNotificationSettings, NotificationSubscription, UserNotificationPreference, NotificationSendLog, NotificationEmailConfig]
  affects: [Tenant, User]
tech_stack:
  added: []
  patterns: [PrismaCustomOutput, PrismaPgAdapter, TiptapDocJson, IdempotentSeed]
key_files:
  created:
    - apps/web/prisma/migrations/20260514200001_add_notification_system/migration.sql
    - apps/web/src/lib/notifications/types.ts
    - apps/web/src/lib/notifications/build-template.ts
    - apps/web/prisma/seeds/notification-template-data/user.ts
    - apps/web/prisma/seeds/notification-template-data/load.ts
    - apps/web/prisma/seeds/notification-template-data/driver.ts
    - apps/web/prisma/seeds/notification-template-data/truck.ts
    - apps/web/prisma/seeds/notification-template-data/message.ts
    - apps/web/prisma/seeds/notification-template-data/finance.ts
    - apps/web/prisma/seeds/notification-template-data/route.ts
    - apps/web/prisma/seeds/notification-template-data/customer.ts
    - apps/web/prisma/seeds/notification-template-data/digest.ts
    - apps/web/prisma/seeds/seed-notifications.ts
  modified:
    - apps/web/prisma/schema.prisma
    - apps/web/package.json
decisions:
  - "Imported NotificationCategory from generated prisma path (src/generated/prisma) instead of @prisma/client, which is a stub that re-exports from .prisma/client — a path that does not exist in this project's custom output layout"
  - "Used PrismaPg adapter in seed runner to match Prisma 7 requirement; plain new PrismaClient() fails without adapter in this project"
  - "Created migration manually and applied via migrate deploy instead of migrate dev --create-only due to shadow database issue (P3006 — _prisma_migrations missing on shadow DB)"
  - "auth.uid() used for UserNotificationPreference user-scoped RLS policy (Supabase Auth JWT subject matches user ID)"
metrics:
  duration: "12 minutes"
  completed: "2026-05-14"
  tasks: 3
  files: 15
---

# Phase quick Plan 315: Notification System — Schema, Migration, and Seed Foundation Summary

Database foundation for the multi-tenant Notification System: 6 Prisma models, 3 enums, RLS policies, Postgres auto-population trigger, Tiptap JSON helper, TypeScript types, and 35 seeded notification templates across 9 categories.

## What Was Built

### Task 1: Schema + Migration + RLS

**Schema additions to `apps/web/prisma/schema.prisma`:**
- 3 new enums: `NotificationCategory` (USER/LOAD/DRIVER/TRUCK/MESSAGE/FINANCE/ROUTE/CUSTOMER/DIGEST), `NotificationChannel` (EMAIL/IN_APP), `NotificationSendStatus` (PENDING/SENT/FAILED/SKIPPED_DISABLED/SKIPPED_USER_PREF)
- 6 new models: `NotificationTemplate`, `TenantNotificationSettings`, `NotificationSubscription`, `UserNotificationPreference`, `NotificationSendLog`, `NotificationEmailConfig`
- Reverse relations added to `Tenant` (notificationSettings, notificationSubscriptions) and `User` (notificationSubscriptions, notificationPreferences)

**Migration `20260514200001_add_notification_system`:**
- Creates all 6 tables with correct indexes and unique constraints
- RLS enabled on `TenantNotificationSettings` and `NotificationSubscription` using `tenant_isolation_policy + bypass_rls_policy` (verbatim from init migration)
- RLS enabled on `UserNotificationPreference` using `user_isolation_policy` (auth.uid()) + `bypass_rls_policy`
- No RLS on `NotificationTemplate`, `NotificationSendLog`, `NotificationEmailConfig` (system-level tables)
- Partial unique index `NotificationEmailConfig_singleton_idx` enforces single-row constraint
- `seed_tenant_notification_settings()` Postgres function + `trg_seed_tenant_notification_settings` AFTER INSERT trigger on Tenant auto-populates TenantNotificationSettings for every active template

### Task 2: TypeScript Types + Helper + 9 Category Seed Files

**`apps/web/src/lib/notifications/types.ts`:**
- `TriggerKey` union (35 keys)
- `NotificationPayload` mapped type with fully typed payload per trigger
- `DefaultRecipientRule`, `VariableDef`, `NotificationTemplateSeed` types
- Imports from `@/generated/prisma` (custom Prisma output path)

**`apps/web/src/lib/notifications/build-template.ts`:**
- `buildDefaultTemplate()` helper returning valid Tiptap doc JSON (`{ type: "doc", content: [...] }`)
- Supports header (h2), paragraph with inline `{{vars}}`, optional CTA link, optional footer note

**9 category seed files (all in `apps/web/prisma/seeds/notification-template-data/`):**

| File | Templates | Trigger keys |
|------|-----------|-------------|
| user.ts | 4 | user.welcome, user.invited, user.password_reset, user.role_changed |
| load.ts | 10 | load.created, load.assigned, load.dispatched, load.picked_up, load.in_transit, load.delivered, load.invoiced, load.cancelled, load.bol_uploaded, load.pod_uploaded |
| driver.ts | 4 | driver.invited, driver.hos_violation, driver.license_expiring, driver.incident_reported |
| truck.ts | 3 | truck.maintenance_due, truck.document_expiring, truck.inspection_due |
| message.ts | 2 | message.received, message.broadcast |
| finance.ts | 4 | invoice.created, invoice.paid, invoice.overdue, payroll.processed |
| route.ts | 3 | route.assigned, route.completed, route.delayed |
| customer.ts | 2 | customer.tracking_link_sent, customer.delivered_notification |
| digest.ts | 3 | digest.daily_driver, digest.weekly_owner, digest.compliance_30day |
| **Total** | **35** | |

### Task 3: Master Seed Runner + npm Script

**`apps/web/prisma/seeds/seed-notifications.ts`:**
- Imports all 9 category arrays, concatenates to 35 templates
- Pre-flight validation: every `{{var}}` in subject/body must be in `availableVariables`
- Uniqueness check on triggerKeys
- Upsert semantics: insert on first run, update on subsequent runs — never overwrites `isActive`/`inAppEnabled`
- Uses `PrismaPg` adapter (Prisma 7 requirement)
- `npm run seed:notifications` registered in `apps/web/package.json`

**Run results:**
- First run: `Inserted: 35  Updated: 0  Total: 35`
- Second run: `Inserted: 0  Updated: 35  Total: 35`

## Verification Results

| Check | Result |
|-------|--------|
| `npx prisma validate` | PASS |
| `npx prisma generate` | PASS |
| `npx prisma migrate status` | Database schema up to date |
| `npx tsc --noEmit` | PASS (0 errors) |
| `npm run seed:notifications` (first run) | Inserted: 35, Updated: 0 |
| `npm run seed:notifications` (second run) | Inserted: 0, Updated: 35 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Prisma migrate dev --create-only fails due to shadow DB**
- **Found during:** Task 1
- **Issue:** `prisma migrate dev --create-only` and `--skip-seed` both failed. The shadow database cannot apply the existing migration `20260328000001_enable_rls_prisma_migrations_and_tenant` (P3006 error: `_prisma_migrations` table missing on shadow DB). This is a known pre-existing issue with this Supabase setup.
- **Fix:** Created the migration directory and SQL file manually, then applied via `prisma migrate deploy` which bypasses the shadow database. SQL was written to match Prisma's standard CREATE TABLE output format + custom RLS/trigger SQL appended.
- **Files modified:** `apps/web/prisma/migrations/20260514200001_add_notification_system/migration.sql`
- **Commit:** 9eb8fbf

**2. [Rule 3 - Blocking] @prisma/client import fails in source files**
- **Found during:** Task 2 TypeScript check
- **Issue:** `types.ts` imported from `@prisma/client` which is a stub (`export * from '.prisma/client/default'`) that expects a default-output Prisma client. This project uses a custom output path (`src/generated/prisma`), so `.prisma/client` doesn't exist.
- **Fix:** Changed import in `types.ts` to `@/generated/prisma` (the actual generated path). Updated all 9 category seed files to import from `../../../src/generated/prisma` instead of `@prisma/client`.
- **Note:** The existing `seed:fleet` script has the same broken import — it's a pre-existing issue, not introduced by this plan.
- **Commit:** a7d6e8e + f736e7c

**3. [Rule 3 - Blocking] PrismaClient requires PrismaPg adapter in seed runner**
- **Found during:** Task 3 first run attempt
- **Issue:** `new PrismaClient()` without arguments throws `PrismaClientInitializationError` because Prisma 7 in this project requires a driver adapter (PrismaPg). All seed files using `@prisma/client` would have the same issue.
- **Fix:** Added `PrismaPg` adapter initialization with `Pool` from the `pg` package in `seed-notifications.ts`, using `DIRECT_URL` env var. Added dotenv loading for local env files.
- **Commit:** f736e7c

## Open Questions for Plan 02 (Dispatcher Library)

1. **Recipient resolution**: The `DefaultRecipientRule` type has `{ type: 'related'; payloadKey: string }` — Plan 02 needs to define how `payloadKey` resolves to a user ID or email (e.g., `userId` → look up User by ID, `driverEmail` → external email).

2. **Customer templates**: `customer.tracking_link_sent` and `customer.delivered_notification` have empty `defaultRecipients: []`. The dispatcher in Plan 02 must handle external (non-User) recipient email addresses from the payload directly.

3. **Trigger invocation pattern**: How triggers fire (event system, server action call, cron) is Plan 02's scope. This plan only establishes the template data layer.

4. **TenantNotificationSettings backfill**: Existing tenants do NOT get auto-populated settings from the trigger (trigger is AFTER INSERT only). Plan 02 or a separate migration should backfill existing tenants after the seed runs.

5. **`summaryHtml` variable**: Digest templates declare `summaryHtml` as an available variable but it's not in the subject or body text (it's injected at render time). The seed validation correctly allows this since the variable appears in `availableVariables` regardless of body usage.

## Commits

| Hash | Message |
|------|---------|
| 9eb8fbf | feat(quick-315): add notification system Prisma schema, migration, and RLS |
| a7d6e8e | feat(quick-315): add notification types, build-template helper, and 9 category seed files |
| f736e7c | feat(quick-315): add idempotent master notification seed runner and npm script |

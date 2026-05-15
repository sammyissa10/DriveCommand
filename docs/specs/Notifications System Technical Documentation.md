# Notification System - Feature Design Document

## Overview

This document describes a multi-tenant notification system for Drive Command. It supports global email template management by SysAdmin, per-tenant template overrides, granular on/off controls per notification type, additional subscriber management, per-user channel preferences, in-app notifications via the existing bell icon, and a full email send audit log.

The system replaces Drive Command's existing scattered email senders (each with its own hardcoded React Email template) with a single, configurable, observable platform. Tenants configure notifications without contacting support. Non-technical users edit templates with a block-based visual editor - no HTML required.

---

## Developer Guide - How to Use This Document

This document is the single source of truth for building the notification system. It is structured in three layers:

1. **Concepts and architecture** (sections 1-11) - read first to understand what you are building and why
2. **Build prompts** (after section 11) - sequential GSD prompts that produce the system, in execution order
3. **Verification checklist** (final section) - the acceptance criteria for the entire feature

### How to build this feature

1. Read the entire document end-to-end before writing any code. Concepts inform the prompts.
2. Run the build prompts in order using the GSD workflow (`/gsd:execute-phase`). Each prompt is a separate plan and produces verifiable artifacts.
3. Each prompt is intentionally outcome-focused - it tells you what to build and what to verify, but leaves library and file choices to the implementer when reasonable. Always pick libraries and patterns that match what is already in Drive Command (Next.js 16 App Router, Prisma 7, Supabase Auth, Resend, shadcn/ui, Vercel cron). Do not introduce new frameworks or libraries unless the prompt explicitly calls for one or it is the established standard for the task.
4. After each plan completes, verify it against the plan's success criteria before starting the next.
5. After all plans complete, run the full Phase Verification Checklist at the end of this document.

### What you are building

A centralized notification platform with these capabilities:

- A single dispatch entry point that every server action and cron job calls when a notifiable event occurs
- A library of ~35 standard notifications covering trucking-domain events (loads, drivers, trucks, messages, finance, routes, customers, scheduled digests, user/access events)
- A SysAdmin admin page to manage global templates and email configuration
- A tenant settings page for OWNER and MANAGER roles to toggle notifications, customize templates, manage additional subscribers, and audit sends
- A personal preferences page for every authenticated user to control which channels they receive each notification on
- A block-based visual editor (Tiptap, via the official React Email Editor) so non-technical users can edit beautiful templates without writing HTML
- Auto-population: every new tenant starts with all standard notifications already enabled
- A full audit log of every send (sent, failed, skipped) viewable from both SysAdmin and tenant scopes

### What you are NOT building (deferred)

- SMS notifications (Twilio) - Phase 2
- Mobile push routing through this system - Phase 2 (Drive Command already has Expo push tokens; routing them through the dispatcher is deferred)
- Webhook delivery to third-party systems - Phase 3
- Per-tenant custom sending domain - Phase 2
- AI-generated template copy - future

### Where this slots into the existing codebase

- **Email transport** stays as Resend via the existing `RESEND_API_KEY` integration. Do not replace.
- **In-app notifications** extend the existing `InAppNotification` table and bell icon (Quick-228). Do not create a parallel system.
- **Idempotency** uses a new `NotificationSendLog` table. The existing `NotificationLog` table from Phase 9 is preserved for backward compatibility but is not the path forward.
- **Auth** uses Drive Command's existing Supabase Auth + `app_metadata` role pattern (Phase 37.6). All actions must use the established `requireAuth` / `requireRole` / `requireAdminAccess` guards.
- **Tenant isolation** uses the existing `getTenantPrisma()` + RLS pattern for tenant-facing actions, and the base `prisma` client + `bypass_rls` transaction pattern for system-level work (the dispatcher, cron jobs, audit log writes).

---

## Core Concepts

**Trigger keys** are machine-readable identifiers that link a template to the event that fires it. Examples: `user.welcome`, `load.assigned`, `driver.license_expiring`, `digest.daily_driver`. Each trigger key maps to exactly one active template per tenant at any time.

**Global templates** are the system defaults. SysAdmin owns these. They are pre-populated on deployment and serve as the baseline for all tenants. A global template cannot be deleted - only deactivated. When deactivated globally, the trigger does not fire for any tenant regardless of tenant-level toggles.

**Tenant overrides** are per-tenant copies of a global template. When a tenant edits a template, a copy is forked from the global version and stored against that tenant. The global template is never modified. A tenant can restore their override back to the global default at any time.

**Notification subscriptions** allow OWNER and MANAGER users to subscribe additional team members to specific triggers beyond the default recipients. Example: subscribe a project manager to `load.assigned` notifications even when they are not the assigned driver.

**User notification preferences** allow every authenticated user (including drivers) to opt out of email or in-app delivery on a per-trigger basis. Defaults are enabled.

**Send log** is an append-only audit table that records every notification attempted - sent, failed, or skipped - with the recipient, channel, subject, trigger key, tenant, status, and error details if applicable.

**Channels** in v1 are EMAIL and IN_APP. The dispatcher fans out to both for any recipient who has them enabled. SMS and mobile push are deferred to Phase 2.

---

## Database Architecture

### Tables

**`NotificationTemplate`** - Global template library. One row per trigger key. Contains the trigger key, category, display name, description of when it fires, default subject, default block JSON (Tiptap document), cached default HTML, available variables (JSON array describing each variable for the picker), default recipient rules (JSON array), global active toggle, and in-app channel toggle. All rows seeded on deployment. SysAdmin can edit any row. Tenants can read but not write. **No RLS** (system table).

**`TenantNotificationSettings`** - Per-tenant preferences. One row per tenant per trigger key. Stores whether the notification is active for that tenant, optional custom subject, optional custom block JSON (the tenant override), and cached custom HTML. The `hasOverride` field is computed: true when custom block JSON is not null. **RLS:** tenant-scoped reads, OWNER/MANAGER writes.

**`NotificationSubscription`** - Additional subscribers per trigger per tenant. Stores tenant ID, trigger key, and user ID. **RLS:** tenant-scoped.

**`UserNotificationPreference`** - Per-user opt-out per channel. Stores user ID, trigger key, email enabled flag, in-app enabled flag. Defaults to enabled (missing row = enabled on both channels). **RLS:** users see and edit only their own rows.

**`NotificationSendLog`** - Audit trail. Every notification attempt writes a row regardless of outcome. Contains tenant ID, trigger key, recipient user ID and email, channel, subject, status (PENDING / SENT / FAILED / SKIPPED_DISABLED / SKIPPED_USER_PREF), error message, idempotency key, related entity type and ID, sentAt and createdAt timestamps. **No RLS** (system-level table); reads are filtered by tenantId in actions for tenant scope.

**`NotificationEmailConfig`** - One row, global. Stores the sender display name, from email address, and reply-to address used for all outbound notifications. Managed exclusively by SysAdmin. The Resend API key itself stays in environment variables - see ADR below. Single-row constraint enforced via partial unique index.

### RLS policies

SysAdmin bypasses all RLS via `bypass_rls` transactions and can read and write everything. OWNER and MANAGER roles can read all global templates (read-only) and read/write their own tenant settings and subscriptions. All authenticated users can read and write only their own `UserNotificationPreference` rows. The send log is read-only for OWNER and MANAGER scoped to their tenant, and fully readable by SysAdmin across all tenants.

### Auto-population trigger

When a new tenant is created, a Postgres `AFTER INSERT ON Tenant` trigger fires `seed_tenant_notification_settings()` which inserts one `TenantNotificationSettings` row per active global template into the new tenant with `isActive = true` and no custom body. This means the `/settings/notifications` page is fully populated on day one - no fallback lookups, no empty states.

### ADR - Email credentials

`RESEND_API_KEY` and `RESEND_FROM_EMAIL` remain in environment variables. The `NotificationEmailConfig` table stores only `fromName`, `fromEmail`, `replyTo`. Putting credentials behind a UI creates a meaningful security surface (compromised admin = compromised mail) and Drive Command rotates API keys infrequently. The SysAdmin UI shows credential **status** (Configured / Missing) but never the value.

---

## Dispatch Architecture

Email and in-app delivery never happen synchronously in the originating server action. Every notification flows through a single library function:

```typescript
dispatchNotification(triggerKey, { tenantId, payload, relatedEntity }): Promise<{ sent, skipped, failed }>
```

The flow inside the dispatcher:

1. Fetch the `NotificationTemplate` by trigger key. If globally inactive, log SKIPPED_DISABLED, return.
2. Fetch the `TenantNotificationSettings` for the tenant. If tenant-disabled, log SKIPPED_DISABLED, return.
3. Resolve recipients: union of default recipients (resolved from the payload using the template's recipient rules) and `NotificationSubscription` rows for this tenant + trigger.
4. For each recipient, look up `UserNotificationPreference`:
   - If `emailEnabled = false`, skip email channel, log SKIPPED_USER_PREF
   - If `inAppEnabled = false`, skip in-app channel
5. Resolve the template content: prefer the tenant's `customBlockJson` if present, otherwise use the global `defaultBlockJson`. Same for the subject.
6. Render: substitute `{{variables}}` from the payload into both subject and body, convert the Tiptap JSON to HTML via `@tiptap/html`, then wrap the resulting fragment in a single React Email shell component (`DynamicTemplateEmail`) and render to final HTML.
7. Compute the idempotency key. If a SENT row already exists for that key, skip.
8. Email channel: send via the existing Resend client. Log result.
9. In-app channel: insert into the existing `InAppNotification` table. Log result.
10. All log writes use a `bypass_rls` transaction.

### Why server actions, not Postgres triggers

The reference design used Postgres triggers calling `pg_net.http_post` to a Supabase Edge Function. Drive Command rejects this pattern for these reasons:

- Drive Command runs always-on Vercel - there is no decoupling benefit
- `pg_net` has a 200 req/sec ceiling and stores responses in unlogged tables that are lost on crash
- Trigger functions need a hardcoded service role key, creating rotation pain
- Existing send functions already work fire-and-forget from server actions
- Adding `pg_net` plus a separate Edge Function runtime is operational complexity for zero gain

**Drive Command pattern:** server actions and cron jobs call `dispatchNotification(...)` directly. The dispatcher catches all internal errors per recipient so a single failure does not abort the rest. Callers use `.catch()` to log dispatch failures without blocking their own response.

### Caller pattern

```typescript
// Inside any server action that fires a notification:
dispatchNotification('load.assigned', {
  tenantId,
  payload: { loadId, loadNumber, driverId, driverName, originCity, destCity },
  relatedEntity: { type: 'Load', id: loadId },
}).catch(err => console.error('[notifications] dispatch failed', err));
```

### Template variable rendering

Templates use `{{variable_name}}` syntax. Variables appear in the editor as styled chips (Tiptap mention nodes) and serialize to `{{name}}` strings on save. At send time, the dispatcher performs simple string replacement of all variables in both the subject line and the rendered HTML body. Available variables are defined per template and stored in the `availableVariables` JSONB column on `NotificationTemplate`. Every variable used in a default subject or body must be declared in `availableVariables` with a name, description, and sample value.

### Scheduled notifications

Daily and weekly digests run via Vercel cron (the same mechanism Drive Command already uses for compliance reminders), not via `pg_cron`. Cron routes call `dispatchNotification` once per eligible recipient with a pre-built payload. If a recipient has nothing to report (e.g. no loads in their daily summary), the payload builder returns null and no email is sent.

---

## Standard Notification Catalog

~35 triggers across 9 categories ship pre-seeded:

| Category | Triggers |
|---|---|
| **User** | `user.welcome`, `user.invited`, `user.password_reset`, `user.role_changed` |
| **Load** | `load.created`, `load.assigned`, `load.dispatched`, `load.picked_up`, `load.in_transit`, `load.delivered`, `load.invoiced`, `load.cancelled`, `load.bol_uploaded`, `load.pod_uploaded` |
| **Driver** | `driver.invited`, `driver.hos_violation`, `driver.license_expiring`, `driver.incident_reported` |
| **Truck** | `truck.maintenance_due`, `truck.document_expiring`, `truck.inspection_due` |
| **Message** | `message.received`, `message.broadcast` |
| **Finance** | `invoice.created`, `invoice.paid`, `invoice.overdue`, `payroll.processed` |
| **Route** | `route.assigned`, `route.completed`, `route.delayed` |
| **Customer** | `customer.tracking_link_sent`, `customer.delivered_notification` |
| **Digest** | `digest.daily_driver`, `digest.weekly_owner`, `digest.compliance_30day` |

Each ships with a polished default template, a description of when it fires, default recipient rules (e.g. `load.assigned` defaults to the assigned driver and OWNER role), and a list of available variables.

---

## SysAdmin Capabilities

Accessed at `/admin/notifications`. Three tabs.

**Email Sender Configuration** - Set the from name, from email address, and reply-to address used for all outbound notifications. Show Resend credential status (Configured / Missing) read from `process.env`. The from email domain must be verified with Resend before emails will deliver reliably (SPF / DKIM / DMARC). This is a single global configuration.

**Template Management** - View all notification templates in a table showing name, category, trigger key, active status, and last modified date. Click any template to open a side panel editor with a subject field, a block-based body editor (the React Email Editor on top of Tiptap), a variable picker sidebar showing the template's available variables (clickable to insert as chips), a Preview tab that renders the template in a sandboxed iframe with sample data, and a global active toggle. Deactivating a template globally suppresses that notification for all tenants regardless of their own settings.

**Send Log** - View all notifications attempted across all tenants. Filterable by status, trigger key, tenant, recipient, and date range. KPI cards: total sent today, total failed today, total sent in last 30 days, failure rate. Failed rows expand inline to show the full error message. A health dashboard tile flags the top failing trigger if failure rate exceeds 5%.

---

## Org Admin (Tenant) Capabilities

Accessed at `/settings/notifications`. Available to OWNER and MANAGER roles. Three tabs.

**Notifications Tab** - A grouped accordion of all notification types, grouped by category. Each row shows the notification display name, an info icon with the description tooltip, a Default or Customized badge, an Edit Template button, and an active toggle. Toggling off creates or updates a row in `TenantNotificationSettings` with `isActive = false`. The toggle is locked (with a tooltip explaining why) if SysAdmin has globally disabled that notification.

Clicking Edit Template opens a side panel. If no tenant override exists, the panel shows the global template in read-only mode with a banner ("Currently using DriveCommand default - click Customize to make changes") and a Customize Template button. Clicking Customize forks a copy of the global block JSON into `TenantNotificationSettings` and switches the editor to edit mode. A Restore to Default button (with confirmation dialog) clears the customized subject and body, reverting to the global default.

**Subscribers Tab** - A card per trigger showing additional subscribers. OWNER or MANAGER can subscribe any tenant user to any active notification trigger. Example: subscribe a project manager to `load.assigned` so they receive all assignment notifications even when not the assigned driver. Subscriptions are managed with an Add Subscriber modal (user picker plus trigger picker) and a remove button on each row.

**Send Log Tab** - Same structure as the SysAdmin send log but tenant-scoped. No tenant filter (always the current tenant). 25 rows per page. KPI cards show tenant-scoped stats.

---

## Per-User Capabilities

Accessed at `/settings/my-notifications`. Available to **every authenticated user**, including drivers.

A grouped list of all triggers active for the user's tenant. Two checkboxes per row: "Email me" and "Show in-app." Saving any preference upserts a row in `UserNotificationPreference` for that user. Defaults to enabled when no row exists, so users who never visit this page receive everything by default.

Drivers visiting this page see the same list and can opt out of any notification. Drivers do **not** see the OWNER/MANAGER notifications page - only their own preferences.

---

## Auto-Population on New Tenant Creation

When a new tenant is created, a Postgres trigger fires `AFTER INSERT ON Tenant` and inserts one `TenantNotificationSettings` row per active `NotificationTemplate` for the new tenant with `isActive = true` and no custom body. The `/settings/notifications` page is fully populated on day one with all standard notifications enabled, showing global defaults until the tenant chooses to customize.

---

## Adding New Notification Types

To add a new notification type after this phase ships:

1. Add the new trigger key to the `TriggerKey` union and `NotificationPayload` mapped type in `src/lib/notifications/types.ts`.
2. Add a new entry to the appropriate category seed file in `prisma/seeds/notification-template-data/` with `triggerKey`, display name, description, default subject, default block JSON (built via the `buildDefaultTemplate` helper), available variables, default recipient rules.
3. Run `npm run seed:notifications` to upsert the new template into the database.
4. Add the `dispatchNotification('new.trigger.key', {...})` call to the server action or cron job that should fire it.
5. The new template automatically appears in the SysAdmin template list and in every tenant's notification settings page. The Postgres trigger does not back-fill existing tenants - for that, run a one-time SQL migration that inserts a `TenantNotificationSettings` row for each existing tenant.

No application code changes are required for the template to appear in the UI - the settings pages are driven dynamically from the `NotificationTemplate` table.

---

## Disabling Notifications

**Globally (SysAdmin):** Toggle `isActive = false` on the `NotificationTemplate` row. The dispatcher logs SKIPPED_DISABLED and short-circuits - no email or in-app for that trigger key regardless of tenant settings.

**Per Tenant (Owner/Manager):** Toggle the active switch on the notification row in `/settings/notifications`. The dispatcher logs SKIPPED_DISABLED for sends to that tenant and short-circuits. The global template remains active for all other tenants.

**Per User (Email or In-App channel):** Uncheck the relevant box at `/settings/my-notifications`. The dispatcher logs SKIPPED_USER_PREF for the disabled channel only - the other channel still fires if enabled.

---

## Email Provider Setup

The system uses Resend (Drive Command's existing email transport). The Resend SDK's `resend.emails.send({ from, to, subject, react })` API stays the dispatcher's only outbound email path. Do not replace it.

Required env vars:

- `RESEND_API_KEY` - Resend API key from the Resend dashboard
- `RESEND_FROM_EMAIL` - verified sender address (must be on a domain verified in Resend)
- `RESEND_FROM_NAME` - display name (optional)

Before any emails will deliver reliably, the from-email domain must be verified in the Resend dashboard with SPF, DKIM, and DMARC DNS records configured per Resend's documentation. Without these, emails land in spam or fail to send at all.

---

## Migration Strategy

Drive Command already has scattered `send*` functions in `src/lib/email/` (sendDriverInvitation, sendOwnerInvitation, sendMaintenanceReminder, sendDocumentExpiryReminder, sendDriverDocumentExpiryReminder, sendGeofenceAlert, customer-notifications, send-support-notifications). These call sites are scattered across server actions and cron jobs.

The migration approach is **wrap, do not rewrite**:

1. The new system ships in plans 41-01 through 41-04 with all 35 templates seeded and the dispatcher operational.
2. Plan 41-05 wraps each existing `send*` function so its public signature stays identical, but internally it calls `dispatchNotification(triggerKey, payload)` instead of rendering its own template.
3. Each wrapper has a try/catch fallback to the legacy implementation - if dispatch fails for any reason, the original code path runs and the email still sends. This makes migration zero-risk: existing flows never break.
4. Existing call sites do not change. Wrapping is invisible to callers.
5. After two weeks of stable operation in production, the inner legacy implementations are deleted in a follow-up cleanup pass; only the wrapper signatures remain.

The `send-support-notifications.ts` file is **excluded** from migration - support notifications are SysAdmin-internal (they go to the DriveCommand support inbox, not to tenant users) and are not tenant-configurable.

---

## Build Plans

Run these in order using the GSD workflow. Each prompt is self-contained and copy-ready. Each builds on the previous plan's output. Each prompt is intentionally written to focus on **outcomes and constraints** rather than dictating every file path or library - the implementer should follow Drive Command's established conventions.

---

## Prompt 1 of 5 - Database Foundation

```
## Task: Phase 41 Plan 01 - Notification System Database Foundation

Use the GSD skill to build this feature.

**Context:**
This is Plan 01 of the Tenant-Configurable Notification System. It creates the database layer, RLS policies, the auto-population trigger that fires on new Tenant inserts, and seeds ~35 standard notification templates across 9 categories. No UI work in this plan - UIs build on this in later plans. Read the parent feature design document before starting.

**Scope:**
- Modify: prisma/schema.prisma, package.json (add a seed script)
- Create: a Prisma migration containing tables, RLS, and the auto-population trigger; one seed file per category; a master seed runner; a TypeScript types file for trigger keys and payloads
- Do NOT touch: existing NotificationLog model and its migration, anything in src/emails/, any existing send* functions in src/lib/email/

**Outcome:**
Six new tables exist with RLS following Drive Command's existing tenant_isolation_policy + bypass_rls_policy pattern. A Postgres trigger auto-populates TenantNotificationSettings for every new tenant. ~35 standard templates are seeded covering: user (4), load (10), driver (4), truck (3), message (2), finance (4), route (3), customer (2), digest (3). Strict TypeScript types for trigger keys and payloads.

**What to build:**
1. Add to the Prisma schema:
   - Three enums: NotificationCategory, NotificationChannel, NotificationSendStatus
   - Six models matching the design doc Section "Database Architecture": NotificationTemplate, TenantNotificationSettings (unique on tenantId+triggerKey), NotificationSubscription (unique on tenantId+triggerKey+userId), UserNotificationPreference (unique on userId+triggerKey), NotificationSendLog (no RLS, indexes on tenantId / triggerKey / idempotencyKey), NotificationEmailConfig (single-row table)
2. Generate the Prisma migration. Then append SQL to it for:
   - RLS enable + tenant_isolation_policy + bypass_rls_policy on the three tenant-scoped tables (copy verbatim from the existing init migration's pattern - do not invent a new RLS pattern)
   - User-scoped policy on UserNotificationPreference (filtering by user_id) - bypass_rls used for system-level reads only
   - The seed_tenant_notification_settings() trigger function and AFTER INSERT trigger on Tenant
   - A partial unique index enforcing the single-row constraint on NotificationEmailConfig
3. A TypeScript types file with the TriggerKey union, a NotificationPayload mapped type with a typed payload shape per trigger, a DefaultRecipientRule type, a VariableDef type, and a NotificationTemplateSeed type used by the seed files.
4. A single helper function buildDefaultTemplate({ headerText, paragraphTextWithVars, ctaLabel?, ctaUrl?, footerNote? }) that returns valid Tiptap document JSON. Use this helper for every default template - never hand-write malformed JSON.
5. One seed file per category (9 total: user, load, driver, truck, message, finance, route, customer, digest), each exporting a typed array of NotificationTemplateSeed entries. Each entry must include a triggerKey, displayName, description (when it fires), default subject with {{variables}}, default block JSON via the helper, an availableVariables array (every {{var}} used in subject or body must be declared here with a sampleValue), default recipient rules, isActive: true, inAppEnabled: true.
6. A master seed runner that imports all 9 category arrays, concatenates, and upserts each by triggerKey. Upsert must update subject / blockJson / availableVariables / defaultRecipients on every run, but set isActive and inAppEnabled on insert only (never overwrite a SysAdmin runtime toggle on re-seed).
7. Add an "seed:notifications" entry to package.json scripts.

**Best-practices and constraints:**
- Follow the existing Drive Command Prisma + RLS pattern exactly. Read prisma/schema.prisma and the init migration before writing the new migration. Do NOT invent a new RLS pattern; copy the existing one verbatim and adapt names.
- Do NOT add the pg_net or pg_cron extensions. Drive Command uses Vercel cron, not Supabase Edge Functions.
- Do NOT add a new ORM, query builder, or migration tool. Use Prisma 7 (already in the project).
- Do NOT introduce a new validation library. Use Zod (already in the project) where validation is needed.
- All new models include createdAt and updatedAt with @default(now()) and @updatedAt.
- Tiptap JSON in defaultBlockJson must be valid (type: "doc", content: [...]). Use the helper everywhere.
- Idempotency: running the seed script twice must produce identical database state.
- Every {{variable}} in any default subject or body must appear in that template's availableVariables list.

**Verify:**
- npx prisma validate and npx prisma generate both succeed
- npm run seed:notifications can be invoked twice without errors and produces identical state
- npx tsc --noEmit passes
- npm run build passes
- All ~35 templates have non-empty defaultBlockJson and at least one availableVariable
- Every {{var}} in subject/body appears in availableVariables

Before writing code, briefly explain your approach in 2-3 sentences (especially how you'll structure the buildDefaultTemplate helper to keep all 35 seeds DRY), then implement. If a step doesn't work - for example, prisma migrate fails on the trigger SQL - note what failed and propose an alternative before stopping.
```

---

## Prompt 2 of 5 - Dispatcher Library

```
## Task: Phase 41 Plan 02 - Notification Dispatcher Library

Use the GSD skill to build this feature.

**Context:**
This is Plan 02 of the Tenant-Configurable Notification System. Plan 01 created the database. This plan builds the single-entry-point dispatcher library that every server action and cron job calls. It handles template resolution (tenant override vs global), recipient resolution (defaults + subscribers), per-user preference filtering, variable substitution, channel fan-out (email + in-app), and audit logging.

**Scope:**
- Create: a notifications library directory with the dispatcher function, recipient resolver, template renderer, idempotency helpers, audit log helpers, in-app writer, README, and unit tests
- Create: a single React Email shell component that wraps any dynamic body HTML in Drive Command's standard email branding
- Do NOT touch: any existing src/emails/*.tsx files, prisma/schema.prisma, any existing send* senders in src/lib/email/

**Outcome:**
A single function dispatchNotification(triggerKey, options) is the canonical path for emitting any notification. It resolves the template (tenant override > global), resolves recipients (default rules + subscriptions), filters by per-user preferences, substitutes variables, renders email HTML from Tiptap JSON, writes audit log rows for every recipient/channel combo, and fans out to email + in-app. Fire-and-forget from the caller's perspective. Internal try/catch per recipient - one failure does not abort others.

**What to build:**
1. The dispatcher function dispatchNotification(triggerKey, { tenantId, payload, relatedEntity }) that orchestrates the dispatch flow per the design doc Section "Dispatch Architecture".
2. A recipient resolver that handles three rule types (role, tenant_owners, related) and unions with NotificationSubscription rows, deduped by userId, filtered by users with no email, with email-disabled users routed to in-app only.
3. A template renderer with two functions:
   - substituteVariables(text, payload) - simple {{name}} replacement, missing vars become empty string with a console.warn (do NOT throw)
   - renderTemplate(blockJson, payload, subject) - converts Tiptap JSON to HTML, substitutes variables, wraps in the React Email shell, renders to final HTML
4. An idempotency helper - generates keys in the format `{triggerKey}:{relatedType||none}:{relatedId||none}:{userId}:{YYYY-MM-DD}` for digests and full ISO timestamp truncated to second for events; checks for existing SENT row.
5. An audit log helper that writes NotificationSendLog rows in a bypass_rls transaction.
6. An in-app helper that writes to the existing InAppNotification table - first read that table's actual schema (created in Quick-228) and adapt field names to match. Do NOT invent fields.
7. A single React Email shell component that accepts { bodyHtml, brandName?, footerAddress? } and renders Drive Command's standard email shell (header with logo/brand, dangerouslySetInnerHTML in a controlled wrapper Section, footer). This is the only place HTML is injected.
8. Unit tests covering at minimum: globally inactive trigger, tenant-disabled trigger, per-user email-off but in-app-on, idempotent re-send, variable substitution through the full pipeline, one-recipient-throws-others-still-receive.
9. A README documenting the public API with two usage examples (server action call site, cron call site), the dispatch flow as a numbered list, how to add a new trigger, and known limitations.

**Best-practices and constraints:**
- Use Drive Command's existing email transport. Do NOT add a new email library or service. Call the existing Resend client (`resend.emails.send({ from, to, subject, react })`). Pass the React Email shell as the react prop.
- Use the BASE prisma client with bypass_rls transactions. Do NOT use getTenantPrisma() - the dispatcher runs from already-authorized contexts (server actions that pre-validate and cron jobs that have no request context).
- Use Tiptap's official HTML renderer (@tiptap/html generateHTML) to convert blockJson to HTML. Do NOT write a custom JSON-to-HTML walker.
- Use the existing @react-email/render package (already in the project from Phase 9) to render the React Email shell to final HTML. Do NOT add a new email rendering library.
- Use Vitest (already in the project) for unit tests. Do NOT add a new test framework.
- The dispatcher must catch all internal errors per recipient. The caller's .catch() is a safety net, not the primary error boundary.
- Variable substitution happens AFTER Tiptap JSON to HTML conversion so {{vars}} in mention nodes survive. Verify this with a unit test that uses literal "{{driverName}}" text and asserts the substituted output.
- Idempotency keys use ISO date for digests (one per day per recipient), full ISO timestamp truncated to second for events.

**Verify:**
- npx tsc --noEmit passes
- All unit tests pass (or are stubbed with a documented reason if a live DB is required)
- The README documents the public API with two working examples
- No use of getTenantPrisma anywhere in the dispatcher
- Variable substitution works end-to-end through Tiptap JSON to HTML to final wrapped email (covered by a test)

Before writing code, briefly explain your approach in 2-3 sentences - particularly how you handle the Tiptap JSON to HTML to wrapped React Email pipeline - then implement. If @tiptap/html does not produce email-safe HTML for some block types, document the limitation in the README and emit a console.warn at render time rather than silently breaking.
```

---

## Prompt 3 of 5 - SysAdmin UI

```
## Task: Phase 41 Plan 03 - SysAdmin Notification Management UI

Use the GSD skill to build this feature.

**Context:**
This is Plan 03 of the Tenant-Configurable Notification System. Plans 01-02 built the database and dispatcher. This plan builds the SysAdmin admin page at /admin/notifications: template management with a block-based visual editor, email configuration, and a cross-tenant send log viewer.

**Scope:**
- Create: SysAdmin notifications page with three tabs (Templates / Email Config / Send Log), each tab as a client component, server actions for templates / config / log, a reusable BlockEditor component (used again in Plan 04), a variable picker, and a sandboxed live preview iframe
- Modify: the SysAdmin layout to add a Notifications nav link
- Do NOT touch: any owner-portal files (Plan 04), the dispatcher library (Plan 02), prisma/schema.prisma

**Outcome:**
A SysAdmin can navigate /admin/notifications and see three tabs.

Templates tab: a sortable, filterable table of all ~35 templates with category badges, active toggles, and last-modified column. Clicking a row opens a side sheet with a block-based visual editor pre-loaded with the template's defaults. The editor has a clickable variable picker sidebar that inserts variables as styled chips. A sandboxed iframe shows live HTML preview as the user edits (debounced 250ms). Save persists block JSON and regenerates cached HTML.

Email Configuration tab: a form to edit fromName, fromEmail, replyTo. Shows Resend credential status (Configured / Missing) read server-side. Never sends the credential value to the client.

Send Log tab: a cross-tenant audit table with KPI cards (sent today, failed today, sent 30d, failure rate). Filters: tenant, trigger, status, date range, recipient.

**What to build:**
1. The page (server component) that requires admin access, reads ?tab= from searchParams, server-fetches initial data for the active tab, and renders three tab children with that data as props.
2. The Templates tab using the same TanStack Table pattern Drive Command already uses on /admin/tenants. Selecting a row opens a shadcn Sheet with the template editor.
3. The Email Configuration tab with a Zod-validated form and a credential-status badge.
4. The Send Log tab with KPI cards, filter controls, and paginated rows. Failed rows expand to show the error message inline.
5. Server actions for templates (list, get, update, toggleActive), email config (get, update), and send log (list with filters, get stats). Every action requires admin access.
6. A reusable BlockEditor component (this is the editor used in both SysAdmin and tenant UIs). It must show: subject input above, variable picker on the left, editor in the middle, sandboxed preview iframe on the right. Props include readOnly, onSave, onCancel, onRestoreDefault. Variables insert as Tiptap mention nodes that serialize back to {{name}}.
7. A variable picker component that renders the loaded template's availableVariables as clickable items with name + description + sample value.
8. A sandboxed preview iframe component that uses the dispatcher's render-template helper to produce HTML and writes it via srcDoc. Debounced.

**Best-practices and constraints:**
- Use the official React Email Editor package (built by the React Email team on top of Tiptap) for the block editor. Drive Command already uses @react-email/components - this is the same vendor's editor and the right standard. If the official editor's API has gaps for the variable mention extension, fall back to plain Tiptap with @tiptap/extension-mention; document the fallback in a header comment. Do NOT introduce a different rich-text editor.
- Use shadcn/ui components for all chrome (Sheet, Tabs, Table, Card, Input, Button, AlertDialog). Match the existing /admin/tenants design language exactly. Do NOT add a different component library.
- Use TanStack Table (already in the project) for the templates table - same pattern as /admin/tenants. Do NOT add a new table library.
- Use Drive Command's existing requireAdminAccess helper in every server action.
- Use the existing BASE prisma client for cross-tenant reads with bypass_rls. Do NOT use getTenantPrisma() in admin actions.
- Use Zod (already in the project) for form validation.
- The editor side panel uses shadcn Sheet. Do NOT use a custom modal.
- Never expose RESEND_API_KEY value to the client. The server action returns only a boolean credential status.
- SysAdmin can edit and toggle but NOT add/delete templates from the UI in this version. Document this limitation in a code comment in the templates tab. New triggers come from a code change + seed run.
- Variable picker source: pull availableVariables from the loaded template, not from a global enum.

**Verify:**
- npm run build passes with no errors
- All ~35 templates visible at /admin/notifications
- Editing a template persists changes; reopening shows the updated content
- RESEND_API_KEY never appears in any network response (verify via Network tab and grep on action return shapes)
- Admin nav has the new Notifications link
- Editor persists Tiptap JSON faithfully (open + save without changes does not modify defaultBlockJson)
- Live preview iframe updates on edit

Before writing code, briefly explain your approach in 2-3 sentences - especially how the BlockEditor's variable mention extension serializes back to {{name}} - then implement. If the official React Email Editor's API surface differs from expectations, document the workaround in the BlockEditor file as a code comment.
```

---

## Prompt 4 of 5 - Tenant UI and Per-User Preferences

```
## Task: Phase 41 Plan 04 - Tenant Notification Settings UI and Per-User Preferences

Use the GSD skill to build this feature.

**Context:**
This is Plan 04 of the Tenant-Configurable Notification System. Plan 03 built the SysAdmin UI. This plan builds the OWNER/MANAGER-facing settings UI at /settings/notifications and the personal preferences page at /settings/my-notifications. It REUSES the BlockEditor component from Plan 03 with additional flows: read-only view to Customize to Edit to optional Restore Default.

**Scope:**
- Create: tenant notifications page with three tabs (Notifications / Subscribers / Send Log), a tenant template editor panel (wraps BlockEditor with the customize/restore flow), an Add Subscriber modal, server actions for tenant settings and subscribers and tenant-scoped send log, the per-user preferences page, and per-user preference server actions
- Modify: the navigation sidebar to add Notifications (OWNER/MANAGER only) and My Notifications (all roles) links
- Do NOT touch: anything in /admin/, the dispatcher library, prisma/schema.prisma, the BlockEditor itself

**Outcome:**
OWNER and MANAGER can navigate /settings/notifications and see three tabs.

Notifications tab: triggers grouped by category in shadcn Accordion. Each row shows display name, info-icon description tooltip, Default/Customized badge, Edit Template button, active toggle. Globally-disabled templates show a locked toggle with explanatory tooltip.

Edit Template flow: clicking opens a side panel. If no override exists, shows the BlockEditor in read-only mode with a yellow banner ("Currently using DriveCommand default - click Customize to make changes") and a Customize Template button. Clicking Customize forks the global blockJson into customBlockJson and switches to edit mode. A Restore to Default button (with confirmation dialog) clears customSubject and customBlockJson.

Subscribers tab: lists subscribers grouped by trigger with Add Subscriber modal (user picker + trigger picker, validates non-duplicate).

Send Log tab: tenant-scoped log table with the same filters as Plan 03 minus the tenant column, plus tenant-scoped KPI cards.

Every authenticated user (including drivers) can navigate /settings/my-notifications and see all triggers active for their tenant grouped by category. Two checkboxes per row: Email me, Show in-app. Saves on change with optimistic update.

**What to build:**
1. Server actions for tenant notifications (list settings with global+tenant join, getSettingForTrigger, customizeTemplate, restoreDefault, toggleActive, listSubscribers, addSubscriber, removeSubscriber, listSendLog). Every action requires OWNER or MANAGER role.
2. Server actions for per-user preferences (getMyPreferences with defaults-to-enabled when no row exists, updateMyPreference upsert). These require auth only - every authenticated user can use them.
3. The /settings/notifications page (server component) requiring OWNER or MANAGER, fetching initial data, rendering shadcn Tabs with three children.
4. The Notifications tab as a grouped accordion. Each row's active toggle calls toggleActive optimistically with rollback on error. Globally-disabled rows show a locked toggle with tooltip.
5. A tenant template editor panel that wraps BlockEditor with the read-only-then-customize flow described in Outcome. The Restore to Default button uses shadcn AlertDialog for confirmation.
6. A Subscribers tab with cards per trigger and an Add Subscriber modal (shadcn Dialog) that uses two combobox inputs: trigger picker (active triggers for this tenant) and user picker (tenant users via the existing user list helper).
7. A tenant Send Log tab with the same column structure as Plan 03 minus tenant, scoped via session.tenantId (use bypass_rls transaction with manual tenantId filter since NotificationSendLog has no RLS).
8. The /settings/my-notifications page (server component) requiring auth (NOT requireRole - every authenticated user including drivers).
9. A preferences-form client component with grouped accordion by category, two checkboxes per row, optimistic update on change.
10. Sidebar updates: Notifications link visible to OWNER and MANAGER only, My Notifications link visible to all authenticated users.

**Best-practices and constraints:**
- Use Drive Command's existing requireRole(['OWNER', 'MANAGER']) helper for tenant settings actions. Use requireAuth for per-user preferences actions.
- Use getTenantPrisma() in tenant settings actions - RLS handles isolation automatically. The dispatcher uses bypass_rls because it serves cron + system contexts; tenant settings UI is always per-request.
- Use shadcn/ui components throughout (Accordion, Sheet, Tabs, Card, Tooltip, AlertDialog, Dialog, Combobox). Match the design language of existing /settings/* pages exactly.
- The active toggle on a globally-disabled trigger must be visually locked with a tooltip explanation, not just hidden. Hidden options confuse users.
- The Restore to Default button must require confirmation - no accidental data loss.
- Per-user preferences default to enabled when no row exists. Saving "off" creates a row with the relevant flag false; the other flag preserves its current value.
- The /settings/my-notifications page must work for drivers. Drivers must NOT have access to /settings/notifications - the page-level guard redirects them.
- Reuse BlockEditor from Plan 03. Do NOT modify it. If you need tenant-specific behavior (the Customize flow), wrap BlockEditor in a parent component that controls its readOnly prop and surrounding chrome.
- Optimistic updates use the established pattern (useTransition or useOptimistic from React 19) used elsewhere in Drive Command.

**Verify:**
- npm run build passes
- Full flow works for OWNER: see triggers, toggle, edit template, customize, restore default, manage subscribers, view send log
- MANAGER has the same access as OWNER
- DRIVER is blocked from /settings/notifications and redirected
- DRIVER can access /settings/my-notifications and toggle their own preferences
- Toggling a setting persists and is reflected on reload
- Customizing a template creates a TenantNotificationSettings row with hasOverride=true
- Restore Default clears the override and shows read-only mode again
- Adding/removing a subscriber works end-to-end
- Sidebar has both new links with correct role visibility

Before writing code, briefly explain your approach in 2-3 sentences - particularly how you handle the read-only-then-customize flow without remounting BlockEditor unnecessarily - then implement.
```

---

## Prompt 5 of 5 - Migration and Cron Wiring

```
## Task: Phase 41 Plan 05 - Migrate Existing Senders and Wire Scheduled Notifications

Use the GSD skill to build this feature.

**Context:**
This is Plan 05 - the final plan of the Tenant-Configurable Notification System. Plans 01-04 built the data layer, dispatcher, and UIs. This plan migrates Drive Command's existing scattered send* functions to internally route through dispatchNotification (without changing call sites), wires three new scheduled digests via Vercel cron, and adds a SysAdmin monitoring tile.

**Scope:**
- Modify: each existing send* sender file in src/lib/email/ (except send-support-notifications.ts) - keep the public signature identical, internally call dispatchNotification, fall back to legacy implementation on dispatch error
- Modify: the existing daily reminders cron route to use the dispatcher
- Modify: vercel.json to add three new cron entries
- Create: three new cron routes (daily driver digest, weekly owner digest, 30-day compliance digest), one digest payload builder per route, a SysAdmin health dashboard tile, a developer-facing notifications.md doc
- Do NOT touch: the dispatcher library, BlockEditor, any /settings/notifications page, prisma/schema.prisma, send-support-notifications.ts

**Outcome:**
Existing send* functions still work. Their signatures are unchanged. Their callers do not change. Internally each one routes through dispatchNotification, so tenants who customize templates see their customizations applied to existing notifications immediately. Three new digest cron routes run on schedule and use the dispatcher. The SysAdmin notifications page shows a health tile.

**What to build:**
1. For each existing sender file in src/lib/email/ except send-support-notifications.ts: keep the exported function and its signature exactly the same, but replace the body to map the original arguments into a dispatcher payload and call dispatchNotification(triggerKey, ...). Wrap that call in try/catch - on dispatch failure, run the original (legacy) code path so the email still goes out via the old code. Add a header comment marking the file as a wrapper.
2. Update the existing daily reminders cron route - keep its CRON_SECRET auth check, replace the per-tenant loop body to call dispatchNotification for maintenance and document expiry, return the same JSON summary shape for backward compatibility.
3. Three digest payload builders (daily_driver, weekly_owner, compliance_30day). Each returns null when there's nothing to report - the dispatcher does not send empty digests.
4. Three new cron routes corresponding to the three digests. Each: enforces Bearer CRON_SECRET, lists all tenants via bypass_rls, lists eligible recipients per tenant, calls the payload builder, calls dispatchNotification when payload is non-null, returns a JSON summary.
5. vercel.json updates to register the three new cron schedules:
   - daily_driver: 5 PM EST (10 PM UTC), every day
   - weekly_owner: Friday 5 PM EST
   - compliance_30day: Monday 9 AM EST
   Document the EST equivalents in comments.
6. A SysAdmin health dashboard tile (a Card embedded at the top of the Send Log tab in /admin/notifications) showing last-24h sent / failed / failure rate, plus the top failing trigger if failure rate exceeds 5%.
7. A developer reference doc covering: architecture overview (one paragraph linking to this design doc), how to add a new trigger (numbered checklist), how to test a notification locally, troubleshooting (common errors with fixes).

**Best-practices and constraints:**
- Do NOT change any existing call site of the send* functions. The wrapping is invisible to callers.
- Do NOT delete the original sender bodies. Keep them as the fallback path inside the try/catch. After two weeks of production stability, a follow-up cleanup pass will remove them.
- Do NOT migrate send-support-notifications.ts. Support notifications go to the DriveCommand support inbox and are not tenant-configurable. Document this exclusion in a comment in the file and in the developer reference doc.
- Cron routes must verify Bearer CRON_SECRET. Copy the exact auth pattern from the existing send-reminders cron route. Do NOT invent a new cron auth pattern.
- Use Vercel cron (already in the project). Do NOT add pg_cron, a queue service, or any other scheduler.
- vercel.json schedules are in cron syntax (UTC). Document EST equivalents in comments above each entry for clarity.
- Each digest payload builder returns null when the recipient has nothing to report - do not send empty emails.
- The health tile reuses the getSendLogStats action from Plan 03. Do NOT add a new stats endpoint.

**Verify:**
- npm run build passes
- All existing send* call sites still type-check unchanged (verified via git diff on call sites)
- Cron routes call dispatchNotification (grep for dispatchNotification in cron route files)
- vercel.json has 4 cron entries (1 existing + 3 new)
- The developer reference doc exists with all documented sections and links to the dispatcher README
- Hitting any new cron route in local dev with a valid CRON_SECRET returns 200 with a JSON summary
- Customizing the maintenance reminder template at the tenant level changes what the cron actually sends to that tenant (verifiable via NotificationSendLog and an actual send to a test inbox)

Before writing code, briefly explain your approach in 2-3 sentences - particularly how you keep the legacy sender signatures stable while routing through the dispatcher AND keeping a fallback path - then implement.

If a digest trigger is missing from the seeded templates from Plan 41-01, STOP and report - the seed data must include digest templates before cron routes can dispatch them.
```

---

## Phase Verification Checklist

When all 5 plans are complete, verify the entire feature against these criteria:

1. SysAdmin can navigate /admin/notifications and edit any of the ~35 templates
2. Creating a new tenant signup automatically populates ~35 TenantNotificationSettings rows (verify by inspecting the table after a test signup)
3. OWNER can navigate /settings/notifications, toggle individual notifications, customize a template, and restore default
4. MANAGER has the same access as OWNER (RBAC verified)
5. DRIVER is blocked from /settings/notifications but can access /settings/my-notifications
6. Every authenticated user can access /settings/my-notifications and toggle email/in-app per trigger
7. Triggering an existing notification (e.g. inviting a driver) routes through the new dispatcher and produces a NotificationSendLog row
8. Customizing a template at the tenant level is reflected on the next send
9. Disabling a notification at tenant level prevents it from being sent (verified in NotificationSendLog with SKIPPED_DISABLED)
10. Disabling email at the user level while keeping in-app on results in email skipped (SKIPPED_USER_PREF), in-app fired
11. Send Log shows all sends with correct status, filterable by trigger / status / date / tenant
12. Idempotency works: re-running a cron does not produce duplicate sends
13. Three digest cron routes are registered and runnable via curl with CRON_SECRET
14. SysAdmin health dashboard tile shows last-24h stats
15. Developer reference doc and dispatcher README exist and link to each other
16. No existing send* call site needed to change (verified by git diff on call sites in src/app/)

---

## Success Criteria

- Drive Command tenants can configure notifications without contacting support
- Non-technical users can edit beautiful email templates without seeing HTML
- Every notification send is auditable from the UI
- New notification types can be added with a code change + seed entry - no UI change required
- Per-user channel preferences are respected
- Migration was zero-downtime: existing senders kept working throughout
- The system is ready for Phase 2 channel additions (SMS, mobile push) by adding a new value to NotificationChannel and a new branch in the dispatcher

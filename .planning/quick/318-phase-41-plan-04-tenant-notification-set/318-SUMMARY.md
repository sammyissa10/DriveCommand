---
phase: quick-318
plan: "04"
subsystem: notifications
tags: [notifications, tenant-settings, ui, server-actions, preferences]
dependency_graph:
  requires: [quick-315, quick-316, quick-317]
  provides: [tenant-notification-settings-ui, per-user-preferences-ui]
  affects: [sidebar, block-editor]
tech_stack:
  added: [accordion (shadcn), checkbox (shadcn)]
  patterns: [useOptimistic, bypass_rls pattern, server-actions, route-groups]
key_files:
  created:
    - apps/web/src/app/(owner)/actions/tenant-notification-settings.ts
    - apps/web/src/app/(owner)/actions/my-notifications.ts
    - apps/web/src/app/(owner)/settings/notifications/page.tsx
    - apps/web/src/app/(owner)/settings/notifications/tenant-notifications-tabs.tsx
    - apps/web/src/app/(owner)/settings/notifications/notifications-tab.tsx
    - apps/web/src/app/(owner)/settings/notifications/tenant-template-editor-panel.tsx
    - apps/web/src/app/(owner)/settings/notifications/subscribers-tab.tsx
    - apps/web/src/app/(owner)/settings/notifications/tenant-send-log-tab.tsx
    - apps/web/src/app/(shared)/layout.tsx
    - apps/web/src/app/(shared)/settings/my-notifications/page.tsx
    - apps/web/src/app/(shared)/settings/my-notifications/preferences-form.tsx
    - apps/web/src/components/ui/accordion.tsx
    - apps/web/src/components/ui/checkbox.tsx
  modified:
    - apps/web/src/components/navigation/sidebar.tsx
    - apps/web/src/components/notifications/block-editor.tsx
decisions:
  - "Used new file tenant-notification-settings.ts instead of adding to existing notifications.ts (which serves dashboard/CRM notification purposes unrelated to Phase 41)"
  - "Added accordion and checkbox via shadcn (were not previously installed)"
  - "Added useEffect to BlockEditor to sync readOnly prop dynamically (initial useEditor editable flag only sets initial state, not reactive)"
  - "TenantTemplateEditorPanel delegates save/cancel to BlockEditor's built-in footer when editing, so we reuse BlockEditor's onSave callback rather than replacing its footer"
  - "Sidebar Account group shows My Notifications only for isOwnerOrManager (drivers use mobile for preferences, not web sidebar)"
metrics:
  duration: ~35 minutes
  completed: "2026-05-14"
  tasks: 4
  files: 15
---

# Phase Quick-318: Tenant Notification Settings UI - Summary

Tenant-configurable notification settings page + per-user preferences screen for Phase 41. Two new pages: `/settings/notifications` (OWNER/MANAGER) and `/settings/my-notifications` (all roles), 13 server actions across two files, and sidebar nav entries.

## What Was Built

### Server Actions (`tenant-notification-settings.ts`)

12 exported functions scoped to OWNER/MANAGER via `requireTenantAccess()`:

- `listTenantNotificationSettings` — merges global templates with tenant overrides, computes `hasOverride` and effective `isActive`
- `getSettingForTrigger` — single-trigger lookup for detail view
- `customizeTemplate` — upsert TenantNotificationSettings with custom subject/blockJson/htmlCache
- `restoreDefault` — clears custom fields via updateMany (uses `Prisma.JsonNull` for Json field null assignment)
- `toggleTenantNotificationActive` — upsert with new isActive, guards globally-disabled templates
- `listTenantSubscribers` — with user include
- `listTenantUsers` — active tenant users for add-subscriber combobox
- `listActiveTemplatesForTenant` — globally-active templates excluding tenant-disabled ones
- `addSubscriber` — duplicate check via unique constraint + optimistic add
- `removeSubscriber` — UUID-validated delete
- `listTenantSendLog` — bypass_rls pattern, tenantId WHERE filter, paginated
- `getTenantSendLogStats` — bypass_rls pattern, 30-day window counts by status

### Server Actions (`my-notifications.ts`)

2 exported functions using `requireAuth()` (any authenticated user):

- `getMyPreferences` — joins templates + user prefs, filters tenant-disabled triggers
- `updateMyPreference` — upsert UserNotificationPreference on `{userId_triggerKey}` unique constraint

### UI Pages

**`/settings/notifications`** — Three-tab layout:
- Notifications tab: category accordions (accordion shadcn added), each row has displayName + info tooltip, Default/Customized badge, Edit Template sheet trigger, active Switch (globally-disabled shows locked with tooltip)
- Subscribers tab: grouped subscriber cards with user+trigger combobox add dialog, duplicate validation
- Send Log tab: 5 KPI cards (Total/Sent/Failed/Skipped/Pending over 30d), filters (trigger/status/channel), paginated table, expandable FAILED rows with error details, no tenant column

**`/settings/my-notifications`** — useOptimistic email/in-app toggles per trigger, grouped by category in accordion. Empty state for tenants with no active notifications.

**`(shared)/layout.tsx`** — Minimal auth-only route group layout (no requireRole), enables drivers to access `/settings/my-notifications` if they navigate there directly.

### Sidebar Changes

- Added `Bell` icon import to lucide-react block
- Added "Notifications" link in Settings group (OWNER/MANAGER) before Expense Categories
- Added new "Account" SidebarGroup after Settings group with "My Notifications" link

### BlockEditor Extension

Added `useEffect` to sync `readOnly` prop changes to `editor.setEditable(!readOnly)`. The `useEditor` `editable` option only sets initial state; without this effect, switching from readonly→editing mode in TenantTemplateEditorPanel would leave the editor non-editable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Missing dependency] Added accordion and checkbox shadcn components**
- **Found during:** Task 2 + Task 4
- **Issue:** `accordion` and `checkbox` shadcn components were not installed; plan assumed they existed
- **Fix:** `npx shadcn@latest add accordion checkbox` from apps/web
- **Files modified:** `apps/web/src/components/ui/accordion.tsx`, `apps/web/src/components/ui/checkbox.tsx`
- **Commit:** 075a3b7

**2. [Rule 1 - Bug] Added Prisma.JsonNull for nullable Json field**
- **Found during:** Task 1 TypeScript check
- **Issue:** Setting `customBlockJson: null` for a Prisma nullable Json field fails TypeScript — requires `Prisma.JsonNull`
- **Fix:** Import `Prisma` from `@/generated/prisma` and use `Prisma.JsonNull` in `restoreDefault`
- **Files modified:** `tenant-notification-settings.ts`
- **Commit:** bc8bfc4

**3. [Rule 2 - Design] Used new file `tenant-notification-settings.ts` instead of extending existing `notifications.ts`**
- **Found during:** Task 1 planning
- **Issue:** The existing `(owner)/actions/notifications.ts` file serves dashboard/CRM/customer notification purposes unrelated to Phase 41 Notification System models
- **Fix:** Created new `tenant-notification-settings.ts` to keep Phase 41 code separate and avoid naming collisions with unrelated notification functions
- **Impact:** Clean separation — plan's import paths updated accordingly

**4. [Rule 2 - Design] TenantTemplateEditorPanel delegates to BlockEditor's built-in footer**
- **Found during:** Task 2 implementation
- **Issue:** Plan described `value/onChange` props for BlockEditor that don't exist; BlockEditor uses `template.defaultBlockJson/defaultSubject` for initialization and has its own Save/Cancel footer
- **Fix:** When mode='editing', BlockEditor shows its own Save/Cancel and calls `onSave(blockJson, subject)`. We pass our `customizeTemplate` action as the `onSave` handler. This reuses the full editor UX (VariablePicker, live preview) without duplicating it.

## Verification Results

- `npx tsc --noEmit -p apps/web/tsconfig.json` — passes with zero errors
- All 15 files exist (13 created + 2 modified)
- `toggleTenantNotificationActive` referenced in notifications-tab.tsx ✓
- `TenantTemplateEditorPanel` referenced in notifications-tab.tsx ✓
- `setMode('readonly')` and `restoreDefault(` in tenant-template-editor-panel.tsx ✓
- `addSubscriber(` and `removeSubscriber(` in subscribers-tab.tsx ✓
- `listTenantSendLog(` in tenant-send-log-tab.tsx ✓
- No "Tenant ID" column header in send-log-tab ✓
- `/settings/notifications` appears exactly once in sidebar ✓
- `/settings/my-notifications` appears exactly once in sidebar ✓
- `useOptimistic` in preferences-form.tsx ✓
- `requireRole([UserRole.OWNER, UserRole.MANAGER])` in tenant actions ✓
- `requireAuth()` in my-notifications.ts ✓
- bypass_rls pattern in listTenantSendLog and getTenantSendLogStats ✓

## Self-Check: PASSED

All files exist and commits verified: bc8bfc4 (server actions), 075a3b7 (UI + sidebar + block-editor).

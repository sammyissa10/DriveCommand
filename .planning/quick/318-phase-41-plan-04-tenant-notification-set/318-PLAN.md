---
phase: 318-phase-41-plan-04-tenant-notification-set
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/actions/notifications.ts
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
  - apps/web/src/components/navigation/sidebar.tsx
autonomous: true

must_haves:
  truths:
    - "Owner/Manager can open /settings/notifications and see all notification templates grouped by category with Default/Customized badges"
    - "Owner/Manager can customize a template (subject + blockJson) and see hasOverride=true reflected in a Customized badge"
    - "Owner/Manager can restore a customized template to default via confirmation dialog, and the row reverts to readonly mode"
    - "Owner/Manager can toggle a tenant template active/inactive, with globally-disabled templates locked with a tooltip"
    - "Owner/Manager can add/remove subscribers per trigger via a modal with user + trigger comboboxes"
    - "Owner/Manager can view tenant-scoped send log with KPI stats (no other-tenant data leaks via RLS bypass)"
    - "Any authenticated user (including drivers) can open /settings/my-notifications and toggle Email/In-App per trigger"
    - "Per-user preference changes persist via upsert and reflect optimistically without page reload"
    - "Sidebar shows 'Notifications' link in Settings group (Owner/Manager) and 'My Notifications' link"
  artifacts:
    - path: "apps/web/src/app/(owner)/actions/notifications.ts"
      provides: "Tenant-scoped notification settings server actions (list/get/customize/restore/toggle/subscribers/send-log)"
      exports: ["listTenantNotificationSettings", "getSettingForTrigger", "customizeTemplate", "restoreDefault", "toggleTenantNotificationActive", "listTenantSubscribers", "addSubscriber", "removeSubscriber", "listTenantSendLog", "getTenantSendLogStats"]
    - path: "apps/web/src/app/(owner)/actions/my-notifications.ts"
      provides: "Per-user notification preference actions"
      exports: ["getMyPreferences", "updateMyPreference"]
    - path: "apps/web/src/app/(owner)/settings/notifications/page.tsx"
      provides: "Tenant notifications settings page (server component with parallel data fetch)"
    - path: "apps/web/src/app/(owner)/settings/notifications/tenant-notifications-tabs.tsx"
      provides: "Three-tab container (Notifications/Subscribers/Send Log)"
    - path: "apps/web/src/app/(owner)/settings/notifications/notifications-tab.tsx"
      provides: "Templates list with category accordions, active toggle, customize sheet trigger"
    - path: "apps/web/src/app/(owner)/settings/notifications/tenant-template-editor-panel.tsx"
      provides: "Readonly-then-customize template editor (BlockEditor wrapper)"
    - path: "apps/web/src/app/(owner)/settings/notifications/subscribers-tab.tsx"
      provides: "Subscriber management grouped by trigger with add/remove modal"
    - path: "apps/web/src/app/(owner)/settings/notifications/tenant-send-log-tab.tsx"
      provides: "Tenant-scoped send log table with KPI cards and filters"
    - path: "apps/web/src/app/(shared)/layout.tsx"
      provides: "Minimal auth-only layout for shared routes accessible to all roles"
    - path: "apps/web/src/app/(shared)/settings/my-notifications/page.tsx"
      provides: "Per-user notification preferences page (all roles incl. drivers)"
    - path: "apps/web/src/app/(shared)/settings/my-notifications/preferences-form.tsx"
      provides: "Optimistic-update form with Email/In-App toggles per trigger"
  key_links:
    - from: "apps/web/src/app/(owner)/settings/notifications/page.tsx"
      to: "apps/web/src/app/(owner)/actions/notifications.ts"
      via: "parallel server-action calls (listTenantNotificationSettings, listTenantSubscribers, listTenantSendLog, getTenantSendLogStats)"
      pattern: "await Promise\\.all\\("
    - from: "apps/web/src/app/(owner)/settings/notifications/notifications-tab.tsx"
      to: "apps/web/src/app/(owner)/settings/notifications/tenant-template-editor-panel.tsx"
      via: "Sheet component opens TenantTemplateEditorPanel with template + tenantSetting props"
      pattern: "TenantTemplateEditorPanel"
    - from: "apps/web/src/app/(owner)/settings/notifications/tenant-template-editor-panel.tsx"
      to: "apps/web/src/components/notifications/block-editor.tsx"
      via: "BlockEditor mounted once with readOnly={mode==='readonly'} prop, customize/restore wraps it"
      pattern: "<BlockEditor"
    - from: "apps/web/src/app/(owner)/actions/notifications.ts"
      to: "apps/web/src/lib/context/tenant-context.ts"
      via: "getTenantPrisma() for tenant-scoped reads/writes"
      pattern: "getTenantPrisma\\(\\)"
    - from: "apps/web/src/app/(owner)/actions/notifications.ts (listTenantSendLog)"
      to: "prisma.notificationSendLog"
      via: "bypass_rls $transaction with tenantId filter"
      pattern: "set_config\\('app\\.bypass_rls'"
    - from: "apps/web/src/app/(shared)/settings/my-notifications/preferences-form.tsx"
      to: "apps/web/src/app/(owner)/actions/my-notifications.ts"
      via: "updateMyPreference server action call with useOptimistic"
      pattern: "updateMyPreference\\("
    - from: "apps/web/src/components/navigation/sidebar.tsx"
      to: "/settings/notifications and /settings/my-notifications"
      via: "Link href to new routes"
      pattern: "href=\"/settings/(notifications|my-notifications)\""
---

<objective>
Build the tenant-facing Notification Settings UI and per-user preferences screen for Phase 41 (Tenant-Configurable Notification System).

Purpose: Let tenant owners/managers customize notification templates, manage subscribers, and view send logs scoped to their tenant — and let every user control their own email/in-app delivery preferences.

Output: Two new pages (`/settings/notifications` for OWNER/MANAGER, `/settings/my-notifications` for all roles), tenant-scoped server actions, sidebar nav entries, and a readonly→customize→restore template editor flow that reuses the existing BlockEditor component.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md

# Phase 41 prior plans (already shipped)
@apps/web/src/app/(admin)/actions/notifications.ts
@apps/web/src/app/(admin)/notifications/page.tsx
@apps/web/src/app/(admin)/notifications/templates-tab.tsx
@apps/web/src/app/(admin)/notifications/send-log-tab.tsx
@apps/web/src/components/notifications/block-editor.tsx

# Auth + tenant infrastructure
@apps/web/src/lib/auth/supabase.ts
@apps/web/src/lib/auth/roles.ts
@apps/web/src/lib/context/tenant-context.ts
@apps/web/src/lib/db/prisma.ts

# Schema reference
@apps/web/prisma/schema.prisma

# Sidebar to modify
@apps/web/src/components/navigation/sidebar.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Tenant + per-user server actions (notifications.ts + my-notifications.ts)</name>
  <files>
    apps/web/src/app/(owner)/actions/notifications.ts
    apps/web/src/app/(owner)/actions/my-notifications.ts
  </files>
  <action>
Create two server-action files in apps/web/src/app/(owner)/actions/.

FILE 1: apps/web/src/app/(owner)/actions/notifications.ts
- Add `'use server';` at top.
- Imports: `revalidatePath` from 'next/cache', `z` from 'zod', `requireRole`, `getSession` from '@/lib/auth/supabase', `UserRole` from '@/lib/auth/roles', `prisma` from '@/lib/db/prisma', `getTenantPrisma` from '@/lib/context/tenant-context', `renderTemplate` from '@/lib/notifications/template-renderer', `VariableDef` type from '@/lib/notifications/types', Prisma enums from '@/generated/prisma'.
- Private helper: `async function requireTenantAccess(): Promise<{tenantId: string}>` — calls `await requireRole([UserRole.OWNER, UserRole.MANAGER])`, then `const session = await getSession()`, throws if !session?.tenantId, returns `{tenantId: session.tenantId}`.

- `listTenantNotificationSettings()` — requireTenantAccess. Use base `prisma` (templates are global). Fetch all NotificationTemplates ordered by category, displayName. Then via `getTenantPrisma()` fetch all TenantNotificationSettings for this tenant. Merge: for each template, attach `tenantSetting` (or null). Compute `hasOverride: boolean` = (tenantSetting?.customBlockJson != null || tenantSetting?.customSubject != null). Return array of `{template, tenantSetting, hasOverride, isActive: tenantSetting?.isActive ?? template.isActive}`. Cast `availableVariables as VariableDef[]`.

- `getSettingForTrigger(triggerKey: string)` — requireTenantAccess. Validate with `z.string().min(1).parse(triggerKey)`. Fetch template by triggerKey via base prisma, fetch tenantSetting via getTenantPrisma findUnique on `{tenantId_triggerKey}`. Return combined object same shape as one item from listTenantNotificationSettings.

- `customizeTemplate(triggerKey: string, blockJson: unknown, subject: string)` — requireTenantAccess. Validate inputs with zod (triggerKey nonempty, subject nonempty). Re-render html with `renderTemplate(blockJson, samplePayloadFromTemplate, subject)` using template's `availableVariables` for sample values. Use `getTenantPrisma()` to upsert TenantNotificationSettings on `{tenantId_triggerKey}` — on create set `tenantId`, `triggerKey`, `isActive: true`, `customSubject: subject`, `customBlockJson: blockJson as any`, `customHtmlCache: html`; on update set the three custom fields. Return `{success: true}` / `{success: false, error}`. `revalidatePath('/settings/notifications')`.

- `restoreDefault(triggerKey: string)` — requireTenantAccess. Use `getTenantPrisma()` to update TenantNotificationSettings: set `customSubject: null, customBlockJson: null, customHtmlCache: null` (using updateMany on `{tenantId, triggerKey}` since unique requires both). Return success. revalidatePath.

- `toggleTenantNotificationActive(triggerKey: string, isActive: boolean)` — requireTenantAccess. Verify the template's global `isActive` first (base prisma) — if global isActive=false, throw "Cannot enable: template is globally disabled". Use `getTenantPrisma()` to upsert TenantNotificationSettings with new isActive value. revalidatePath. Return success.

- `listTenantSubscribers()` — requireTenantAccess. Use `getTenantPrisma()` findMany on NotificationSubscription where `tenantId`, include user `{id, email, firstName, lastName, role}`. Group/return as flat list with all fields needed by UI. Order by triggerKey, then user email.

- `addSubscriber(triggerKey: string, userId: string)` — requireTenantAccess. Zod-validate inputs (uuid for userId). Use getTenantPrisma — check existing via findUnique on `{tenantId_triggerKey_userId}`; if exists return `{success: false, error: 'Already subscribed'}`. Otherwise create the row. Revalidate. Return success with new row id.

- `removeSubscriber(id: string)` — requireTenantAccess. Zod uuid. Use getTenantPrisma delete on id. Revalidate. Return success.

- `listTenantSendLog(params: { page?: number; pageSize?: number; status?: NotificationSendStatus; triggerKey?: string; channel?: NotificationChannel })` — requireTenantAccess. Use base `prisma.$transaction` with bypass_rls pattern:
  ```
  const [, total, rows] = await prisma.$transaction([
    prisma.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`,
    prisma.notificationSendLog.count({ where: { tenantId, ...filters } }),
    prisma.notificationSendLog.findMany({ where: { tenantId, ...filters }, orderBy: { createdAt: 'desc' }, skip, take }),
  ]);
  ```
  Return `{ rows, total, page, pageSize, totalPages }`. Export `SendLogRow` type.

- `getTenantSendLogStats()` — requireTenantAccess. Same bypass_rls pattern. Compute groupBy status counts for this tenantId over last 30 days. Return `SendLogStats` shape matching admin variant: `{ total, sent, failed, skipped, pending }`. Export `SendLogStats` type.

FILE 2: apps/web/src/app/(owner)/actions/my-notifications.ts
- `'use server';` at top.
- Imports: requireAuth and getSession from '@/lib/auth/supabase', prisma from '@/lib/db/prisma', getTenantPrisma from tenant-context, revalidatePath, z, NotificationCategory and VariableDef as needed.

- `getMyPreferences()` — `await requireAuth()`, then `const session = await getSession()`, throw if no session. Use base prisma to fetch all active NotificationTemplates (where isActive=true) ordered by category then displayName. Use base prisma to fetch all UserNotificationPreference rows where `userId: session.userId`. Merge: for each template, attach preference (or null = defaults emailEnabled=true, inAppEnabled=true). Return array of `{template: {triggerKey, displayName, description, category}, emailEnabled, inAppEnabled}`. NOTE: also respect tenant-level isActive — join via getTenantPrisma to TenantNotificationSettings for session.tenantId and exclude triggers where tenantSetting.isActive=false. (Filter out tenant-disabled triggers so users don't toggle prefs for triggers they can't receive.)

- `updateMyPreference(triggerKey: string, field: 'emailEnabled' | 'inAppEnabled', value: boolean)` — requireAuth + getSession. Validate `field` is one of the two literal strings via z.enum. Use base prisma (preferences are scoped by userId not tenantId — RLS-safe) upsert UserNotificationPreference on `{userId_triggerKey}` setting just the specified field. Where create needs both fields, set the unspecified one to default true. Revalidate `/settings/my-notifications`. Return `{success: true}`.

Verify code compiles with no `any` casts beyond the documented `customBlockJson as any` (matches admin notifications.ts pattern). Use the same `SendLogRow`/`SendLogStats` type export pattern as the admin file so the tenant send log component can mirror its admin counterpart.
  </action>
  <verify>
Run `npx tsc --noEmit -p apps/web` from project root — must pass with zero TS errors. Grep both files for `requireRole([UserRole.OWNER` (notifications.ts) and `requireAuth()` (my-notifications.ts) to confirm role gates exist.
  </verify>
  <done>
Both files exist, export all listed functions, role-guard correctly (OWNER/MANAGER for tenant actions, any auth for my-notifications), use getTenantPrisma() for tenant-scoped writes/reads and base prisma with bypass_rls for send log, and `tsc --noEmit` passes.
  </done>
</task>

<task type="auto">
  <name>Task 2: Tenant notifications page + tabs + notifications-tab + tenant-template-editor-panel</name>
  <files>
    apps/web/src/app/(owner)/settings/notifications/page.tsx
    apps/web/src/app/(owner)/settings/notifications/tenant-notifications-tabs.tsx
    apps/web/src/app/(owner)/settings/notifications/notifications-tab.tsx
    apps/web/src/app/(owner)/settings/notifications/tenant-template-editor-panel.tsx
  </files>
  <action>
FILE 1: page.tsx (server component)
- Add `export const dynamic = 'force-dynamic';` at top.
- Imports: redirect from 'next/navigation', requireRole from '@/lib/auth/supabase', UserRole from '@/lib/auth/roles', all four server actions from '../../actions/notifications'.
- Try/catch around `await requireRole([UserRole.OWNER, UserRole.MANAGER])`. On unauthorized, `redirect('/unauthorized')`.
- Parallel fetch with `Promise.all([listTenantNotificationSettings(), listTenantSubscribers(), listTenantSendLog({page:1, pageSize:25}), getTenantSendLogStats()])`.
- Layout: `<div className="container mx-auto py-8 space-y-6">` with `<h1>Notifications</h1>` + subtitle `<p>Customize notification templates, manage subscribers, and view delivery logs for your team.</p>`.
- Render `<TenantNotificationsTabs initialSettings={...} initialSubscribers={...} initialSendLog={...} initialStats={...} />`.

FILE 2: tenant-notifications-tabs.tsx (client)
- `'use client';` at top.
- Imports: shadcn Tabs/TabsList/TabsTrigger/TabsContent from '@/components/ui/tabs', NotificationsTab/SubscribersTab/TenantSendLogTab from sibling files, type imports for props.
- Props: `initialSettings, initialSubscribers, initialSendLog, initialStats`.
- Render Tabs with three triggers: "Notifications", "Subscribers", "Send Log". Each TabsContent renders the matching child component with its initial data prop.

FILE 3: notifications-tab.tsx (client)
- `'use client';`
- Imports: useState, useTransition from 'react'; shadcn Accordion/AccordionItem/AccordionTrigger/AccordionContent, Sheet/SheetContent/SheetHeader/SheetTitle, Switch, Badge, Tooltip/TooltipProvider/TooltipTrigger/TooltipContent, Button; Info icon from lucide-react; toggleTenantNotificationActive action; TenantTemplateEditorPanel sibling; sonner toast.
- Type for row: `{template: NotificationTemplate; tenantSetting: TenantNotificationSettings | null; hasOverride: boolean; isActive: boolean}[]`.
- State: `rows` (initialized from `initialSettings` prop), `editingTrigger: string | null`, `isPending` from useTransition.
- Group rows by `template.category` (object map keyed by NotificationCategory). Order categories by enum order from schema (USER, LOAD, DRIVER, TRUCK, MESSAGE, FINANCE, ROUTE, CUSTOMER, DIGEST).
- Render Accordion (type="multiple") with one AccordionItem per category. Within each, list rows. Each row layout (flex container):
  - Left: `<span>{template.displayName}</span>` + Tooltip with Info icon (uses `template.description` in TooltipContent).
  - Middle: Badge variant="secondary" reading "Customized" if hasOverride else "Default".
  - Right: "Edit Template" Button (variant="outline" size="sm") that sets `editingTrigger = template.triggerKey`. Then a Switch (checked={isActive}) with onCheckedChange.
- The active Switch: if `template.isActive === false` (globally disabled), wrap in a Tooltip explaining "This notification is currently disabled by DriveCommand globally" and disable the Switch. Otherwise, onCheckedChange calls `startTransition(async () => {...})`: optimistically setRows to flip isActive, then `const result = await toggleTenantNotificationActive(template.triggerKey, newValue)`. If `!result.success`, revert optimistic update and toast.error(result.error). Else toast.success('Updated').
- Render Sheet (controlled by `editingTrigger != null`): on close → setEditingTrigger(null). Inside SheetContent (side="right", className="w-full sm:max-w-2xl"), if editingTrigger is set, find the matching row and render `<TenantTemplateEditorPanel template={row.template} tenantSetting={row.tenantSetting} onClose={() => setEditingTrigger(null)} onUpdated={(updated) => { setRows(prev => prev.map(r => r.template.triggerKey === editingTrigger ? {...r, tenantSetting: updated, hasOverride: updated?.customBlockJson != null} : r)); }} />`.

FILE 4: tenant-template-editor-panel.tsx (client)
- `'use client';`
- Imports: useState, useTransition; BlockEditor from '@/components/notifications/block-editor'; Button; Input; AlertDialog/AlertDialogContent/AlertDialogHeader/AlertDialogTitle/AlertDialogDescription/AlertDialogFooter/AlertDialogCancel/AlertDialogAction; customizeTemplate, restoreDefault server actions; sonner toast.
- Props: `{template: NotificationTemplate (with availableVariables cast as VariableDef[]); tenantSetting: TenantNotificationSettings | null; onClose: () => void; onUpdated: (updated: TenantNotificationSettings | null) => void;}`.
- State:
  - `mode: 'readonly' | 'editing'` — initial = tenantSetting?.customBlockJson != null ? 'editing' : 'readonly'.
  - `subject: string` — initial = tenantSetting?.customSubject ?? template.defaultSubject.
  - `blockJson: unknown` — initial = tenantSetting?.customBlockJson ?? template.defaultBlockJson.
  - `showRestoreConfirm: boolean` (default false).
  - `isPending` (useTransition).
- Layout:
  - Header (always): h2 displayName + Info row showing category badge.
  - When mode === 'readonly': yellow banner div `<div className="bg-yellow-50 border border-yellow-200 rounded p-3">` with text "Currently using DriveCommand default — click Customize to make changes." + Button variant="default" onClick={() => setMode('editing')} label "Customize Template".
  - When mode === 'editing': red-tinted Button variant="destructive" size="sm" onClick={() => setShowRestoreConfirm(true)} label "Restore to Default". Disabled if `tenantSetting?.customBlockJson == null` (nothing to restore).
  - Subject Input: `<Input value={subject} onChange={...} disabled={mode==='readonly'} />`.
  - BlockEditor: `<BlockEditor value={blockJson} onChange={setBlockJson} availableVariables={template.availableVariables} readOnly={mode==='readonly'} />`. Keep this instance mounted at all times — do not unmount between mode switches.
  - Footer (always, only Save when editing): Cancel button → onClose(); Save button only visible/enabled when mode==='editing' → calls `startTransition(async () => { const result = await customizeTemplate(template.triggerKey, blockJson, subject); if (result.success) { toast.success('Template saved'); onUpdated({...tenantSetting!, customSubject: subject, customBlockJson: blockJson as any}); onClose(); } else { toast.error(result.error); } })`.
- AlertDialog (controlled by showRestoreConfirm): "Restore to default?" — description "This will discard your customizations and revert to the DriveCommand default template. This cannot be undone." Cancel + Confirm (variant="destructive") → `startTransition(async () => { const result = await restoreDefault(template.triggerKey); if (result.success) { toast.success('Restored to default'); setBlockJson(template.defaultBlockJson); setSubject(template.defaultSubject); setMode('readonly'); onUpdated({...tenantSetting!, customSubject: null, customBlockJson: null}); setShowRestoreConfirm(false); } })`.

Read apps/web/src/app/(admin)/notifications/templates-tab.tsx and apps/web/src/components/notifications/block-editor.tsx FIRST to mirror prop conventions (availableVariables shape, onChange signature). Do NOT modify BlockEditor — only consume it. If BlockEditor lacks a `readOnly` prop, add it by passing through to its Tiptap `editor.setEditable()` in a useEffect inside BlockEditor (extend, don't break existing admin usage — keep readOnly defaulting to false).
  </action>
  <verify>
`npx tsc --noEmit -p apps/web` passes. Visually confirm by checking files exist: `ls apps/web/src/app/(owner)/settings/notifications/`. Grep notifications-tab.tsx for `toggleTenantNotificationActive` and `TenantTemplateEditorPanel` references. Grep tenant-template-editor-panel.tsx for `setMode('readonly')` and `restoreDefault(`.
  </verify>
  <done>
Page loads OWNER/MANAGER, redirects others to /unauthorized. Notifications tab shows all templates grouped by category with Default/Customized badges. Edit Template opens Sheet with readonly banner OR edit mode based on hasOverride. Customize flow saves + flips badge. Restore-to-default opens AlertDialog, on confirm reverts state. Active toggle updates tenant setting with optimistic UI + rollback. Globally-disabled templates show locked switch with tooltip.
  </done>
</task>

<task type="auto">
  <name>Task 3: Subscribers tab + tenant send log tab</name>
  <files>
    apps/web/src/app/(owner)/settings/notifications/subscribers-tab.tsx
    apps/web/src/app/(owner)/settings/notifications/tenant-send-log-tab.tsx
  </files>
  <action>
FILE 1: subscribers-tab.tsx (client)
- `'use client';`
- Imports: useState, useTransition; Card/CardHeader/CardTitle/CardContent; Button; Dialog/DialogContent/DialogHeader/DialogTitle/DialogFooter/DialogTrigger; Popover/PopoverTrigger/PopoverContent; Command/CommandInput/CommandList/CommandItem/CommandEmpty (shadcn Combobox pattern); Input; X icon and Plus icon from lucide-react; addSubscriber, removeSubscriber actions; sonner toast.
- Need user picker data — fetch users for tenant: extend `listTenantSubscribers` server action OR create a new helper `listTenantUsers()` (add it to apps/web/src/app/(owner)/actions/notifications.ts within Task 1's file — IF not present, add it now in this task's edit). For this task assume the page also passes a `users` and `templates` list as props. Update page.tsx and tenant-notifications-tabs.tsx (created in Task 2) to fetch and pass these:
  - In page.tsx: extend Promise.all with `listTenantUsers()` (id, email, firstName, lastName) and `listActiveTemplatesForTenant()` (triggers active for this tenant). Pass to SubscribersTab via props through TenantNotificationsTabs.
  - Add `listTenantUsers()` to notifications.ts: requireTenantAccess, use getTenantPrisma to findMany Users where tenantId, select {id, email, firstName, lastName, role}, order by email.
  - Add `listActiveTemplatesForTenant()` to notifications.ts: requireTenantAccess, fetch templates where isActive=true AND not overridden to inactive by this tenant. Easiest: fetch all active templates + tenant settings, filter out tenant-disabled ones. Return `{triggerKey, displayName, category}`.
- Props for SubscribersTab: `{initialSubscribers, users, triggers}`.
- State: `subscribers` (initialized from initialSubscribers), `showAddDialog: boolean`, `selectedUserId`, `selectedTriggerKey`, `isPending`.
- Render: group subscribers by triggerKey (use a Map). For each group, render a Card titled with the trigger displayName (look up in `triggers` prop). CardContent lists subscribers — each row: avatar/email/name on left, "Remove" Button (variant="ghost" size="sm" with X icon) on right that calls `startTransition` → `removeSubscriber(sub.id)`, optimistic remove, toast.success.
- Top-right of the tab: `<Button onClick={() => setShowAddDialog(true)}><Plus /> Add Subscriber</Button>`.
- Dialog: title "Add Subscriber". Two Combobox-style Popover+Command inputs side by side or stacked:
  - User picker: command list of `users` with email search, onSelect sets `selectedUserId`.
  - Trigger picker: command list of `triggers` with displayName search, onSelect sets `selectedTriggerKey`.
- DialogFooter: Cancel + "Add" button. On Add: check duplicate locally first (`subscribers.some(s => s.triggerKey === selectedTriggerKey && s.userId === selectedUserId)`) — if dup, toast.error('Already subscribed') and return. Otherwise `startTransition` → `addSubscriber(selectedTriggerKey, selectedUserId)`. On success, optimistic add (with full user info) + toast.success + close dialog + reset selections.

FILE 2: tenant-send-log-tab.tsx (client)
- Mirror the structure of apps/web/src/app/(admin)/notifications/send-log-tab.tsx (READ it first to understand component shape, KPI cards layout, status badge map, expandable failed rows, filters, pagination).
- Differences:
  - Import `listTenantSendLog, getTenantSendLogStats, SendLogRow, SendLogStats` from '@/app/(owner)/actions/notifications' (not admin actions).
  - REMOVE the tenant filter column / tenant column from the table (tenant scoping is implicit).
  - Keep status filter, triggerKey filter, channel filter, search, pagination.
  - KPI cards row: Total, Sent, Failed, Skipped, Pending (same as admin).
  - Expandable row for FAILED status showing errorMessage.
- Props: `{initialSendLog: SendLogPaginatedResult; initialStats: SendLogStats}`.
- Call `listTenantSendLog(...)` on filter change in a useTransition / loading state.

Note: Task 1's notifications.ts file is amended in this task to add `listTenantUsers` and `listActiveTemplatesForTenant`. Use the same `requireTenantAccess` private helper. Update page.tsx parallel fetch and TenantNotificationsTabs prop signature accordingly (created in Task 2 — modify here to add users + triggers props).
  </action>
  <verify>
`npx tsc --noEmit -p apps/web` passes. Grep subscribers-tab.tsx for `addSubscriber(` and `removeSubscriber(`. Grep tenant-send-log-tab.tsx for `listTenantSendLog(` and confirm it does NOT contain `tenantId:` as a filter column header (it's implicit).
  </verify>
  <done>
Subscribers tab renders grouped subscribers, Add modal opens with user + trigger comboboxes, duplicate validation works, remove/add are reflected optimistically. Send log tab shows tenant-only entries with KPI cards, filters, pagination, expandable failed-row error messages, and no tenant column.
  </done>
</task>

<task type="auto">
  <name>Task 4: Shared layout + my-notifications page + preferences form + sidebar nav</name>
  <files>
    apps/web/src/app/(shared)/layout.tsx
    apps/web/src/app/(shared)/settings/my-notifications/page.tsx
    apps/web/src/app/(shared)/settings/my-notifications/preferences-form.tsx
    apps/web/src/components/navigation/sidebar.tsx
  </files>
  <action>
FILE 1: apps/web/src/app/(shared)/layout.tsx (server component)
- Imports: redirect from 'next/navigation', getSession from '@/lib/auth/supabase'.
- Default export async function Layout({children}): const session = await getSession(); if (!session) redirect('/sign-in'); return `<>{children}</>;` (no chrome, no sidebar — inherits root layout chrome above the route group).
- Note: route groups don't change URL path, so /settings/my-notifications resolves under (shared) without affecting URL. This intentionally avoids requireRole so drivers can access it too.

FILE 2: apps/web/src/app/(shared)/settings/my-notifications/page.tsx (server component)
- `export const dynamic = 'force-dynamic';`
- Imports: getMyPreferences from '@/app/(owner)/actions/my-notifications'; PreferencesForm sibling.
- Layout: container, page header `<h1>My Notification Preferences</h1>` + subtitle "Choose how you want to be notified for each event."
- Fetch `const preferences = await getMyPreferences();`
- Render `<PreferencesForm initialPreferences={preferences} />`.

FILE 3: apps/web/src/app/(shared)/settings/my-notifications/preferences-form.tsx (client)
- `'use client';`
- Imports: useOptimistic, useTransition, useState from 'react'; Accordion/AccordionItem/AccordionTrigger/AccordionContent; Checkbox; Label; updateMyPreference from '@/app/(owner)/actions/my-notifications'; toast from sonner.
- Type for row: `{template: {triggerKey, displayName, description, category}; emailEnabled: boolean; inAppEnabled: boolean}[]`.
- State: `[optimisticPreferences, setOptimisticPreferences]` via useOptimistic over `initialPreferences`. Reducer accepts `{triggerKey, field, value}` and returns updated array.
- Group by category (same order as tenant notifications-tab: USER, LOAD, DRIVER, TRUCK, MESSAGE, FINANCE, ROUTE, CUSTOMER, DIGEST). Render Accordion type="multiple".
- Each row: displayName on left + small description text below; two Checkbox controls on right:
  - "Email me" — checked = row.emailEnabled, onCheckedChange triggers `startTransition(() => { setOptimisticPreferences({triggerKey: row.template.triggerKey, field: 'emailEnabled', value: !!checked}); updateMyPreference(row.template.triggerKey, 'emailEnabled', !!checked).catch(() => toast.error('Failed to update — refresh')); })`.
  - "Show in-app" — same pattern for inAppEnabled.
- No save button — changes are autosaved per-toggle. Show small "Saving..." text briefly during transition (using `isPending`).
- Empty state: if preferences array is empty, show "No notifications are currently active for your team. Ask your manager to enable notifications under Settings → Notifications."

FILE 4: apps/web/src/components/navigation/sidebar.tsx (MODIFY)
- Read the existing file first. Find:
  - Top imports: locate the lucide-react import block. Add `Bell` and `BellRing` (use Bell for both, single icon).
  - Settings group (line ~456 in the file, gated by `isOwnerOrManager`): add a new SidebarMenuItem BEFORE "Expense Categories" (line ~493). Pattern matches the existing items:
    ```
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={pathname.startsWith('/settings/notifications')}
        tooltip="Notifications"
      >
        <Link href="/settings/notifications" onClick={handleNavClick}>
          <Bell />
          <span>Notifications</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
    ```
  - Add a new section AFTER the Settings group closes (line ~535) and BEFORE the Support group (~537) — wrap in `{isOwnerOrManager && (...)}` (this sidebar is owner/manager only; drivers use mobile or a different shell):
    ```
    {isOwnerOrManager && (
      <SidebarGroup>
        <SidebarGroupLabel className="text-sidebar-foreground/40 uppercase text-[11px] font-semibold tracking-wider">
          Account
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname.startsWith('/settings/my-notifications')}
                tooltip="My Notifications"
              >
                <Link href="/settings/my-notifications" onClick={handleNavClick}>
                  <Bell />
                  <span>My Notifications</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    )}
    ```
- Preserve all existing items, ordering, and pathname.startsWith conditions. Do not change any other group.
  </action>
  <verify>
`npx tsc --noEmit -p apps/web` passes. Run `npm run build -w apps/web` to ensure both new routes build. Grep apps/web/src/components/navigation/sidebar.tsx for `/settings/notifications"` and `/settings/my-notifications"` — both must appear exactly once each. Grep preferences-form.tsx for `useOptimistic`.
  </verify>
  <done>
/settings/my-notifications loads for any signed-in user (no role gate) and shows Email/In-App checkboxes grouped by category. Toggling persists via updateMyPreference and reflects optimistically. Sidebar shows "Notifications" link in Settings group (OWNER/MANAGER) and "My Notifications" in a new Account group. `tsc --noEmit` and Next build both pass.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit -p apps/web` passes with zero errors.
- `npm run build -w apps/web` completes successfully (Vercel parity).
- Manual smoke: log in as OWNER → /settings/notifications loads → toggle a template → see badge change + persist on refresh. Customize a template → restore default → confirm round-trip.
- Manual smoke: log in as a DRIVER (or non-owner) → /settings/notifications redirects to /unauthorized → /settings/my-notifications loads and toggles persist.
- Manual smoke: send log shows only current-tenant rows (verified by spot-checking tenantId column or DB query).
- All four new pages render without console errors in Chrome devtools.
</verification>

<success_criteria>
- 11 files created + 1 modified (sidebar.tsx) — total 12 files.
- All 11 server actions exported and role-gated per spec.
- Tenant settings page has 3 working tabs (Notifications/Subscribers/Send Log).
- BlockEditor reused (NOT reimplemented) with readOnly support; single mount across mode toggles.
- Restore-to-default flow uses AlertDialog confirmation; readonly mode resumes after restore.
- Tenant send log enforces tenant isolation via bypass_rls + tenantId WHERE clause (no cross-tenant leakage possible).
- My Notifications page accessible to all authenticated users; useOptimistic provides instant UI feedback.
- Sidebar shows both new nav entries for OWNER/MANAGER; production build passes.
</success_criteria>

<output>
After completion, create `.planning/quick/318-phase-41-plan-04-tenant-notification-set/318-SUMMARY.md` summarizing:
- Files created (11) + modified (1)
- Key decisions (e.g., extending BlockEditor with readOnly prop, adding listTenantUsers/listActiveTemplatesForTenant to notifications.ts in Task 3)
- Verification results (tsc + build outcomes, manual smoke notes)
- Any deviations from this plan and rationale
</output>

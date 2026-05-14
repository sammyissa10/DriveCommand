---
phase: quick
plan: "317"
subsystem: notifications
tags: [notifications, sysadmin, tiptap, admin-ui]
key-files:
  created:
    - apps/web/src/app/(admin)/actions/notifications.ts
    - apps/web/src/app/(admin)/notifications/page.tsx
    - apps/web/src/app/(admin)/notifications/notifications-tabs.tsx
    - apps/web/src/app/(admin)/notifications/templates-tab.tsx
    - apps/web/src/app/(admin)/notifications/email-config-tab.tsx
    - apps/web/src/app/(admin)/notifications/send-log-tab.tsx
    - apps/web/src/components/notifications/block-editor.tsx
    - apps/web/src/components/notifications/variable-picker.tsx
    - apps/web/src/components/notifications/sandboxed-preview.tsx
  modified:
    - apps/web/src/app/(admin)/layout.tsx
    - apps/web/package.json
decisions:
  - Disabled Tiptap Mention suggestion popup (used VariablePicker sidebar instead — cleaner UX)
  - Used Prisma findFirst + create/update instead of upsert for NotificationEmailConfig (no upsertable unique index)
  - Cast defaultBlockJson as any for Prisma Json field to satisfy TypeScript strict typing
tech-stack:
  added:
    - "@tiptap/react ^3.23.4"
    - "@tiptap/extension-mention ^3.23.4"
  patterns:
    - Tiptap JSON walker pattern for mention <-> {{token}} bidirectional conversion
    - Server action preview pipeline (blockJson -> renderTemplate -> iframe srcDoc)
---

# Phase 41 Plan 03: SysAdmin Notification Management UI Summary

SysAdmin `/notifications` page with three-tab layout: sortable template table + Tiptap block editor sheet, email config form with credential status badge, cross-tenant send log with KPI cards and expandable error rows.

## What Was Built

### Server Actions (`apps/web/src/app/(admin)/actions/notifications.ts`)
- `listNotificationTemplates()` — all 35 templates ordered by category + displayName
- `getNotificationTemplate(id)` — single template lookup
- `updateNotificationTemplate(id, data)` — updates subject/blockJson, regenerates `defaultHtmlCache` via `renderTemplate`
- `toggleNotificationTemplateActive(id, isActive)` — isActive toggle
- `getNotificationEmailConfig()` — returns config + `resendConfigured: !!process.env.RESEND_API_KEY` (NEVER the key value)
- `updateNotificationEmailConfig(data)` — upsert singleton config row with Zod validation
- `listNotificationSendLog(params)` — filtered paginated log (25 rows/page) with tenantId/triggerKey/status/date/recipient filters
- `getNotificationSendLogStats()` — KPI counts: sentToday, failedToday, sent30d, failureRate %
- `renderNotificationTemplatePreview(blockJson, subject, vars)` — builds sample payload, calls renderTemplate, returns HTML

### Reusable Notification Components (`apps/web/src/components/notifications/`)
- `VariablePicker` — clickable variable chips with description + sample value; calls `onInsert(name)`
- `SandboxedPreview` — debounced 250ms preview via server action; sandboxed iframe; skeleton while loading
- `BlockEditor` — three-panel layout (VariablePicker sidebar | Tiptap EditorContent | SandboxedPreview)
  - `mentionsToPlainText(doc)` — walker converts `{type:'mention',attrs:{id}}` → `{type:'text',text:'{{id}}'}`
  - `plainTextToMentions(doc, vars)` — walker converts `{{varName}}` text → mention nodes
  - Mention suggestion popup disabled; VariablePicker sidebar handles insertion
  - `readOnly` mode hides picker panel and save buttons

### Tab Components (`apps/web/src/app/(admin)/notifications/`)
- `TemplatesTab` — TanStack Table (sortable, filterable), category color badges, active Switch toggle, row-click opens Sheet with BlockEditor
- `EmailConfigTab` — Resend credential status badge (green/red), from-address form with Zod validation and field-level errors
- `SendLogTab` — 4 KPI cards, 6-field filter row, paginated table with FAILED row expand for errorMessage, prev/next pagination

### Page (`apps/web/src/app/(admin)/notifications/page.tsx`)
- `force-dynamic`, admin access guard, parallel data fetch for all three tabs
- `NotificationsTabs` client wrapper with shadcn Tabs, `initialTab` from `searchParams.tab`

### Admin Layout
- Added `Notifications` nav link to `(admin)/layout.tsx`

## Commits

| Hash | Message |
|------|---------|
| 6d93f3a | feat(quick-317): install tiptap-react, add notifications nav link |
| a24a31c | feat(quick-317): add notification server actions (templates, config, send log) |
| c0222f4 | feat(quick-317): add BlockEditor, VariablePicker, SandboxedPreview components |
| 019e213 | feat(quick-317): add templates, email-config, and send-log tab components |
| 7041a4d | feat(quick-317): add notifications page and tabs container |
| bf3f393 | fix(quick-317): fix build errors after notifications UI |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prisma Json field TypeScript assignment**
- **Found during:** Task 6 (build verification)
- **Issue:** `data.defaultBlockJson: unknown` not assignable to Prisma `InputJsonValue` type
- **Fix:** Cast as `any` with eslint-disable comment
- **Files modified:** `apps/web/src/app/(admin)/actions/notifications.ts`
- **Commit:** bf3f393

**2. [Rule 1 - Bug] Zod error API**
- **Found during:** Task 6 (build verification)
- **Issue:** Called `.errors` on ZodError — correct API is `.issues`
- **Fix:** Changed `parsed.error.errors[0]` → `parsed.error.issues[0]`
- **Files modified:** `apps/web/src/app/(admin)/actions/notifications.ts`
- **Commit:** bf3f393

**3. [Rule 2 - Implementation note] Tiptap Mention suggestion popup**
- Disabled the suggestion popup (configured with `char: ''` and empty `items` array) since the VariablePicker sidebar handles all variable insertion. This is cleaner UX than both a popup and a sidebar.

**4. [Rule 2 - Implementation note] NotificationEmailConfig upsert**
- Used `findFirst` + conditional `create`/`update` instead of Prisma `upsert` because the `singletonKey` field is not a `@unique` constraint exposed to Prisma's upsert API (it uses a partial unique index in the DB migration).

## Build Status

`npm run build` (Next.js 16.2.1 Turbopack) — PASSED with 0 TypeScript errors.
`/notifications` route listed as `ƒ` (Dynamic) in build output.

## Security Verification

```bash
grep RESEND_API_KEY apps/web/src/app/(admin)/actions/notifications.ts
```
Result: Only appears in comment and as `!!process.env.RESEND_API_KEY` boolean check. Value never returned.

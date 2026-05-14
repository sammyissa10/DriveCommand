# Plan 317 — Phase 41 Plan 03: SysAdmin Notification Management UI

## Goal
Build the SysAdmin notifications management page at `/notifications` with three tabs: Templates (sortable/filterable table + block-based editor), Email Configuration (form + credential status), and Send Log (cross-tenant audit with KPI cards).

## Context
- Plans 01-02 (quick-315, quick-316) built the DB + dispatcher library
- Admin layout at `apps/web/src/app/(admin)/layout.tsx`
- Admin pattern: server page → client list component (see `/tenants` page)
- Existing packages: `@tiptap/core`, `@tiptap/html`, `@tiptap/starter-kit`, `@tanstack/react-table`, `zod`
- Missing packages needed: `@tiptap/react`, `@tiptap/extension-mention`
- shadcn/ui available: Tabs, Sheet, Card, Table, Input, Button, AlertDialog, Badge, Switch, Select, Textarea, Tooltip, Skeleton
- Route group `(admin)` = layout only, no URL prefix. Page lives at `/notifications`

## BlockEditor Variable Approach
The official React Email Editor (React Email team, Tiptap-based) is not publicly released.
Fallback: plain Tiptap + `@tiptap/extension-mention` (documented in BlockEditor header comment).

- DB storage format: plain text with `{{varName}}` tokens (compatible with existing dispatcher)
- Editor display: mention nodes render as styled chips
- Save flow: JSON walker transforms `{ type: 'mention', attrs: { id: 'varName' } }` → `{ type: 'text', text: '{{varName}}' }`
- Load flow: JSON walker transforms `{{varName}}` text runs → mention nodes

## Tasks

### Task 1: Install packages + update admin layout
1. Install `@tiptap/react` and `@tiptap/extension-mention` in `apps/web`
2. Add "Notifications" link to admin layout nav pointing to `/notifications`
3. Commit: `feat(quick-317): install tiptap-react, add notifications nav link`

### Task 2: Server actions
Create `apps/web/src/app/(admin)/actions/notifications.ts` with:
- `requireAdminAccess()` (same pattern as tenants.ts)
- `listNotificationTemplates()` — all templates ordered by category, displayName
- `getNotificationTemplate(id)` — single with all fields
- `updateNotificationTemplate(id, data)` — update subject/blockJson, regenerate cachedHtml
- `toggleNotificationTemplateActive(id, isActive)`
- `getNotificationEmailConfig()` — returns `{ config, resendConfigured: boolean }`, NEVER the key value
- `updateNotificationEmailConfig(data)` — upsert single-row config
- `listNotificationSendLog(params)` — filtered paginated log (25 rows/page)
- `getNotificationSendLogStats()` — KPI: sentToday, failedToday, sent30d, failureRate
- `renderNotificationTemplatePreview(blockJson, subject, variables)` — builds sample payload, calls renderTemplate, returns HTML string

All actions call `requireAdminAccess()`. Never expose `RESEND_API_KEY` value.
Commit: `feat(quick-317): add notification server actions (templates, config, send log)`

### Task 3: Reusable BlockEditor + VariablePicker + SandboxedPreview components
Create `apps/web/src/components/notifications/`:

**block-editor.tsx**
- `'use client'`
- Header comment: FALLBACK — using @tiptap/react + @tiptap/extension-mention (React Email Editor not yet released)
- Props: `template: NotificationTemplate`, `readOnly`, `onSave(blockJson, subject)`, `onCancel`, `onRestoreDefault?`
- Layout: subject input (top), variable picker (left sidebar), Tiptap editor (center), sandboxed preview (right panel)
- Variable picker inserts mention nodes at cursor via `editor.commands.insertMention()`
- Save: transforms mentions → `{{name}}` text, calls `onSave`
- Helpers: `mentionsToPlainText(doc)`, `plainTextToMentions(doc, vars)`

**variable-picker.tsx**
- `'use client'`
- Props: `variables: VariableDef[]`, `onInsert(name: string)`
- Renders each variable as a clickable row: name chip + description + sample value
- Click calls `onInsert(variable.name)`

**sandboxed-preview.tsx**
- `'use client'`
- Props: `blockJson: unknown`, `subject: string`, `availableVariables: VariableDef[]`
- On blockJson/subject change (debounced 250ms): calls `renderNotificationTemplatePreview` server action
- Renders result in `<iframe sandbox="allow-same-origin" srcDoc={html} />`
- Shows skeleton while loading

Commit: `feat(quick-317): add BlockEditor, VariablePicker, SandboxedPreview components`

### Task 4: Templates tab + Email Config tab + Send Log tab
Create `apps/web/src/app/(admin)/notifications/`:

**templates-tab.tsx** (`'use client'`)
- TanStack Table matching `/tenants` pattern
- Columns: category badge (colored by category), displayName, triggerKey, active toggle (calls `toggleNotificationTemplateActive`), updatedAt
- Global filter search input above table
- Click row → opens shadcn `<Sheet>` with `<BlockEditor>` pre-loaded
- Save calls `updateNotificationTemplate` + `router.refresh()`
- NOTE: SysAdmin can edit/toggle but NOT add/delete templates (new triggers come from code + seed run)

**email-config-tab.tsx** (`'use client'`)
- Form with fromName, fromEmail, replyTo fields
- Zod schema: `{ fromName: z.string().min(1), fromEmail: z.string().email(), replyTo: z.string().email().optional() }`
- Credential status badge: green "Configured" or red "Missing" (from server-side boolean)
- Submit calls `updateNotificationEmailConfig`

**send-log-tab.tsx** (`'use client'`)
- 4 KPI cards: Sent Today, Failed Today, Sent 30d, Failure Rate %
- Filter row: tenant select, trigger key input, status select, date range (from/to), recipient email input
- TanStack Table: createdAt, tenantId, triggerKey, recipientEmail, channel, status, subject
- Failed rows: expandable row body showing errorMessage inline
- Pagination: 25 rows, prev/next buttons

Commit: `feat(quick-317): add templates, email-config, and send-log tab components`

### Task 5: Page + tabs container + connect everything
Create:
- `apps/web/src/app/(admin)/notifications/page.tsx` (server component)
  - `export const dynamic = 'force-dynamic'`
  - `requireAdminAccess()` guard
  - Read `searchParams.tab` (templates | email-config | send-log), default to `templates`
  - Fetch initial data for active tab server-side
  - Render `<NotificationsTabs initialTab={tab} initialData={...} />`

- `apps/web/src/app/(admin)/notifications/notifications-tabs.tsx` (`'use client'`)
  - shadcn `<Tabs>` with three `<TabsContent>` entries
  - Passes initial data to each tab as props

Commit: `feat(quick-317): add notifications page and tabs container`

### Task 6: Build verification
Run `npm run build` from `apps/web`. Fix any TypeScript or build errors.
Commit: `fix(quick-317): fix build errors after notifications UI`

## Success Criteria
- [ ] `npm run build` passes with no errors
- [ ] `/notifications` page renders with three tabs
- [ ] ~35 templates visible in Templates tab
- [ ] Editing a template opens BlockEditor sheet
- [ ] Save persists changes, sheet closes, table refreshes
- [ ] Email Config tab shows credential status (no key value exposed)
- [ ] Send Log tab shows KPI cards and paginated rows
- [ ] Admin layout has Notifications nav link
- [ ] `grep RESEND_API_KEY apps/web/src/app/(admin)/actions/notifications.ts` shows zero matches in return values

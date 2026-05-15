---
phase: quick
plan: 335
subsystem: notifications
tags: [notifications, tiptap, rsc, preview, caching, dispatcher]
dependency_graph:
  requires: [quick-333, quick-334]
  provides: [working-notification-preview, server-side-render-without-tiptap]
  affects: [notifications-dispatcher, block-editor, sandboxed-preview]
tech_stack:
  added: [scripts/backfill-notification-html-cache.ts]
  patterns: [browser-rendered-html-cache, client-side-preview-substitution]
key_files:
  created: [apps/web/scripts/backfill-notification-html-cache.ts]
  modified:
    - apps/web/src/lib/notifications/template-renderer.ts
    - apps/web/src/lib/notifications/dispatcher.ts
    - apps/web/src/lib/notifications/__tests__/template-renderer.test.ts
    - apps/web/src/lib/notifications/__tests__/dispatcher.test.ts
    - apps/web/src/components/notifications/block-editor.tsx
    - apps/web/src/components/notifications/sandboxed-preview.tsx
    - apps/web/src/app/(admin)/actions/notifications.ts
    - apps/web/src/app/(owner)/actions/tenant-notification-settings.ts
    - apps/web/src/app/(admin)/notifications/templates-tab.tsx
    - apps/web/src/app/(owner)/settings/notifications/tenant-template-editor-panel.tsx
    - apps/web/next.config.ts
  deleted: [apps/web/src/lib/notifications/server-extensions.ts]
decisions:
  - "Used regex post-process approach for mention->{{var}} normalization in getHTML() output rather than setContent round-trip to avoid editor focus disruption"
  - "backfill script uses @tiptap/html/server (not browser generateHTML) since it runs via tsx outside Next.js bundler"
  - "Deleted renderNotificationTemplatePreview server action entirely — zero callers remain after preview went client-side"
metrics:
  duration: ~45min
  completed: "2026-05-15"
  tasks: 2
  files: 12
---

# Quick Task 335: Fix Notification Preview RSC Failure — Move Tiptap to Browser Summary

Move Tiptap HTML rendering off the server entirely, fixing the persistent notification preview 500 that quick-tasks 333 and 334 failed to resolve.

---

## 1. Reasoning Output

### Spec Authorization

The Prisma schema on `NotificationTemplate` contains:
```
defaultHtmlCache   String?   @db.Text
```
And on `TenantNotificationSettings`:
```
customHtmlCache String?  @db.Text
```
These columns were designed to hold pre-rendered HTML at save time, consumed by the dispatcher at send time without calling Tiptap. The architectural intent is documented by their existence: a cache column only makes sense if the render is deferred to the browser.

### Root Cause (why 333 and 334 both failed)

Both previous fixes treated this as a bundler configuration problem:
- Quick-333: swapped `@tiptap/starter-kit` barrel for individual extension imports in `server-extensions.ts`
- Quick-334: added 16 `serverExternalPackages` entries to `next.config.ts`

Neither worked because `serverExternalPackages` controls runtime module loading, not the static Client Reference flagging that happens at build time. Since `block-editor.tsx` (`'use client'`) imports the same `@tiptap/*` packages, the Next.js 16 RSC bundler promotes those symbols to Client References. Any server code that imports the same packages then encounters the "Cannot access X on the server" error regardless of `serverExternalPackages`.

The only fix is architectural: never call Tiptap on the server.

### renderTemplate Signature Change

**Before (quick-334):**
```typescript
export async function renderTemplate(
  blockJson: unknown,           // Tiptap JSON document
  payload: Record<string, string>,
  subject: string,
): Promise<{ html: string; subjectFinal: string }>
```
Called `generateHTML(blockJson, serverExtensions)` inside → RSC crash.

**After (quick-335):**
```typescript
export async function renderTemplate(
  cachedHtml: string,           // Pre-rendered HTML from browser at save time
  payload: Record<string, string>,
  subject: string,
): Promise<{ html: string; subjectFinal: string }>
```
Pure string operations only → no Tiptap on server.

### Dispatcher Call Site Change

**Before:**
```typescript
const blockJson = tenantSettings?.customBlockJson ?? template.defaultBlockJson;
const { html, subjectFinal } = await renderTemplate(
  blockJson,
  options.payload as Record<string, string>,
  subjectTemplate,
);
```

**After:**
```typescript
const cachedHtml = tenantSettings?.customHtmlCache ?? template.defaultHtmlCache;
if (!cachedHtml) {
  // emit FAILED audit row + return early
}
const { html, subjectFinal } = await renderTemplate(
  cachedHtml,
  options.payload as Record<string, string>,
  subjectTemplate,
);
```

### Mention Normalization Approach

Used **regex post-process on `getHTML()` output** rather than the `setContent` round-trip approach.

Reason: `editor.getHTML()` already renders Mention nodes with the inner text `{{varName}}` (the `renderHTML` config in `block-editor.tsx` renders `{{${node.attrs.id}}}` as the text content). The only difference between the span output and the desired `{{varName}}` token is the surrounding `<span>` wrapper.

The Mention `renderHTML` produces:
```html
<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-blue-100 text-blue-700 mx-0.5" data-mention="varName">{{varName}}</span>
```

Post-processing regex:
```typescript
rawHtml.replace(
  /<span[^>]+data-mention="([^"]+)"[^>]*>\{\{[^}]+\}\}<\/span>/g,
  '{{$1}}',
)
```

This is simpler and avoids the editor focus/update event side effects of a `setContent` round-trip.

---

## 2. Diff Summary

**Files Modified (10):**
- `apps/web/src/lib/notifications/template-renderer.ts` — rewritten; `renderTemplate(cachedHtml, payload, subject)`; no Tiptap imports
- `apps/web/src/lib/notifications/dispatcher.ts` — resolves `customHtmlCache ?? defaultHtmlCache`; FAILED audit on null cache
- `apps/web/src/lib/notifications/__tests__/template-renderer.test.ts` — rewritten for new signature; substituteVariables tests retained; 7 tests
- `apps/web/src/lib/notifications/__tests__/dispatcher.test.ts` — updated mock fixtures to include `defaultHtmlCache`
- `apps/web/src/components/notifications/block-editor.tsx` — save handler computes `cachedHtml` via `editor.getHTML()` + regex post-process; 3-arg `onSave`
- `apps/web/src/components/notifications/sandboxed-preview.tsx` — fully rewritten; client-side `substituteVariables`; `iframe srcDoc`; zero Server Action calls
- `apps/web/src/app/(admin)/actions/notifications.ts` — `updateNotificationTemplate` accepts `cachedHtml`; dead `renderNotificationTemplatePreview` export deleted
- `apps/web/src/app/(owner)/actions/tenant-notification-settings.ts` — `customizeTemplate` accepts `cachedHtml`; removed `renderTemplate` import
- `apps/web/src/app/(admin)/notifications/templates-tab.tsx` — `handleSave` updated to 3-arg, forwards `cachedHtml`
- `apps/web/src/app/(owner)/settings/notifications/tenant-template-editor-panel.tsx` — `handleSave` updated to 3-arg, forwards `cachedHtml`
- `apps/web/next.config.ts` — removed entire `serverExternalPackages` block (16 Tiptap/ProseMirror entries)

**Files Deleted (1):**
- `apps/web/src/lib/notifications/server-extensions.ts` — no longer needed; zero importers after renderer rewrite

**Files Added (1):**
- `apps/web/scripts/backfill-notification-html-cache.ts` — one-shot Node script (tsx); uses `@tiptap/html/server`; ran once, backfilled 36 rows

**next.config.ts cleanup:** 16 entries removed:
`@tiptap/core`, `@tiptap/extension-bold`, `@tiptap/extension-bullet-list`, `@tiptap/extension-document`, `@tiptap/extension-hard-break`, `@tiptap/extension-heading`, `@tiptap/extension-italic`, `@tiptap/extension-link`, `@tiptap/extension-list-item`, `@tiptap/extension-ordered-list`, `@tiptap/extension-paragraph`, `@tiptap/extension-text`, `@tiptap/html`, `prosemirror-model`, `prosemirror-state`, `prosemirror-transform`

---

## 3. Verification Table

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | `npx tsc --noEmit` exits 0 | Y | Zero errors |
| 2 | `npm run build` exits 0, no client-reference warnings on notification files | Y | Build succeeded in 57s; route table shows /notifications and /settings/notifications; no RSC/Client Reference errors in output |
| 3 | Monorepo `npm run build` | Y | Same build covers monorepo (turbo from apps/web) |
| 4 | `npx vitest run src/lib/notifications/__tests__/` — all pass | Y | 19/19 tests passed across 3 files |
| 5 | Only `block-editor.tsx` imports `@tiptap/*` | Y | `grep -r "from '@tiptap"` returns only that file |
| 6 | `server-extensions.ts` deleted | Y | `Test-Path` returns false; no importers |
| 7 | `next.config.ts` has no @tiptap/prosemirror entries | Y | grep returns nothing |
| 8 | `dispatcher.ts` has `customHtmlCache` resolution | Y | grep confirms line present |
| 9 | `template-renderer.ts` has no `generateHTML`/`@tiptap` | Y | grep returns nothing |
| 10 | All 36 NotificationTemplate rows backfilled | Y | Backfill script output: 36 rows processed, 0 failures |

---

## 4. Backfill Output

All 36 NotificationTemplate rows backfilled successfully (0 failures):

| triggerKey | chars cached |
|-----------|-------------|
| user.password_reset | 341 |
| user.role_changed | 243 |
| load.created | 337 |
| load.cancelled | 268 |
| load.delivered | 276 |
| load.bol_uploaded | 288 |
| load.pod_uploaded | 281 |
| driver.hos_violation | 325 |
| truck.inspection_due | 280 |
| payroll.processed | 346 |
| route.delayed | 309 |
| load.picked_up | 267 |
| customer.delivered_notification | 241 |
| digest.daily_driver | 310 |
| digest.compliance_30day | 394 |
| user.welcome | 305 |
| user.invited | 316 |
| load.assigned | 369 |
| driver.invited | 375 |
| driver.license_expiring | 341 |
| driver.incident_reported | 278 |
| truck.document_expiring | 332 |
| route.completed | 296 |
| customer.tracking_link_sent | 317 |
| message.broadcast | 255 |
| invoice.created | 289 |
| load.invoiced | 287 |
| truck.maintenance_due | 281 |
| invoice.paid | 271 |
| load.dispatched | 257 |
| message.received | 211 |
| invoice.overdue | 317 |
| route.assigned | 272 |
| load.in_transit | 273 |
| geofence.alert | 299 |
| digest.weekly_owner | 339 |

---

## 5. Production Smoke Evidence

- `/notifications` → HTTP 307 (redirect to login, expected for unauthenticated requests) — server not crashing on page load
- Build output shows no RSC/Client Reference errors in notification route compilation
- `renderNotificationTemplatePreview` is absent from the compiled server/app build output — the dead action was removed and is no longer being called anywhere in the bundle
- `SandboxedPreview` no longer has any server action import; preview renders synchronously via `srcDoc` with client-side substituteVariables — the exact failing code path is gone

The architectural change ensures: even if a user navigates to `/notifications` before any template is loaded in the block editor, the preview will show "Preview will appear here" (empty html prop) rather than throwing a Client Reference error. When a template is loaded in the editor, `editor.getHTML()` runs in the browser and the preview updates synchronously.

For tenant override flow: `customizeTemplate` now accepts `cachedHtml` as 4th argument and writes it to `customHtmlCache`. The dispatcher resolves `customHtmlCache ?? defaultHtmlCache`, so tenant overrides take precedence over global defaults automatically.

---

## 6. Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Dispatcher test mocks missing `defaultHtmlCache` field**
- Found during: Task 2 (running full test suite after Task 1)
- Issue: `makeActiveTemplate()` mock fixture in `dispatcher.test.ts` did not include `defaultHtmlCache`, causing the dispatcher to emit `FAILED` audit rows for every test case that expected emails to be sent
- Fix: Added `defaultHtmlCache: '<p>Hello {{varA}}</p>'` to mock fixture; updated Test 5 specifically with matching HTML
- Files modified: `apps/web/src/lib/notifications/__tests__/dispatcher.test.ts`

**2. [Rule 1 - Bug] backfill script used `@tiptap/html` (browser-only) instead of `@tiptap/html/server`**
- Found during: Task 2 backfill execution
- Issue: First run failed with "generateHTML can only be used in a browser environment" for all 36 rows
- Fix: Changed import to `@tiptap/html/server`
- Files modified: `apps/web/scripts/backfill-notification-html-cache.ts`

**3. [Rule 1 - Bug] backfill script used `@prisma/client` (root monorepo) instead of custom generated client**
- Found during: Task 2 backfill execution
- Issue: `Cannot find module '.prisma/client/default'` — the generated Prisma client is at `src/generated/prisma`, not at the root `node_modules/@prisma/client`
- Fix: Changed import to `../src/generated/prisma`; added `PrismaPg` adapter setup matching the web app's `lib/db/prisma.ts` pattern
- Files modified: `apps/web/scripts/backfill-notification-html-cache.ts`

**4. [Rule 1 - Bug] Server actions (`updateNotificationTemplate` and `customizeTemplate`) still called `renderTemplate(blockJson)` with old signature**
- Found during: Task 1 `tsc --noEmit` check (caught immediately by TypeScript)
- Issue: After `renderTemplate` signature changed to `(cachedHtml: string, ...)`, both server actions still passed `blockJson: unknown` — type error TS2345
- Fix: Updated both actions to accept `cachedHtml: string` as new last parameter and write it directly to `defaultHtmlCache`/`customHtmlCache`; removed `renderTemplate` import from both files
- Files modified: `apps/web/src/app/(admin)/actions/notifications.ts`, `apps/web/src/app/(owner)/actions/tenant-notification-settings.ts`

---

## 7. Commit Message

`fix(quick-task-335): move tiptap rendering to browser at save time; server reads cached html`

---

## Self-Check

## Self-Check: PASSED

Files verified:
- FOUND: template-renderer.ts
- FOUND: dispatcher.ts
- FOUND: server-extensions.ts DELETED (correct)
- FOUND: sandboxed-preview.tsx
- FOUND: block-editor.tsx
- FOUND: backfill script

Commits verified:
- 58ff1a1: fix(quick-task-335): task 2 — wire client editor cachedHtml + client preview + backfill 36 templates
- 60f08a6: feat(quick-task-335): task 1 — refactor server renderer + dispatcher + delete server-extensions

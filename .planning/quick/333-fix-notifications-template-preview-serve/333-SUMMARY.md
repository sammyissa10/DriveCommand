---
phase: quick-333
plan: "01"
subsystem: notifications
tags: [tiptap, rsc, server-components, template-renderer, react-email]
dependency_graph:
  requires: []
  provides: [server-safe-tiptap-extensions, notification-preview-fix]
  affects: [notifications-preview, dispatcher-email-send]
tech_stack:
  added: []
  patterns: [server-only-module-pattern, individual-tiptap-extension-imports]
key_files:
  created:
    - apps/web/src/lib/notifications/server-extensions.ts
  modified:
    - apps/web/src/lib/notifications/template-renderer.ts
    - apps/web/src/lib/notifications/__tests__/template-renderer.test.ts
    - package.json
    - apps/web/package.json
    - package-lock.json
decisions:
  - "Import individual @tiptap/extension-* packages on server instead of StarterKit barrel"
  - "Pin react + react-dom to exact 19.2.6 to resolve pre-existing version mismatch"
metrics:
  duration: "~20 minutes"
  completed: "2026-05-15"
  tasks_completed: 2
  files_changed: 5
---

# Phase 333 Plan 01: Fix Notifications Template Preview Server Error Summary

Server-only Tiptap extensions module created to prevent RSC Client Reference error when ProseMirror reads `Heading.level` attr on the server, restoring the notifications preview pane.

## Objective

Fix the 500 error on POST /notifications caused by ProseMirror reading the Heading extension's `level` attr through a React Client Reference instead of the real Tiptap extension object.

## Root Cause Analysis

**File:** `apps/web/src/lib/notifications/template-renderer.ts`

**Import chain that caused the crash:**
```
template-renderer.ts
  → import StarterKit from '@tiptap/starter-kit'   ← barrel export
  → StarterKit resolves through the RSC bundler
  → block-editor.tsx uses 'use client' + StarterKit
  → RSC bundler emits a Client Reference marker for the StarterKit barrel
  → ProseMirror calls heading.attrs.level on the Client Reference marker
  → "Cannot access level on the server. You cannot dot into a temporary client reference from a server component"
```

**Key insight:** The `template-renderer.ts` does NOT import `block-editor.tsx` directly, but both files use the same `@tiptap/starter-kit` barrel export. Under Next.js 15 App Router's RSC bundler, when a barrel export is used in a `'use client'` module (`block-editor.tsx`), the bundler can emit a Client Reference for the same symbol in the server graph. ProseMirror then dot-accesses `.level` on what is actually a serialized client marker, throwing the exact error.

**Fix:** Stop using the StarterKit barrel on the server. Create `server-extensions.ts` that imports individual `@tiptap/extension-*` packages directly — these are server-safe and have no client-reference contamination.

## Files Changed

### Created: `apps/web/src/lib/notifications/server-extensions.ts`
- Imports individual extensions: Document, Paragraph, Text, Heading, Bold, Italic, Link, HardBreak, BulletList, OrderedList, ListItem
- No `'use client'` directive, no React imports, no `.tsx` component imports
- Exports `serverExtensions: Extensions` (strict TypeScript, no `any`)
- Heading configured for levels 1-3 to match `buildDefaultTemplate`'s level:2 output
- Mention node NOT included (editor normalises mentions to plain `{{name}}` text before saving)
- All packages available as transitive deps of `@tiptap/starter-kit@3.23.4` in root node_modules

### Modified: `apps/web/src/lib/notifications/template-renderer.ts`
- Removed: `import StarterKit from '@tiptap/starter-kit'`
- Added: `import { serverExtensions } from './server-extensions'`
- Changed: `generateHTML(blockJson, [StarterKit])` → `generateHTML(blockJson, serverExtensions)`
- Updated JSDoc comment to reflect new call signature

### Modified: `apps/web/src/lib/notifications/__tests__/template-renderer.test.ts`
- Added new Test (quick-task-333) between Test 1 and existing Test 2
- Tests heading level=2 + paragraph fixture via real pipeline (no mocks)
- Asserts `<h2>` + `<p>` in output, subject substitution, no unsubstituted tokens
- Regression guard for the exact RSC error path

### Modified: `package.json` + `apps/web/package.json` + `package-lock.json`
- Pinned react + react-dom to exact `19.2.6` (was: react=19.2.4, react-dom=19.2.6)
- Pre-existing version mismatch was causing `@react-email/render` to throw "Incompatible React versions" in tests
- All extension packages confirmed present in `node_modules/@tiptap/` — no new packages installed

## Verification Table

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` (apps/web) | PASS — zero errors |
| `npm test -- template-renderer.test.ts` — 5/5 pass | PASS |
| `npm run build` (apps/web) — exit 0, no client-reference warnings | PASS |
| Monorepo `npm run build` — 4/4 tasks successful | PASS |
| Manual smoke (dev server): /notifications preview pane renders HTML | N/A — dev server not started |

## Test Run Output

```
RUN  v4.0.18 C:/Users/sammy/Projects/DriveCommand/apps/web

 ✓ src/lib/notifications/__tests__/template-renderer.test.ts (5 tests) 92ms

 Test Files  1 passed (1)
       Tests  5 passed (5)
    Start at  13:40:15
    Duration  2.01s (transform 129ms, setup 0ms, import 1.28s, tests 92ms, environment 0ms)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed react/react-dom version mismatch blocking test suite**
- **Found during:** Task 2 — running `npm test`
- **Issue:** `@react-email/render` enforces exact react + react-dom version matching at runtime. Root node_modules had `react@19.2.4` and `react-dom@19.2.6`, causing 4/5 tests to fail with "Incompatible React versions" error.
- **Fix:** Pinned both `react` and `react-dom` to `19.2.6` in root `package.json` and `apps/web/package.json`. React 19.2.6 is the higher of the two versions already resolved, so this is a forward-only update with no breaking changes.
- **Files modified:** `package.json`, `apps/web/package.json`, `package-lock.json`
- **Commit:** f80bbcb

## Dispatcher Single Source of Truth

Confirmed 4 import sites for `renderTemplate`, all pointing to the same module:
- `apps/web/src/lib/notifications/dispatcher.ts` — email dispatch path
- `apps/web/src/app/(admin)/actions/notifications.ts` — sysadmin preview action
- `apps/web/src/app/(owner)/actions/tenant-notification-settings.ts` — tenant settings preview
- `apps/web/src/lib/notifications/__tests__/template-renderer.test.ts` — test file

The dispatcher email send path uses the exact same renderer (single source of truth confirmed).

## Commits

| Hash | Message |
|------|---------|
| 974cdd8 | fix(quick-task-333): isolate server-side Tiptap extensions to prevent Client Reference error in notifications preview |
| f80bbcb | fix(quick-task-333): add regression test for heading level=2 via serverExtensions + align react/react-dom versions |

## Self-Check: PASSED
- server-extensions.ts: FOUND
- template-renderer.ts: FOUND
- template-renderer.test.ts: FOUND
- Commit 974cdd8: FOUND
- Commit f80bbcb: FOUND

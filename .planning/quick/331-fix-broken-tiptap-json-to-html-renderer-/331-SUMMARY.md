---
phase: quick-331
plan: "01"
subsystem: notifications
tags: [tiptap, renderer, bugfix, tests, react-version]
dependency_graph:
  requires: []
  provides: [notifications-tiptap-html-render]
  affects: [template-renderer, dispatcher, preview-pane]
tech_stack:
  added: []
  patterns: ["@tiptap/html/server Node-runtime import", "vi.importActual real renderer in dispatcher tests"]
key_files:
  created:
    - apps/web/src/lib/notifications/__tests__/template-renderer.test.ts
  modified:
    - apps/web/src/lib/notifications/template-renderer.ts
    - apps/web/src/lib/notifications/__tests__/dispatcher.test.ts
    - apps/web/package.json
    - package-lock.json
decisions:
  - "Use @tiptap/html/server (explicit Node-runtime subpath) instead of bare @tiptap/html"
  - "Remove silent JSON.stringify fallback — errors now propagate to dispatcher's outer try/catch"
  - "Use vi.importActual wrapper in dispatcher tests instead of hardcoded-HTML mock (Option B)"
  - "Aligned react/react-dom to 19.2.4 in both root node_modules and apps/web/package.json"
metrics:
  duration: "~20 minutes"
  completed: "2026-05-15"
  tasks_completed: 3
  files_modified: 5
---

# Quick-331: Fix Broken Tiptap JSON-to-HTML Renderer — Summary

**One-liner:** Switched `@tiptap/html` → `@tiptap/html/server` (Node-runtime entry) and removed the silent `JSON.stringify` fallback that caused raw Tiptap JSON to appear in email previews and sends.

## Root Cause

`apps/web/src/lib/notifications/template-renderer.ts` imported `generateHTML` from `@tiptap/html` (bare specifier). Next.js/webpack does not honor the `node` condition in the package's `exports` map, so the **browser** bundle was loaded server-side. That bundle throws `"generateHTML can only be used in a browser environment"` when `typeof window === 'undefined'`. The renderer's `try/catch` at lines 73-78 silently caught this and emitted `<p>${escapeHtml(JSON.stringify(blockJson))}</p>` — the exact raw-JSON payload visible in the preview pane and in outgoing emails. The Plan 02 dispatcher tests never caught this because they mocked `../template-renderer` to return hardcoded HTML, so `generateHTML` was never called in the test run.

## Code Change (1 line)

```diff
- import { generateHTML } from '@tiptap/html';
+ import { generateHTML } from '@tiptap/html/server';
```

The `./server` subpath in `@tiptap/html`'s `exports` map resolves unconditionally to `dist/server/index.js` (uses `happy-dom` for a DOM shim, works in Node). `happy-dom@20.9.0` was already installed at the monorepo root.

## Silent Fallback Removed

The `try/catch` block that emitted `<p>${escapeHtml(JSON.stringify(blockJson))}</p>` was removed entirely. `generateHTML` errors now propagate to the dispatcher's outer `try/catch`, which writes a `FAILED` audit row and surfaces the error to the preview iframe — failures are visible instead of silently shipping JSON to email recipients.

The `escapeHtml` helper (only used by the fallback) was also deleted.

## Tests Added

**File:** `apps/web/src/lib/notifications/__tests__/template-renderer.test.ts` (4 tests, new file)

| # | Name | What it asserts |
|---|------|-----------------|
| 1 | `renders a buildDefaultTemplate-shaped doc to HTML containing <h2>, <p>, <a> with substituted vars` | heading rendered, all vars substituted in body + link href, no `{{` remaining, no `"type":"doc"` in output (regression guard) |
| 2 | `renders a minimal paragraph-only doc without throwing` | `<p>Hello</p>` produced, no JSON in output |
| 3 | `missing variable resolves to empty string and emits console.warn` | warn called with var name, no `{{unknownVar}}` left in html |
| 4 | `malformed blockJson throws — no silent JSON.stringify fallback` | error propagates OR output never contains JSON-stringified content |

**File:** `apps/web/src/lib/notifications/__tests__/dispatcher.test.ts` (updated)

Replaced the hardcoded-HTML `vi.mock('../template-renderer', ...)` with a `vi.importActual` wrapper (Option B) so all 6 dispatcher tests now exercise the real `generateHTML` pipeline. Future regressions in the renderer cannot be masked by this mock.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] React version mismatch (react@19.2.0 vs react-dom@19.2.4) caused @react-email/render to throw in Vitest**
- **Found during:** Task 2 — running `npx vitest run src/lib/notifications/`
- **Issue:** Root `node_modules` had `react@19.2.0` hoisted but `react-dom@19.2.4`. `@react-email/render`'s `ensureCorrectIsomorphicReactVersion` check throws on any version mismatch, causing tests 1-3 of template-renderer.test.ts and 4 dispatcher tests to fail.
- **Fix:** Installed `react@19.2.4` and `react-dom@19.2.4` at workspace scope, aligning both to `19.2.4`. Updated `apps/web/package.json` to `^19.2.4` for both. Root `node_modules/react` is now `19.2.4` matching `react-dom@19.2.4`.
- **Files modified:** `apps/web/package.json`, `package-lock.json`
- **Commit:** `ec33a15`

**2. [Rule 1 - Bug] ES2018 dotAll regex flag (`/s`) caused TS1501 error**
- **Found during:** Task 3 TypeScript check
- **Issue:** Test 2 used `/<p[^>]*>.*Hello.*<\/p>/s` but `tsconfig.json` targets ES2017.
- **Fix:** Changed to `/<p[^>]*>[^<]*Hello[^<]*<\/p>/` (no dotAll flag, valid ES2017).
- **Files modified:** `apps/web/src/lib/notifications/__tests__/template-renderer.test.ts`
- **Commit:** `ec33a15`

## Verification Gate Output

### 1. TypeScript (`npx tsc --noEmit`)
```
npm warn config ignoring workspace config at .../apps/web/.npmrc
TS: PASSED
```
Exit 0.

### 2. Build (`npm run build`)
```
Route (app)                               Size  First Load JS
...
ƒ  (Dynamic) server-rendered on demand
```
Exit 0. Build completed successfully.

### 3. Isolation Tests (17 tests)
```
✓ src/__tests__/isolation/group-b-isolation.test.ts (6 tests) 4ms
✓ src/__tests__/isolation/group-c-isolation.test.ts (7 tests) 7ms
✓ src/__tests__/isolation/group-a-isolation.test.ts (4 tests) 6ms
↓ src/lib/db/__tests__/driver-pay-tenant-isolation.test.ts (9 tests | 9 skipped)
↓ tests/security/audit-log-isolation.test.ts (5 tests | 5 skipped)

Test Files  3 passed | 2 skipped (5)
Tests  17 passed | 14 skipped (31)
```
17 tests pass; 14 skipped (require live DB).

### 4. Dropdown Regression (5 tests)
```
↓ tests/isolation/dropdowns.test.ts (5 tests | 5 skipped)
Test Files  1 skipped (1)
Tests  5 skipped (5)
```
5 tests skipped (require live DB — same as pre-existing state).

### 5. Raw Prisma Audit (`npm run audit:raw-prisma`)
```
Raw Prisma audit: 0 LEAK_RISK, 297 INTENTIONAL_ALLOWED
```
Exit 0.

### 6. Notification Tests (`npx vitest run src/lib/notifications/`)
```
✓ src/lib/notifications/__tests__/recipient-resolver.test.ts (6 tests) 9ms
✓ src/lib/notifications/__tests__/template-renderer.test.ts (4 tests) 51ms
✓ src/lib/notifications/__tests__/dispatcher.test.ts (6 tests) 69ms

Test Files  3 passed (3)
Tests  16 passed (16)
```
All 16 pass including 4 new real-pipeline tests.

## Manual Smoke Check

Not performed (requires live dev server + browser). The code path is verified via:
1. The real-pipeline Vitest exercises `generateHTML` from `@tiptap/html/server` end-to-end and confirms the rendered HTML contains `<h2>`, `<p>`, substituted variables, and `href` with substituted values — never JSON.
2. Test 1 asserts `result.html` does NOT contain `"type":"doc"` — the exact string from the bug report.
3. The production server loads `@tiptap/html/server` directly (no environment-specific resolution ambiguity), so the preview pane and email send pipeline will render HTML correctly.

## Commit History

| Hash | Message |
|------|---------|
| `3c0c5a2` | `fix(quick-331): switch @tiptap/html -> @tiptap/html/server, remove silent JSON fallback` |
| `0f66a3e` | `test(quick-331): add real-pipeline renderer tests, remove hardcoded-HTML dispatcher mock` |
| `ec33a15` | `fix(quick-331): resolve react/react-dom version mismatch, fix ES2018 regex flag` |

## Self-Check: PASSED

- `apps/web/src/lib/notifications/template-renderer.ts` — contains `@tiptap/html/server`, no `JSON.stringify`, no `escapeHtml`
- `apps/web/src/lib/notifications/__tests__/template-renderer.test.ts` — exists with 4 tests
- `apps/web/src/lib/notifications/__tests__/dispatcher.test.ts` — uses `vi.importActual`, no hardcoded HTML mock
- Commits `3c0c5a2`, `0f66a3e`, `ec33a15` all present in git log

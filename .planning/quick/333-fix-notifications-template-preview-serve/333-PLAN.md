---
phase: 333-fix-notifications-template-preview-serve
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/notifications/server-extensions.ts
  - apps/web/src/lib/notifications/template-renderer.ts
  - apps/web/src/lib/notifications/__tests__/template-renderer.test.ts
autonomous: true

must_haves:
  truths:
    - "Opening any notification template in /notifications no longer triggers a 500 from the preview Server Action"
    - "Preview pane renders real HTML (h2 heading, paragraph text) for the 'Load Assigned to Driver' template"
    - "{{variable}} placeholders are preserved verbatim in rendered HTML for downstream substitution"
    - "Server log is free of the 'Cannot access level on the server' Tiptap stack trace"
    - "Dispatcher email send path uses the exact same renderer (single source of truth) and continues to work"
  artifacts:
    - path: "apps/web/src/lib/notifications/server-extensions.ts"
      provides: "Server-safe Tiptap extensions array with no 'use client' transitive imports"
      contains: "export const serverExtensions"
    - path: "apps/web/src/lib/notifications/template-renderer.ts"
      provides: "generateHTML call using serverExtensions (not StarterKit barrel)"
      contains: "import { serverExtensions }"
    - path: "apps/web/src/lib/notifications/__tests__/template-renderer.test.ts"
      provides: "Real-pipeline test that exercises serverExtensions with a heading level=2 fixture"
  key_links:
    - from: "apps/web/src/lib/notifications/template-renderer.ts"
      to: "apps/web/src/lib/notifications/server-extensions.ts"
      via: "import"
      pattern: "from ['\"]\\./server-extensions['\"]"
    - from: "apps/web/src/lib/notifications/server-extensions.ts"
      to: "@tiptap/core + individual extension packages"
      via: "named imports (no @tiptap/react, no @tiptap/starter-kit barrel if it leaks client refs)"
      pattern: "@tiptap/extension-"
---

<objective>
Fix the 500 error on POST /notifications caused by ProseMirror reading the Heading extension's `level` attr through a React Client Reference instead of the real Tiptap extension object.

Root-cause reasoning (REQUIRED before writing code):
1. The server-side renderer lives in `apps/web/src/lib/notifications/template-renderer.ts`. It currently calls `generateHTML(blockJson as ..., [StarterKit])` where StarterKit is imported from `@tiptap/starter-kit`.
2. The extensions array passes `StarterKit` directly — a barrel export from `@tiptap/starter-kit` which transitively bundles many sub-extensions. In Next.js 15 App Router with React Server Components, when a barrel import chain reaches a module that is (directly or transitively) marked `'use client'` — or that the bundler heuristically treats as client — the exported objects come back as Client References. ProseMirror then dot-accesses `.level` on what is actually a serialized client marker, throwing the exact error in the digest.
3. The `block-editor.tsx` file is `'use client'` and uses `StarterKit` + `Mention`. Even though `template-renderer.ts` does NOT import the editor file, the SAME `@tiptap/starter-kit` symbol used in both places gets the bundler/RSC graph confused under certain conditions (especially with re-exports inside StarterKit itself). The fix is to stop using the StarterKit barrel on the server and instead import the individual extension packages (`@tiptap/extension-document`, `@tiptap/extension-heading`, `@tiptap/extension-paragraph`, etc.) from a brand-new server-only module.

Purpose: Restore the notifications template editor preview pane to working state for sysadmins editing notification templates without breaking the dispatcher email pipeline.

Output: New `server-extensions.ts` module + updated renderer + one new test asserting real `<h2>` HTML output.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md

@apps/web/src/lib/notifications/template-renderer.ts
@apps/web/src/lib/notifications/build-template.ts
@apps/web/src/lib/notifications/__tests__/template-renderer.test.ts
@apps/web/src/components/notifications/block-editor.tsx
@apps/web/src/components/notifications/sandboxed-preview.tsx
@apps/web/src/app/(admin)/actions/notifications.ts
@apps/web/src/lib/notifications/dispatcher.ts
@apps/web/package.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create server-only Tiptap extensions module + update template-renderer</name>
  <files>apps/web/src/lib/notifications/server-extensions.ts, apps/web/src/lib/notifications/template-renderer.ts</files>
  <action>
STEP A — Pre-flight checks (do FIRST, before writing any code):

1. Read `apps/web/src/lib/notifications/template-renderer.ts` and confirm line 11 imports `StarterKit from '@tiptap/starter-kit'` and line 63 passes `[StarterKit]` to generateHTML. Quote these lines in your reasoning output.

2. Trace transitive imports of `template-renderer.ts` one level deep with grep:
   - `grep -n "^import" apps/web/src/lib/notifications/template-renderer.ts`
   - For each imported module that is a local file (starts with `@/` or `.`), open it and grep for `'use client'` at line 1.
   - Confirm: `@/emails/dynamic-template` is the only local import — check whether it has `'use client'`.
   - Report findings in the reasoning output.

3. Check `apps/web/package.json` for these Tiptap extension packages:
   - `@tiptap/core` (already present — confirmed v3.23.4)
   - `@tiptap/extension-document`
   - `@tiptap/extension-heading`
   - `@tiptap/extension-paragraph`
   - `@tiptap/extension-text`
   - `@tiptap/extension-bold`
   - `@tiptap/extension-italic`
   - `@tiptap/extension-link`
   - `@tiptap/extension-hard-break`
   - `@tiptap/extension-bullet-list`
   - `@tiptap/extension-ordered-list`
   - `@tiptap/extension-list-item`

   Most are already pulled in transitively by `@tiptap/starter-kit`. If any are NOT directly listed in `apps/web/package.json`, they still exist in `node_modules` because starter-kit depends on them — verify via `ls apps/web/node_modules/@tiptap/extension-heading` (or `Test-Path` in PowerShell). If a needed extension package is missing entirely from node_modules, STOP and report. Do NOT install new packages without confirmation.

STEP B — Create `apps/web/src/lib/notifications/server-extensions.ts`:

This file MUST NOT contain `'use client'`. It MUST NOT import from any file with `'use client'`. It MUST NOT import React or any `.tsx` component. It only imports from individual `@tiptap/extension-*` packages.

File contents:

```typescript
/**
 * Server-only Tiptap extensions for the notification template renderer.
 *
 * Why this file exists (quick-task-333):
 * Importing `@tiptap/starter-kit` directly into the server-side renderer caused
 * a 500 with "Cannot access level on the server. You cannot dot into a temporary
 * client reference from a server component" — ProseMirror was reading the
 * Heading extension's `level` attr off a React Client Reference instead of the
 * real extension object. The StarterKit barrel export interacts badly with the
 * RSC bundler graph because the same barrel is used by the client editor
 * (`components/notifications/block-editor.tsx` — `'use client'`).
 *
 * Fix: import individual Tiptap extension packages here, never the barrel.
 * This file MUST stay free of 'use client', React component imports, and any
 * transitive client references.
 *
 * Variable placeholders `{{varName}}` are preserved as literal text — the
 * `mention` node is NOT registered here because the editor normalises mentions
 * back to plain `{{name}}` text via `mentionsToPlainText` before saving JSON.
 */

import type { Extensions } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Heading from '@tiptap/extension-heading';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Link from '@tiptap/extension-link';
import HardBreak from '@tiptap/extension-hard-break';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';

/**
 * Minimal server-safe Tiptap extensions array.
 * Matches the subset of StarterKit that buildDefaultTemplate emits (heading,
 * paragraph, text, link marks) plus common safe extensions (bold/italic/lists/
 * hardBreak) that admins might add via the client editor.
 */
export const serverExtensions: Extensions = [
  Document,
  Paragraph,
  Text,
  Heading.configure({ levels: [1, 2, 3] }),
  Bold,
  Italic,
  Link.configure({ openOnClick: false, autolink: false }),
  HardBreak,
  BulletList,
  OrderedList,
  ListItem,
];
```

Notes on the implementation:
- Use `Extensions` type from `@tiptap/core` for the array — no `any`.
- Heading is configured for levels 1–3 (matches buildDefaultTemplate's level: 2).
- Link is configured with `openOnClick: false` and `autolink: false` to keep behaviour deterministic in the email context.
- Do NOT register a `mention` node here. The editor normalises mention nodes to plain `{{name}}` text BEFORE saving (`mentionsToPlainText` in block-editor.tsx, lines 58–72), so the server only ever sees plain text. This preserves the {{variable}} contract for downstream substitution.

STEP C — Update `apps/web/src/lib/notifications/template-renderer.ts`:

Replace the StarterKit import + usage. Specifically:

1. DELETE line 11: `import StarterKit from '@tiptap/starter-kit';`
2. ADD after the `@tiptap/html/server` import: `import { serverExtensions } from './server-extensions';`
3. Change line 63 from:
   `const rawHtml = generateHTML(blockJson as Parameters<typeof generateHTML>[0], [StarterKit]);`
   to:
   `const rawHtml = generateHTML(blockJson as Parameters<typeof generateHTML>[0], serverExtensions);`
4. Update the JSDoc comment block above `renderTemplate` to say `generateHTML(blockJson, serverExtensions)` instead of `generateHTML(blockJson, [StarterKit])`.

Do NOT change any other logic — `substituteVariables`, the `render(React.createElement(...))` call, the return shape, the propagating error behaviour are all unchanged. The dispatcher continues to work because it imports the same `renderTemplate` symbol.

STEP D — Trace verification (run after writing both files):

Run grep one more time to confirm no client transitive imports remain:
- `grep -n "use client" apps/web/src/lib/notifications/template-renderer.ts apps/web/src/lib/notifications/server-extensions.ts` — must return nothing.
- `grep -n "@tiptap/starter-kit\|@tiptap/react" apps/web/src/lib/notifications/template-renderer.ts apps/web/src/lib/notifications/server-extensions.ts` — must return nothing.

Use PowerShell-compatible syntax for any file operations if needed (e.g. `Remove-Item`, not `rm -rf`).
  </action>
  <verify>
1. `cd apps/web; npx tsc --noEmit` — exits 0 with zero errors.
2. `grep -rn "@tiptap/starter-kit\|@tiptap/react" apps/web/src/lib/notifications/` — returns nothing (StarterKit is now ONLY used by the client `block-editor.tsx`, not by any file under `src/lib/notifications/`).
3. `grep -n "use client" apps/web/src/lib/notifications/server-extensions.ts apps/web/src/lib/notifications/template-renderer.ts` — returns nothing.
4. `grep -n "renderTemplate" apps/web/src/lib/notifications/dispatcher.ts apps/web/src/app/\(admin\)/actions/notifications.ts apps/web/src/app/\(owner\)/actions/tenant-notification-settings.ts` — all three still import the same `renderTemplate` symbol (single source of truth preserved).
  </verify>
  <done>
- `apps/web/src/lib/notifications/server-extensions.ts` exists and exports `serverExtensions: Extensions`.
- `template-renderer.ts` no longer imports `@tiptap/starter-kit` and uses `serverExtensions` in its `generateHTML` call.
- TypeScript compiles clean (no `any`, no errors).
- No file under `apps/web/src/lib/notifications/` has a transitive `'use client'` import path.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add real-pipeline test for serverExtensions + run full verification suite</name>
  <files>apps/web/src/lib/notifications/__tests__/template-renderer.test.ts</files>
  <action>
STEP A — Add a NEW test case to the existing `template-renderer.test.ts` file (do NOT replace existing tests). Insert it inside the existing `describe('renderTemplate — real pipeline', ...)` block, between Test 1 and Test 2 (so it becomes the new Test 2 and existing tests shift down). The new test specifically targets the quick-task-333 regression:

```typescript
  // ---------------------------------------------------------------------------
  // Test (quick-task-333): heading level=2 fixture renders <h2> via serverExtensions
  // — regression guard for "Cannot access level on the server" RSC error
  // ---------------------------------------------------------------------------
  it('renders a heading level=2 + paragraph fixture to <h2> + <p> via serverExtensions (quick-333)', async () => {
    const blockJson = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Load {{loadNumber}} assigned' }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Driver {{driverId}}, please review the new load.' },
          ],
        },
      ],
    };

    const result = await renderTemplate(
      blockJson,
      { loadNumber: 'LD-9001', driverId: 'drv-123' },
      'New load {{loadNumber}}',
    );

    // Heading level=2 must render as <h2> — this exercises the exact code path
    // that crashed in production with "Cannot access level on the server".
    expect(result.html).toMatch(/<h2[^>]*>[^<]*Load LD-9001 assigned[^<]*<\/h2>/);

    // Paragraph rendered with substituted driverId
    expect(result.html).toMatch(/<p[^>]*>[^<]*Driver drv-123[^<]*<\/p>/);

    // Subject substitution
    expect(result.subjectFinal).toBe('New load LD-9001');

    // No unsubstituted tokens remain
    expect(result.html).not.toContain('{{');

    // Regression guard: never emit JSON-stringified doc shape
    expect(result.html).not.toContain('"type":"doc"');
    expect(result.html).not.toContain('"type":"heading"');
  });
```

This test MUST NOT mock the renderer, MUST NOT mock `@tiptap/html`, and MUST NOT mock `serverExtensions`. The whole real pipeline runs end-to-end — that's the entire point.

STEP B — Run the new + existing tests:

`cd apps/web; npm test -- src/lib/notifications/__tests__/template-renderer.test.ts`

All 5 tests must pass (4 existing + 1 new). Capture the full output for the SUMMARY.

STEP C — Run full app verification (in this exact order):

1. `cd apps/web; npx tsc --noEmit` — zero errors.
2. `cd apps/web; npm run build` — exit 0. If any new build warnings about client references in `/lib/notifications/`, STOP and report.
3. From monorepo root: `cd ../..; npm run build` — exit 0 (all turbo packages build).
4. Manual smoke (skipped in CI but documented in SUMMARY): `cd apps/web; npm run dev` then open http://localhost:3000/notifications as sysadmin, click "Load Assigned to Driver", confirm preview pane renders HTML (not error). Record the result in SUMMARY as Y/N.

STEP D — Confirm dispatcher single-source-of-truth:

Grep one more time:
`grep -rn "from.*template-renderer'" apps/web/src --include='*.ts' --include='*.tsx'`

Confirm at least 4 import sites: dispatcher.ts, (admin)/actions/notifications.ts, (owner)/actions/tenant-notification-settings.ts, and the test file. All four import the same `renderTemplate` symbol — proving the dispatcher uses the now-fixed renderer (no separate code path).
  </action>
  <verify>
1. `cd apps/web; npm test -- src/lib/notifications/__tests__/template-renderer.test.ts` — all 5 tests pass, including the new quick-333 test.
2. `cd apps/web; npx tsc --noEmit` — zero errors.
3. `cd apps/web; npm run build` — succeeds, no client-reference warnings on any file in `src/lib/notifications/`.
4. Monorepo root `npm run build` — succeeds across all workspaces.
5. Dev smoke: /notifications → click "Load Assigned to Driver" → Preview pane shows HTML (bold heading, paragraph, literal `{{loadNumber}}` chips). No 500. No `[SandboxedPreview] render failed` in browser console. Server log free of "Cannot access level on the server".
  </verify>
  <done>
- New Test 2 added to template-renderer.test.ts and asserts `<h2>` + `<p>` output via real `serverExtensions`.
- All 5 tests pass without mocking the renderer or extensions.
- `npx tsc --noEmit`, `npm run build` (apps/web), and `npm run build` (monorepo root) all succeed.
- Manual smoke: preview pane renders HTML in /notifications for "Load Assigned to Driver" template; no 500; `{{variable}}` placeholders preserved verbatim.
- Dispatcher and tenant settings paths continue to use the same `renderTemplate` symbol (single source of truth confirmed by grep).
  </done>
</task>

</tasks>

<verification>
Overall checks (run after both tasks complete):

1. **TypeScript**: `cd apps/web; npx tsc --noEmit` — zero errors.
2. **Tests**: `cd apps/web; npm test -- src/lib/notifications/__tests__/template-renderer.test.ts` — 5/5 pass.
3. **Web build**: `cd apps/web; npm run build` — exit 0, no client-reference warnings under `src/lib/notifications/`.
4. **Monorepo build**: from repo root, `npm run build` — exit 0.
5. **Manual smoke** (recorded Y/N in SUMMARY):
   - Sign in as sysadmin at http://localhost:3000/notifications
   - Click "Load Assigned to Driver" template
   - Preview pane renders HTML with bold `<h2>` heading, paragraph text, and literal `{{loadNumber}}` / `{{driverId}}` chips
   - No 500. No `[SandboxedPreview] render failed` in browser console.
   - Server log free of `Cannot access level on the server`.
6. **Grep confirms no regression**:
   - `grep -rn "@tiptap/starter-kit" apps/web/src/lib/notifications/` — returns nothing.
   - `grep -rn "'use client'" apps/web/src/lib/notifications/` — returns nothing.

Commit message (conventional commits): `fix(quick-task-333): use server-only Tiptap extensions in notification template renderer`
</verification>

<success_criteria>
- [ ] `apps/web/src/lib/notifications/server-extensions.ts` exists, exports `serverExtensions: Extensions`, has no `'use client'` and no React imports.
- [ ] `template-renderer.ts` imports `serverExtensions` from `./server-extensions` and uses it in `generateHTML(...)` — no `@tiptap/starter-kit` import.
- [ ] One new test in `template-renderer.test.ts` exercises the real pipeline with a heading level=2 fixture and asserts `<h2>` + `<p>` in the output. Test passes without mocks.
- [ ] All 5 template-renderer tests pass.
- [ ] `npx tsc --noEmit` (apps/web), `npm run build` (apps/web), and `npm run build` (monorepo root) all succeed.
- [ ] Manual smoke: /notifications preview pane renders correctly for "Load Assigned to Driver"; no 500; no console error; `{{var}}` placeholders preserved.
- [ ] Dispatcher (`apps/web/src/lib/notifications/dispatcher.ts`) and tenant settings (`apps/web/src/app/(owner)/actions/tenant-notification-settings.ts`) continue to import the same `renderTemplate` symbol — verified by grep.
- [ ] Editor component (`apps/web/src/components/notifications/block-editor.tsx`) is UNTOUCHED and retains its `'use client'` directive.
- [ ] No new npm packages installed (all extension packages already exist as transitive deps of starter-kit, verified via `node_modules`).
- [ ] Reasoning output (which file, which import chain, why client-ref) recorded in the SUMMARY.
</success_criteria>

<output>
After completion, create `.planning/quick/333-fix-notifications-template-preview-serve/333-SUMMARY.md` containing:

1. The reasoning output (which file the renderer lives in, the StarterKit barrel issue, why server-extensions.ts fixes it).
2. Diff summary: files added (`server-extensions.ts`) + files modified (`template-renderer.ts`, `template-renderer.test.ts`).
3. Verification table — 5 checks Y/N.
4. Full test run output (5 tests passing).
5. Commit message: `fix(quick-task-333): use server-only Tiptap extensions in notification template renderer`

Then commit via gsd-tools and push to GitHub.
</output>

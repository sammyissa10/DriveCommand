---
phase: 335-fix-notification-preview-rsc-failure-mov
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/notifications/template-renderer.ts
  - apps/web/src/lib/notifications/dispatcher.ts
  - apps/web/src/lib/notifications/server-extensions.ts
  - apps/web/src/lib/notifications/__tests__/template-renderer.test.ts
  - apps/web/src/components/notifications/block-editor.tsx
  - apps/web/src/components/notifications/sandboxed-preview.tsx
  - apps/web/src/app/(admin)/actions/notifications.ts
  - apps/web/src/app/(owner)/actions/tenant-notification-settings.ts
  - apps/web/src/app/(admin)/notifications/templates-tab.tsx
  - apps/web/src/app/(owner)/settings/notifications/tenant-template-editor-panel.tsx
  - apps/web/next.config.ts
  - apps/web/scripts/backfill-notification-html-cache.ts
autonomous: true

must_haves:
  truths:
    - "Opening /notifications and any template no longer triggers a 500 or Client Reference error in the preview pane"
    - "Preview pane renders real HTML for the 'Load Assigned to Driver' template (h2 + paragraph + variable text)"
    - "Saving a template (sysadmin global OR tenant override) persists cachedHtml to the corresponding *HtmlCache column"
    - "Dispatcher email send path reads cachedHtml from DB and renders without invoking Tiptap on the server"
    - "No file under apps/web/src/lib/ or apps/web/src/app/ imports @tiptap/* — only the client editor component does"
    - "All 36 seeded NotificationTemplate rows have a non-null defaultHtmlCache value after backfill"
  artifacts:
    - path: "apps/web/src/lib/notifications/template-renderer.ts"
      provides: "renderTemplate(cachedHtml: string, payload, subject) — pure string ops + React Email shell wrap, no Tiptap"
      contains: "export async function renderTemplate"
    - path: "apps/web/src/lib/notifications/dispatcher.ts"
      provides: "Reads tenantSettings.customHtmlCache ?? template.defaultHtmlCache and passes to renderTemplate"
      contains: "customHtmlCache"
    - path: "apps/web/src/components/notifications/block-editor.tsx"
      provides: "Save handler that calls editor.getHTML(), post-processes mentions to {{var}}, passes cachedHtml as 3rd onSave arg"
      contains: "editor.getHTML"
    - path: "apps/web/src/components/notifications/sandboxed-preview.tsx"
      provides: "Client-only preview that substitutes variables into html prop and renders via iframe srcDoc — no Server Action call"
      contains: "srcDoc"
    - path: "apps/web/src/app/(admin)/actions/notifications.ts"
      provides: "Save action accepting cachedHtml param and writing defaultHtmlCache column"
      contains: "defaultHtmlCache"
    - path: "apps/web/src/app/(owner)/actions/tenant-notification-settings.ts"
      provides: "Tenant override save action accepting cachedHtml param and writing customHtmlCache column"
      contains: "customHtmlCache"
    - path: "apps/web/scripts/backfill-notification-html-cache.ts"
      provides: "One-shot Node script that computes Tiptap HTML for every NotificationTemplate with NULL defaultHtmlCache"
      contains: "defaultHtmlCache: null"
  key_links:
    - from: "apps/web/src/components/notifications/block-editor.tsx"
      to: "apps/web/src/app/(admin)/notifications/templates-tab.tsx"
      via: "onSave callback with (blockJson, subject, cachedHtml) signature"
      pattern: "onSave.*cachedHtml"
    - from: "apps/web/src/app/(admin)/actions/notifications.ts"
      to: "NotificationTemplate.defaultHtmlCache column"
      via: "prisma update/upsert data block"
      pattern: "defaultHtmlCache"
    - from: "apps/web/src/lib/notifications/dispatcher.ts"
      to: "apps/web/src/lib/notifications/template-renderer.ts"
      via: "import + call with cachedHtml string"
      pattern: "renderTemplate\\(\\s*cachedHtml"
    - from: "apps/web/src/components/notifications/sandboxed-preview.tsx"
      to: "iframe srcDoc"
      via: "client-side substituteVariables on html prop"
      pattern: "srcDoc=\\{"
---

<objective>
Fix the persistent notification preview 500 by moving Tiptap rendering off the server entirely. Quick-tasks 333 and 334 both kept `generateHTML` on the server side — 333 swapped the StarterKit barrel for individual extension imports, and 334 added `serverExternalPackages` entries. Neither fix works because the Next 16 RSC graph still promotes the Tiptap extension symbols to Client References: the client editor (`block-editor.tsx`, `'use client'`) imports the same extension packages, so the bundler treats them as client-bound regardless of `serverExternalPackages` (which controls server externalization for runtime, not the static client-reference flagging at build).

Architectural fix (not config): render Tiptap to HTML in the BROWSER at template save time, persist the resulting HTML string in the existing `defaultHtmlCache` / `customHtmlCache` columns (which already exist on `NotificationTemplate` and `TenantNotificationSettings`), and have the server-side renderer read those cached strings instead of regenerating them. The server-side renderer becomes pure string operations (variable substitution + React Email shell wrap) with zero Tiptap dependency. Preview becomes a pure client-side iframe `srcDoc` render of the cached HTML.

How the four pieces fit together after the refactor:
1. `editor.getHTML()` runs in the browser inside `block-editor.tsx`'s save handler, producing an HTML string where mention nodes are converted to literal `{{varName}}` text.
2. The save handler invokes `onSave(blockJson, subject, cachedHtml)`. The two editor panels (sysadmin templates-tab.tsx + tenant-template-editor-panel.tsx) forward the third arg to their respective Server Actions.
3. The Server Actions persist `cachedHtml` alongside the existing `blockJson` write — sysadmin action writes `NotificationTemplate.defaultHtmlCache`, tenant action writes `TenantNotificationSettings.customHtmlCache`.
4. At send time, `dispatcher.ts` resolves `tenantSettings?.customHtmlCache ?? template.defaultHtmlCache` and passes the string to the new `renderTemplate(cachedHtml, payload, subject)`. The renderer substitutes variables and wraps in the React Email shell — no Tiptap on the server anywhere.

Purpose: Restore the notifications template editor preview to working state in production and ensure the dispatcher's email render path no longer depends on server-side Tiptap execution.

Output: Refactored renderer + dispatcher + client editor save flow + Server Actions + preview component + dead-code cleanup (server-extensions.ts deletion + next.config.ts entries removal) + backfill for seeded templates + updated test suite.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@docs/specs/Notifications System Technical Documentation.md

@apps/web/src/lib/notifications/template-renderer.ts
@apps/web/src/lib/notifications/dispatcher.ts
@apps/web/src/lib/notifications/server-extensions.ts
@apps/web/src/lib/notifications/__tests__/template-renderer.test.ts
@apps/web/src/components/notifications/block-editor.tsx
@apps/web/src/components/notifications/sandboxed-preview.tsx
@apps/web/src/app/(admin)/actions/notifications.ts
@apps/web/src/app/(owner)/actions/tenant-notification-settings.ts
@apps/web/src/app/(admin)/notifications/templates-tab.tsx
@apps/web/src/app/(owner)/settings/notifications/tenant-template-editor-panel.tsx
@apps/web/prisma/schema.prisma
@apps/web/next.config.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Refactor server-side renderer + dispatcher + delete server-extensions; update tests</name>
  <files>apps/web/src/lib/notifications/template-renderer.ts, apps/web/src/lib/notifications/dispatcher.ts, apps/web/src/lib/notifications/server-extensions.ts (delete), apps/web/src/lib/notifications/__tests__/template-renderer.test.ts, apps/web/next.config.ts</files>
  <action>
STEP A — Reasoning + verification (do FIRST):

1. Open `docs/specs/Notifications System Technical Documentation.md` and locate two pieces of authorizing language:
   (a) the section describing the `defaultHtmlCache` / `customHtmlCache` columns and their intent (cached HTML produced at save time, read by the dispatcher)
   (b) the section describing the dispatcher's render step (resolves tenant override vs global, hands to renderer)
   Quote 2-3 sentences total into the SUMMARY's reasoning section. If the spec does not contain explicit authorization, quote the closest schema/comment justification from `apps/web/prisma/schema.prisma` on the `defaultHtmlCache` / `customHtmlCache` columns instead.

2. Quote the EXACT current lines you will modify:
   - `apps/web/src/lib/notifications/template-renderer.ts` lines 53-77 (current renderTemplate impl with generateHTML call)
   - `apps/web/src/lib/notifications/dispatcher.ts` — find the `renderTemplate(` call site (around line 134 per task brief) and quote the surrounding 8-10 lines (blockJson resolution + call)

3. Confirm the cache columns exist by grepping `apps/web/prisma/schema.prisma`:
   - `defaultHtmlCache` must appear on the `NotificationTemplate` model
   - `customHtmlCache` must appear on the `TenantNotificationSettings` model
   If either is missing, STOP and report — Task 1 cannot proceed without the columns.

STEP B — Rewrite `apps/web/src/lib/notifications/template-renderer.ts`:

Replace the ENTIRE file content with:

```typescript
/**
 * Template rendering pipeline for the notification dispatcher.
 *
 * Flow: cached HTML string -> variable substitution -> DynamicTemplateEmail shell -> string
 *
 * Tiptap is NOT invoked on the server. The cached HTML is produced at template
 * save time in the browser (block-editor.tsx -> editor.getHTML()) and persisted
 * to NotificationTemplate.defaultHtmlCache / TenantNotificationSettings.customHtmlCache.
 *
 * This decouples the server render path from React Server Component bundling
 * concerns — the Next 16 RSC graph was promoting Tiptap extension symbols to
 * Client References because the client editor imports the same packages.
 * Quick-task-335 moved rendering off the server entirely.
 */

import { render } from '@react-email/render';
import React from 'react';
import DynamicTemplateEmail from '@/emails/dynamic-template';

/**
 * Pure variable substitution.
 *
 * Replaces every `{{varName}}` token in `text` with the corresponding value
 * from `payload`. Tokens with no matching key are replaced with empty string
 * and a console.warn is emitted.
 *
 * Never throws — always returns a string.
 */
export function substituteVariables(
  text: string,
  payload: Record<string, string>,
): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, name) => {
    if (Object.prototype.hasOwnProperty.call(payload, name)) {
      return payload[name];
    }
    console.warn(`[notifications] missing variable: ${name}`);
    return '';
  });
}

/**
 * Full template render: cached HTML + payload variables -> final HTML string + subject.
 *
 * Steps:
 *   1. substituteVariables(cachedHtml, payload) — replace {{tokens}} in body HTML
 *   2. substituteVariables(subject, payload) — replace {{tokens}} in subject
 *   3. render(<DynamicTemplateEmail bodyHtml={...} />) — wrap in React Email shell
 *
 * Returns { html, subjectFinal }.
 */
export async function renderTemplate(
  cachedHtml: string,
  payload: Record<string, string>,
  subject: string,
): Promise<{ html: string; subjectFinal: string }> {
  const bodyHtml = substituteVariables(cachedHtml, payload);
  const subjectFinal = substituteVariables(subject, payload);
  const html = await render(
    React.createElement(DynamicTemplateEmail, { bodyHtml }),
  );
  return { html, subjectFinal };
}
```

Note: keep `substituteVariables` byte-identical to the current implementation. The only semantic change is `renderTemplate`'s first parameter shifting from `blockJson: unknown` to `cachedHtml: string`, and the removal of the `generateHTML` call.

STEP C — Update `apps/web/src/lib/notifications/dispatcher.ts`:

Find the renderTemplate call site (around line 134 — search for `renderTemplate(` if line numbers drift). The current code resolves `blockJson` and `subjectTemplate`, then calls renderTemplate. Replace that block with the spec from the task brief:

OLD (delete):
```
const blockJson = tenantSettings?.customBlockJson ?? template.defaultBlockJson;
const subjectTemplate = (tenantSettings?.customSubject ?? template.defaultSubject) as string;

const { html, subjectFinal } = await renderTemplate(
  blockJson,
  options.payload as Record<string, string>,
  subjectTemplate,
);
```

NEW (insert):
```
const cachedHtml = tenantSettings?.customHtmlCache ?? template.defaultHtmlCache;
const subjectTemplate = (tenantSettings?.customSubject ?? template.defaultSubject) as string;

if (!cachedHtml) {
  audits.push({
    tenantId: options.tenantId,
    triggerKey,
    channel: 'EMAIL',
    status: 'FAILED',
    idempotencyKey: `no-cached-html:${triggerKey}:${Date.now()}`,
    relatedEntityType: options.relatedEntity?.type ?? null,
    relatedEntityId: options.relatedEntity?.id ?? null,
    errorMessage: 'No cached HTML available for trigger — seed migration missing or save flow not run',
  });
  failed++;
  return { sent, skipped, failed };
}

const { html, subjectFinal } = await renderTemplate(
  cachedHtml,
  options.payload as Record<string, string>,
  subjectTemplate,
);
```

CRITICAL: do not change anything else in dispatcher.ts. The audit-row push pattern above MUST mirror the existing audit shape used elsewhere in the file — if the surrounding code uses different field names or a different push pattern, conform to that pattern instead of the snippet above. Recipient resolution, idempotency, fan-out logic, top-level try/catch, and return shape stay exactly as they are. The `audits` variable name, the `failed++` counter, and the `return { sent, skipped, failed }` shape MUST match whatever the function currently uses — adapt to the real variable names if they differ.

STEP D — DELETE `apps/web/src/lib/notifications/server-extensions.ts`:

Use PowerShell: `Remove-Item apps/web/src/lib/notifications/server-extensions.ts`

Before deleting, confirm no remaining importers:
`Get-ChildItem -Recurse -Path apps/web/src -Include *.ts,*.tsx | Select-String -Pattern "server-extensions"` — must return zero matches (after the renderer rewrite removed its import).

STEP E — Clean `apps/web/next.config.ts`:

The current `serverExternalPackages` array contains 12 @tiptap/* + 3 prosemirror-* entries (added in quick-task-334 for a fix that did not work). Remove ALL of these entries because nothing on the server imports Tiptap or ProseMirror anymore. Read the current file first — if Tiptap/ProseMirror are the ONLY entries, delete the entire `serverExternalPackages: [...]` property. If any other entries remain (none currently expected), keep the key with the remaining entries only.

Current file has exactly these 15 entries — remove all 15:
- `@tiptap/core`, `@tiptap/extension-bold`, `@tiptap/extension-bullet-list`, `@tiptap/extension-document`, `@tiptap/extension-hard-break`, `@tiptap/extension-heading`, `@tiptap/extension-italic`, `@tiptap/extension-link`, `@tiptap/extension-list-item`, `@tiptap/extension-ordered-list`, `@tiptap/extension-paragraph`, `@tiptap/extension-text`, `@tiptap/html`, `prosemirror-model`, `prosemirror-state`, `prosemirror-transform`

Remove the entire `serverExternalPackages: [...],` property block since these are the only entries.

STEP F — Rewrite `apps/web/src/lib/notifications/__tests__/template-renderer.test.ts`:

The existing tests pass Tiptap blockJson to `renderTemplate` — that signature no longer exists. Rewrite the file to test the new signature:

Required test cases (keep substituteVariables tests as-is; replace renderTemplate tests):

1. `substituteVariables` tests — KEEP existing test cases verbatim (they still apply).
2. NEW renderTemplate test 1 (basic): passes literal HTML `<h2>Test heading</h2><p>Hello {{name}}</p>` and payload `{ name: 'World' }` + subject `'Hi {{name}}'`. Asserts:
   - `result.html` contains `Hello World`
   - `result.html` contains `Test heading`
   - `result.subjectFinal === 'Hi World'`
   - `result.html` includes some known marker from DynamicTemplateEmail (e.g. an `<html>` or React Email body wrapper). Read `apps/web/src/emails/dynamic-template.tsx` first to identify a stable assertion target.
3. NEW renderTemplate test 2 (missing variable): passes HTML with `{{missing}}` and empty payload. Asserts the token is replaced with empty string (no `{{` remains).
4. NEW renderTemplate test 3 (subject-only var): empty body, subject `'Load {{loadNumber}}'`, payload `{ loadNumber: 'LD-9001' }`. Asserts `subjectFinal === 'Load LD-9001'`.

DELETE any test that imports `server-extensions` (file is gone). DELETE the quick-task-333 regression test (it asserted Tiptap blockJson rendering through the server — irrelevant now; the new architecture means the server cannot render Tiptap at all). Add a one-line comment at the top of the file: `// quick-task-335: renderTemplate now consumes cached HTML strings; Tiptap runs in browser at save time.`

STEP G — Verification commands (run from `apps/web`):

1. `npx tsc --noEmit` — zero errors. If renderTemplate's old caller signature is referenced anywhere besides dispatcher.ts, TypeScript will catch it now.
2. `npx vitest run src/lib/notifications/__tests__/template-renderer.test.ts` — all tests pass.
3. `Get-ChildItem -Recurse -Path src -Include *.ts,*.tsx | Select-String -Pattern "from ['""]@tiptap"` — must show ONLY `src/components/notifications/block-editor.tsx`. Any other match means a missed import.
4. `Get-ChildItem -Recurse -Path src -Include *.ts,*.tsx | Select-String -Pattern "server-extensions"` — must return zero matches.
5. `Select-String -Path next.config.ts -Pattern "@tiptap|prosemirror"` — must return zero matches.
  </action>
  <verify>
1. `cd apps/web; npx tsc --noEmit` exits 0.
2. `cd apps/web; npx vitest run src/lib/notifications/__tests__/template-renderer.test.ts` — all tests pass, no test imports `server-extensions` or calls `generateHTML`.
3. `cd apps/web; Get-ChildItem -Recurse -Path src -Include *.ts,*.tsx | Select-String -Pattern "from ['""]@tiptap"` returns ONLY the block-editor.tsx file.
4. `cd apps/web; Test-Path src/lib/notifications/server-extensions.ts` returns `False`.
5. `cd apps/web; Select-String -Path next.config.ts -Pattern "@tiptap|prosemirror"` returns nothing.
6. `cd apps/web; Select-String -Path src/lib/notifications/dispatcher.ts -Pattern "customHtmlCache"` returns at least one match (the new resolution line).
7. `cd apps/web; Select-String -Path src/lib/notifications/template-renderer.ts -Pattern "generateHTML|@tiptap"` returns nothing.
  </verify>
  <done>
- `template-renderer.ts` no longer imports anything from `@tiptap/*` or `./server-extensions`; the `renderTemplate` signature is `(cachedHtml: string, payload, subject)`.
- `dispatcher.ts` resolves `tenantSettings?.customHtmlCache ?? template.defaultHtmlCache` and passes the string to renderTemplate; emits a FAILED audit row when cache is null.
- `server-extensions.ts` is deleted from the filesystem; no remaining importers.
- `next.config.ts` no longer contains any @tiptap/* or prosemirror-* entries in `serverExternalPackages`; the property is removed entirely since those were the only entries.
- Test file is rewritten for the new signature; substituteVariables tests retained; tests pass; no test references generateHTML or server-extensions.
- `tsc --noEmit` passes from `apps/web`.
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire client editor save flow + Server Actions + caller panels to persist cachedHtml; rewrite sandboxed preview</name>
  <files>apps/web/src/components/notifications/block-editor.tsx, apps/web/src/components/notifications/sandboxed-preview.tsx, apps/web/src/app/(admin)/actions/notifications.ts, apps/web/src/app/(owner)/actions/tenant-notification-settings.ts, apps/web/src/app/(admin)/notifications/templates-tab.tsx, apps/web/src/app/(owner)/settings/notifications/tenant-template-editor-panel.tsx</files>
  <action>
STEP A — Reasoning (do FIRST):

1. Open `apps/web/src/components/notifications/block-editor.tsx`. Locate:
   - The `useEditor(...)` initialization
   - The `mentionsToPlainText` walker function (task brief says lines 58-72)
   - The save handler that currently calls `onSave(blockJson, subject)` and the `onSave` prop type
   Quote the save handler block and the onSave prop type into the SUMMARY.

2. Open `apps/web/src/components/notifications/sandboxed-preview.tsx`. Identify:
   - The current Server Action import and call site (the failing call)
   - The component's current prop signature
   - Whether it accepts an `availableVariables` list with `sampleValue` per variable
   Quote the call site of the failing Server Action.

3. Grep for the failing Server Action's exported name (likely `renderNotificationTemplatePreview` or similar):
   `Get-ChildItem -Recurse -Path apps/web/src -Include *.ts,*.tsx | Select-String -Pattern "renderNotificationTemplatePreview"`
   Identify all callers — the only caller should be sandboxed-preview.tsx. Note the file that EXPORTS the action so it can be deleted in step F.

4. Open the two save-action files and quote the function signatures + the prisma update/upsert call sites:
   - `apps/web/src/app/(admin)/actions/notifications.ts` — the action that writes `defaultBlockJson`
   - `apps/web/src/app/(owner)/actions/tenant-notification-settings.ts` — the action that writes `customBlockJson`

5. Open the two caller panels and locate where they construct the `onSave` callback passed to BlockEditor:
   - `apps/web/src/app/(admin)/notifications/templates-tab.tsx`
   - `apps/web/src/app/(owner)/settings/notifications/tenant-template-editor-panel.tsx`

STEP B — Extend `block-editor.tsx` save handler:

This file is `'use client'` — confirm before editing. The editor instance exposes `editor.getHTML()` which serializes blockJson to an HTML string using Tiptap's own renderer (runs in the browser, never on the server).

Changes:

1. Change the `onSave` prop type signature from `(blockJson: unknown, subject: string) => Promise<void> | void` to:
   ```typescript
   onSave: (blockJson: unknown, subject: string, cachedHtml: string) => Promise<void> | void;
   ```

2. In the save handler, restructure the order so that mentions are normalized to text BEFORE HTML extraction:

   a. Call the existing `mentionsToPlainText` walker on the editor's JSON FIRST to produce normalized JSON.
   b. Load the normalized JSON back into the editor with `editor.commands.setContent(normalizedJson, false)` so subsequent `editor.getHTML()` reflects the {{var}} text. The `false` second arg suppresses re-emitting an update event.
   c. Call `const cachedHtml = editor?.getHTML() ?? '';` — this returns an HTML string where mentions are now literal `{{varName}}` text.
   d. Call `await onSave(blockJson, subject, cachedHtml)` (where `blockJson` is the normalized JSON).

   ALTERNATIVE (if `setContent + getHTML` round-trip breaks editor focus or causes flicker): do not mutate the editor. Instead, after getHTML() returns, post-process the HTML string with a regex that converts the Mention extension's rendered span back to literal `{{varName}}`. To do this correctly:
   - Find the renderHTML config on the Mention extension in `block-editor.tsx` (search for `Mention.configure` or the inline `addOptions` / `renderHTML` definition). The renderHTML produces a span like `<span class="mention" data-id="varName">@varName</span>` or similar — quote the exact shape into the SUMMARY.
   - Build a regex matching that exact shape (e.g. `/<span[^>]*class="[^"]*mention[^"]*"[^>]*data-id="([^"]+)"[^>]*>[^<]*<\/span>/g`) and replace with `{{$1}}`.
   - Apply the regex to the getHTML() output before assigning to cachedHtml.

   Pick whichever approach is simpler given the actual Mention render shape. Document which one was used in the SUMMARY.

3. Confirm the produced cachedHtml string contains literal `{{varName}}` text (not mention spans) — add a brief inline comment explaining the choice and pointing to the dispatcher's substituteVariables call site.

4. Do NOT modify the editor's runtime behavior, the toolbar, the StarterKit + Mention extension config, or any other client-side logic. Only the save handler changes.

STEP C — Rewrite `sandboxed-preview.tsx`:

This component currently calls a Server Action that fails. Replace its behavior entirely with client-side rendering:

1. Add a new prop: `html: string` (the post-mention-to-text cached HTML from the editor).
2. Keep (or add) the `availableVariables` prop — a list of `{ name: string; sampleValue: string }` items.
3. In a `useMemo` or `useEffect`, build a sample payload `Record<string, string>` from `availableVariables` (mapping each `name` to its `sampleValue`).
4. Implement a small inline `substituteVariables(text, payload)` helper IN THIS CLIENT FILE that mirrors the server one (token regex + replacement). Do NOT import the renderer module from the lib — that's server code. Inline 6 lines:
   ```typescript
   function substituteVariables(text: string, payload: Record<string, string>): string {
     return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, name) =>
       Object.prototype.hasOwnProperty.call(payload, name) ? payload[name] : '',
     );
   }
   ```
5. Compute `const substituted = substituteVariables(html, samplePayload);`.
6. Render `<iframe srcDoc={substituted} ... />` with the existing iframe sizing/sandbox attributes preserved.
7. DELETE the Server Action import (the failing one) and remove the loading/error state that was tied to the action call. The preview is now synchronous — no async, no error state, no loading spinner.

If the existing component currently does any HTML wrapping (e.g. inlines a `<style>` block or full HTML document for the iframe), preserve that wrapping in the new synchronous path.

STEP D — Extend admin Server Action `apps/web/src/app/(admin)/actions/notifications.ts`:

1. Find the save action that writes `defaultBlockJson` to NotificationTemplate (search for `defaultBlockJson:` in the file).
2. Add a `cachedHtml: string` parameter as the LAST parameter of the action's signature. Update the input zod schema (if any) to include `cachedHtml: z.string()`.
3. In the prisma update/upsert call's `data` block, add `defaultHtmlCache: cachedHtml` alongside the existing `defaultBlockJson` write.
4. Do NOT change any RBAC checks, auth guards, tenant-scoping, revalidatePath calls, or error handling. Only the new param + new persisted field.

STEP E — Extend owner Server Action `apps/web/src/app/(owner)/actions/tenant-notification-settings.ts`:

1. Find the save action that writes `customBlockJson` to TenantNotificationSettings.
2. Add a `cachedHtml: string` parameter as the LAST parameter. Update zod schema if present.
3. In the prisma update/upsert `data` block, add `customHtmlCache: cachedHtml` alongside `customBlockJson`.
4. Preserve all existing logic.

STEP F — Update caller panels to forward cachedHtml:

1. `apps/web/src/app/(admin)/notifications/templates-tab.tsx`:
   - Find the onSave callback passed to `<BlockEditor onSave={...}` (currently 2-arg `(blockJson, subject) => ...`).
   - Update to `async (blockJson, subject, cachedHtml) => { await saveTemplate(..., cachedHtml); }` — pass cachedHtml as the new last arg to whichever save action it calls.

2. `apps/web/src/app/(owner)/settings/notifications/tenant-template-editor-panel.tsx`:
   - Same change: update the onSave callback to 3-arg and forward cachedHtml to the tenant settings action.

3. If the BlockEditor is consumed from any other location, update those callers too. Grep first:
   `Get-ChildItem -Recurse -Path apps/web/src -Include *.tsx | Select-String -Pattern "BlockEditor"` — confirm only the two panels are callers (plus the editor's own definition file).

STEP G — Delete the dead Server Action:

If a Server Action file/export exists solely to power the failing preview call (identified in step A.3), delete its export. If the function is the only export in its file, delete the entire file. If it shares a file with other live exports, delete only the function and its imports. Run grep again after deletion to confirm zero callers.

STEP H — Seed handling for defaultHtmlCache:

1. Verify current state with a one-line query against the Supabase database (via Supabase MCP `execute_sql`):
   `SELECT count(*)::int AS missing FROM "NotificationTemplate" WHERE "defaultHtmlCache" IS NULL;`
   If `missing > 0`, the seeded global templates need backfill.

2. Create `apps/web/scripts/backfill-notification-html-cache.ts` (this file runs via `tsx`, NOT via Next.js, so it bypasses RSC bundling and can freely import Tiptap server packages):

   ```typescript
   /**
    * One-shot backfill: compute Tiptap HTML for every NotificationTemplate row
    * with NULL defaultHtmlCache.
    *
    * Runs in Node via tsx — bypasses Next.js RSC bundling entirely, so it can
    * import @tiptap/html and the extension packages without triggering the
    * Client Reference promotion that caused the production preview failure.
    *
    * Usage: from apps/web run:
    *   npx tsx --env-file=.env.local scripts/backfill-notification-html-cache.ts
    */
   import { PrismaClient } from '@prisma/client';
   import { generateHTML } from '@tiptap/html/server';
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

   const extensions = [
     Document, Paragraph, Text,
     Heading.configure({ levels: [1, 2, 3] }),
     Bold, Italic,
     Link.configure({ openOnClick: false, autolink: false }),
     HardBreak, BulletList, OrderedList, ListItem,
   ];

   async function main() {
     const prisma = new PrismaClient();
     const rows = await prisma.notificationTemplate.findMany({
       where: { defaultHtmlCache: null },
       select: { id: true, triggerKey: true, defaultBlockJson: true },
     });
     console.log(`[backfill] found ${rows.length} NotificationTemplate rows with NULL defaultHtmlCache`);
     for (const row of rows) {
       try {
         const html = generateHTML(row.defaultBlockJson as Parameters<typeof generateHTML>[0], extensions);
         await prisma.notificationTemplate.update({
           where: { id: row.id },
           data: { defaultHtmlCache: html },
         });
         console.log(`[backfill] ${row.triggerKey} -> ${html.length} chars cached`);
       } catch (err) {
         console.error(`[backfill] FAILED ${row.triggerKey}:`, err);
       }
     }
     await prisma.$disconnect();
     console.log('[backfill] done');
   }

   main().catch((err) => { console.error(err); process.exit(1); });
   ```

3. Run the backfill once from `apps/web`:
   `npx tsx --env-file=.env.local scripts/backfill-notification-html-cache.ts`
   Capture the stdout count (must show all 36 rows processed). If the script errors on any row, capture the row's triggerKey + error and report — do not silently skip.

4. Confirm post-state with Supabase MCP:
   `SELECT count(*)::int AS missing FROM "NotificationTemplate" WHERE "defaultHtmlCache" IS NULL;` — must return `0`.

STEP I — Full verification (run from `apps/web`):

1. `npx tsc --noEmit` — zero errors.
2. `npm run build` — exit 0; no client-reference warnings under `src/lib/notifications/` or `src/components/notifications/`.
3. From monorepo root: `npm run build` — exit 0 across all workspaces.
4. `npx vitest run src/lib/notifications/__tests__/` — all tests pass.
5. PRODUCTION repro gate: `npm run build && npm run start`. Open http://localhost:3000, sign in as `system@drivecommand.app`, navigate to `/notifications`. Click "Load Assigned to Driver". The Preview pane MUST render HTML (h2 heading visible, paragraph text visible, variable values substituted with sample values). NO "Preview render failed" message. NO 500. Server log free of Client Reference / Tiptap stack traces. If this gate fails, DO NOT COMMIT — diagnose and fix first.
6. Same flow for one tenant-override template via the owner portal at `/settings/notifications` — pick any template, edit, save, then trigger a preview — confirm renders.
7. Final grep: `Get-ChildItem -Recurse -Path src -Include *.ts,*.tsx | Select-String -Pattern "from ['""]@tiptap"` — returns ONLY `src/components/notifications/block-editor.tsx`.
8. DB check: `SELECT "triggerKey", "defaultHtmlCache" IS NULL AS missing FROM "NotificationTemplate";` — all 36 rows show `missing = false`.
  </action>
  <verify>
1. `cd apps/web; npx tsc --noEmit` exits 0.
2. `cd apps/web; npm run build` succeeds with no client-reference warnings on notification files.
3. `cd <repo root>; npm run build` succeeds across all turbo packages.
4. `cd apps/web; npx vitest run src/lib/notifications/__tests__/` — all tests pass.
5. PROD repro gate: `npm run build && npm run start`; open /notifications as sysadmin; click "Load Assigned to Driver"; preview pane renders HTML (h2 + paragraph + substituted vars); no 500; no Client Reference error in server log.
6. Same gate for tenant override flow at /settings/notifications.
7. `cd apps/web; Get-ChildItem -Recurse -Path src -Include *.ts,*.tsx | Select-String -Pattern "from ['""]@tiptap"` returns ONLY block-editor.tsx.
8. DB query confirms zero NotificationTemplate rows with NULL defaultHtmlCache (all 36 backfilled).
9. Save a template via sysadmin editor; query `SELECT "defaultHtmlCache" FROM "NotificationTemplate" WHERE "triggerKey" = '<edited>';` — confirm column now contains a non-empty HTML string matching what the editor produced.
10. Save a tenant override via owner editor; query `SELECT "customHtmlCache" FROM "TenantNotificationSettings" WHERE ...;` — confirm column populated.
  </verify>
  <done>
- block-editor.tsx save handler invokes editor.getHTML() (or post-processed mention-to-text variant), passes 3-arg onSave with cachedHtml.
- sandboxed-preview.tsx no longer imports/calls any Server Action; renders synchronously via iframe srcDoc with client-side substituteVariables.
- (admin)/actions/notifications.ts accepts cachedHtml param and writes defaultHtmlCache on save.
- (owner)/actions/tenant-notification-settings.ts accepts cachedHtml param and writes customHtmlCache on save.
- templates-tab.tsx and tenant-template-editor-panel.tsx forward cachedHtml from BlockEditor through to their respective save actions.
- Dead preview Server Action deleted; zero callers remain.
- scripts/backfill-notification-html-cache.ts created and executed once; all 36 NotificationTemplate rows have non-null defaultHtmlCache.
- All 8 verify checks pass, including the production repro gate at /notifications.
- Only `block-editor.tsx` imports `@tiptap/*` anywhere under apps/web/src.
  </done>
</task>

</tasks>

<verification>
Overall checks (run after both tasks complete, all must be Y before commit):

1. **TypeScript**: `cd apps/web; npx tsc --noEmit` — zero errors.
2. **Web build**: `cd apps/web; npm run build` — exit 0, no client-reference warnings under notifications code.
3. **Monorepo build**: from repo root, `npm run build` — exit 0.
4. **Tests**: `cd apps/web; npx vitest run src/lib/notifications/__tests__/` — all pass; no test references Tiptap or server-extensions.
5. **PRODUCTION repro gate** (the previous fixes failed here — this is the real test):
   - `cd apps/web; npm run build && npm run start`
   - Open http://localhost:3000, sign in as `system@drivecommand.app`
   - Navigate to `/notifications`
   - Click "Load Assigned to Driver"
   - Preview pane renders HTML (h2 heading, paragraph text, variables substituted with samples)
   - No "Preview render failed" message; no 500 in network tab; no Client Reference / Tiptap stack trace in server log
6. **Tenant override gate**: same flow via owner portal at `/settings/notifications` — edit a template, save, preview renders.
7. **Server has no Tiptap**: `cd apps/web; Get-ChildItem -Recurse -Path src -Include *.ts,*.tsx | Select-String -Pattern "from ['""]@tiptap"` — returns ONLY `src/components/notifications/block-editor.tsx`.
8. **Dead code removed**: `Test-Path apps/web/src/lib/notifications/server-extensions.ts` returns False; `Select-String -Path apps/web/next.config.ts -Pattern "@tiptap|prosemirror"` returns nothing.
9. **All 36 seeded templates cached**: SQL `SELECT count(*)::int FROM "NotificationTemplate" WHERE "defaultHtmlCache" IS NULL` returns 0.
10. **Save persists cache**: edit + save any template via sysadmin editor; SQL query confirms defaultHtmlCache column updated with the new HTML.

Commit message: `fix(quick-task-335): move tiptap rendering to browser at save time; server reads cached html`
</verification>

<success_criteria>
- [ ] `template-renderer.ts` signature is `renderTemplate(cachedHtml: string, payload, subject)`; no Tiptap imports.
- [ ] `dispatcher.ts` resolves `customHtmlCache ?? defaultHtmlCache`, emits FAILED audit on null cache, passes string to renderer.
- [ ] `server-extensions.ts` deleted; `next.config.ts` no longer has @tiptap/* or prosemirror-* entries.
- [ ] `block-editor.tsx` save handler computes cachedHtml via editor.getHTML() (with mention-to-text normalization) and passes 3-arg onSave.
- [ ] `sandboxed-preview.tsx` renders via iframe srcDoc with client-side substituteVariables; zero Server Action calls.
- [ ] Both Server Actions accept cachedHtml param and persist to corresponding *HtmlCache column.
- [ ] Both editor panels forward cachedHtml from BlockEditor to their save actions.
- [ ] Dead preview Server Action export deleted; zero callers remain.
- [ ] Backfill script created at `apps/web/scripts/backfill-notification-html-cache.ts` and executed; all 36 NotificationTemplate rows have non-null defaultHtmlCache.
- [ ] Tests rewritten for new signature; substituteVariables tests retained; all pass.
- [ ] `tsc --noEmit` (apps/web), `npm run build` (apps/web), and `npm run build` (monorepo root) all succeed.
- [ ] PRODUCTION repro gate passes: `/notifications` preview pane renders HTML for "Load Assigned to Driver" with no errors.
- [ ] Tenant override flow also renders correctly.
- [ ] Only `block-editor.tsx` imports `@tiptap/*` anywhere under apps/web/src.
- [ ] Reasoning output (spec quote + before/after code quotes + which mention-normalization approach was used) recorded in SUMMARY.
</success_criteria>

<output>
After completion, create `.planning/quick/335-fix-notification-preview-rsc-failure-mov/335-SUMMARY.md` containing:

1. Reasoning output:
   - Quote from `docs/specs/Notifications System Technical Documentation.md` (or schema comments) authorizing the cached-HTML architecture
   - Before/after of `renderTemplate` signature
   - Before/after of dispatcher's call site
   - Which mention-normalization approach was used in block-editor.tsx (setContent round-trip vs regex post-process) and why
2. Diff summary:
   - Files modified (count + list)
   - Files deleted (`server-extensions.ts` + any dead preview Server Action file)
   - Files added (`scripts/backfill-notification-html-cache.ts`)
   - `next.config.ts` cleanup (15 entries removed)
3. Verification table — all 10 overall checks marked Y/N with brief evidence (build output excerpt, SQL count, smoke screenshot description).
4. Backfill output: row count + per-template `triggerKey -> char count` summary.
5. Production smoke evidence: confirmation that `/notifications` preview rendered for "Load Assigned to Driver" with no errors; confirmation that tenant override flow worked.
6. Commit message: `fix(quick-task-335): move tiptap rendering to browser at save time; server reads cached html`

Then commit via gsd-tools and push to GitHub.
</output>

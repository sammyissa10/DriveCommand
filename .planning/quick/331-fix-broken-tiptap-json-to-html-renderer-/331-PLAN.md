---
phase: quick-331
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/notifications/template-renderer.ts
  - apps/web/src/lib/notifications/__tests__/template-renderer.test.ts
  - apps/web/src/lib/notifications/__tests__/dispatcher.test.ts
autonomous: true

must_haves:
  truths:
    - "Opening any template editor at /admin/notifications shows rendered HTML in the Preview pane — never raw JSON, never JSON-stringified body, never an error message"
    - "renderTemplate() invokes Tiptap's Node-runtime generateHTML (from @tiptap/html/server) so window is never required at runtime"
    - "The single renderTemplate() function in template-renderer.ts is the only path that converts Tiptap blockJson to HTML — used by both renderNotificationTemplatePreview (preview pane) and dispatchNotification (send pipeline) — verified by grep"
    - "The fallback path in renderTemplate (the one that emits JSON.stringify(blockJson) inside a <p>) is removed; if generateHTML fails the renderer throws so failures are visible instead of silently shipping JSON to recipients"
    - "Variable substitution still runs AFTER Tiptap JSON->HTML conversion so {{vars}} in paragraphs and link href attrs (built by buildDefaultTemplate) are replaced in the final HTML"
    - "A new real-pipeline Vitest covers renderTemplate end-to-end with the actual @tiptap/html/server import, the exact seed-shape blockJson produced by buildDefaultTemplate (heading + paragraph + link CTA + footer), and asserts the output contains expected <h2>/<p>/<a> HTML tags AND substituted variable values"
    - "The dispatcher.test.ts mock for ../template-renderer is removed OR rewritten to call the real renderTemplate so the bug that shipped (mock returned hardcoded HTML, never exercised generateHTML) cannot recur"
    - "npx tsc --noEmit passes in apps/web"
    - "npm run build passes in apps/web"
    - "All 17 isolation tests still pass (group-a, group-b, group-c, driver-pay-tenant-isolation, audit-log-isolation, etc.)"
    - "All 5 dropdown regression tests still pass (apps/web/tests/isolation/dropdowns.test.ts)"
    - "npm run audit:raw-prisma exits 0"
  artifacts:
    - path: "apps/web/src/lib/notifications/template-renderer.ts"
      provides: "Tiptap JSON -> HTML renderer using @tiptap/html/server (Node-runtime), with the same {html, subjectFinal} return contract"
      exports: ["renderTemplate", "substituteVariables"]
      contains: "@tiptap/html/server"
    - path: "apps/web/src/lib/notifications/__tests__/template-renderer.test.ts"
      provides: "Real-pipeline Vitest covering generateHTML with seed-shape blockJson, variable substitution in body + subject + link hrefs, and a heading/paragraph/link assertion"
      contains: "renderTemplate"
    - path: "apps/web/src/lib/notifications/__tests__/dispatcher.test.ts"
      provides: "Dispatcher unit tests with the template-renderer mock either removed or routed through the real renderer (no more hardcoded HTML mock)"
      contains: "renderTemplate"
  key_links:
    - from: "apps/web/src/lib/notifications/template-renderer.ts"
      to: "@tiptap/html/server"
      via: "import { generateHTML } from '@tiptap/html/server'"
      pattern: "from '@tiptap/html/server'"
    - from: "apps/web/src/components/notifications/sandboxed-preview.tsx"
      to: "apps/web/src/lib/notifications/template-renderer.ts"
      via: "renderNotificationTemplatePreview -> renderTemplate (single source of truth)"
      pattern: "renderTemplate\\("
    - from: "apps/web/src/lib/notifications/dispatcher.ts"
      to: "apps/web/src/lib/notifications/template-renderer.ts"
      via: "renderTemplate(blockJson, payload, subjectTemplate) inside the dispatch flow"
      pattern: "renderTemplate\\("
---

<objective>
Fix the broken Tiptap-JSON-to-HTML renderer so the Notifications System preview pane and email send pipeline both produce real rendered HTML instead of raw Tiptap JSON.

Purpose: Plan 02 of Phase 41 shipped a template renderer that silently falls back to `<p>${JSON.stringify(blockJson)}</p>` whenever `@tiptap/html`'s `generateHTML` throws. In a Next.js / Node runtime, `@tiptap/html`'s default entry resolves to the **browser** bundle (`dist/index.js`), which throws "generateHTML can only be used in a browser environment" because `window` is undefined. The renderer swallows the error and ships JSON-stringified blockJson to email recipients and to the preview iframe. The Plan 02 tests passed because they mocked `../template-renderer` to return hardcoded HTML, so the bug was never exercised.

Root cause (one sentence): `apps/web/src/lib/notifications/template-renderer.ts:10` imports `generateHTML` from `@tiptap/html` whose `exports` map only chooses the Node entry when the resolver honors the `node` condition — Next.js / webpack does not, so the browser bundle is loaded server-side and `generateHTML` throws on `typeof window === 'undefined'`, triggering the fallback at lines 74-78 that emits `<p>${escapeHtml(JSON.stringify(blockJson))}</p>` — exactly the user-visible payload in the bug report.

Output:
- `template-renderer.ts` switched to the explicit Node entry `@tiptap/html/server` (peer dep `happy-dom@^20.9.0` is already installed at the monorepo root).
- The silent JSON-stringify fallback is removed; the renderer now throws (caught by the dispatcher's existing outer try/catch and surfaced as a FAILED audit row).
- The dispatcher test's mock of `template-renderer` is removed (or routed through the real renderer) so the same class of bug cannot ship undetected again.
- A new real-pipeline Vitest covering renderTemplate end-to-end, including the exact seed shape from `buildDefaultTemplate` (heading + paragraph + link CTA + footer with `{{vars}}`).
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
@apps/web/src/lib/notifications/build-template.ts
@apps/web/src/lib/notifications/__tests__/dispatcher.test.ts
@apps/web/src/app/(admin)/actions/notifications.ts
@apps/web/src/components/notifications/sandboxed-preview.tsx
@apps/web/src/emails/dynamic-template.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix renderer — use @tiptap/html/server, remove silent fallback</name>
  <files>
    apps/web/src/lib/notifications/template-renderer.ts
  </files>
  <action>
    Edit `apps/web/src/lib/notifications/template-renderer.ts`.

    1. Replace the import on line 10:
       ```ts
       import { generateHTML } from '@tiptap/html';
       ```
       with the explicit Node-runtime entry:
       ```ts
       import { generateHTML } from '@tiptap/html/server';
       ```
       Reason: the default `@tiptap/html` entry resolves to the browser bundle under Next.js / webpack (which does NOT honor the `node` condition in the package's `exports` map). The browser bundle throws `"generateHTML can only be used in a browser environment"` whenever `typeof window === 'undefined'`, which is always true in server actions, dispatcher code, and Vitest's `environment: 'node'` test runner. The `/server` subpath uses `happy-dom` and works in Node. `happy-dom@20.9.0` is already installed at the monorepo root (peer dep satisfied — verified via `ls node_modules/happy-dom/package.json`).

    2. Remove the silent fallback at lines 72-78. The current code:
       ```ts
       let rawHtml: string;
       try {
         rawHtml = generateHTML(blockJson as Parameters<typeof generateHTML>[0], [StarterKit]);
       } catch (err) {
         console.error('[notifications] Tiptap generateHTML failed, using fallback', err);
         rawHtml = `<p>${escapeHtml(JSON.stringify(blockJson))}</p>`;
       }
       ```
       must become:
       ```ts
       // No try/catch here — if generateHTML throws, let it propagate.
       // The dispatcher's outer try/catch writes a FAILED audit row, and the
       // preview action surfaces the error to the iframe. Silently emitting
       // JSON-stringified blockJson is what caused quick-331.
       const rawHtml = generateHTML(blockJson as Parameters<typeof generateHTML>[0], [StarterKit]);
       ```

    3. The now-unused `escapeHtml` helper can be deleted (it was only used by the fallback). If TypeScript flags an unused-import or unused-function lint, remove it cleanly.

    4. Do NOT change:
       - The function signature `renderTemplate(blockJson, payload, subject): Promise<{ html, subjectFinal }>`.
       - The order of operations: generateHTML → substituteVariables(body) → substituteVariables(subject) → render(<DynamicTemplateEmail bodyHtml={...} />).
       - The `substituteVariables` exported helper.
       - The use of `StarterKit` as the extension set (StarterKit v3 includes heading, paragraph, link, etc. — sufficient for the seed templates built by `buildDefaultTemplate`).

    5. Do NOT switch to a custom JSON walker. Per the spec (`docs/specs/Notifications System Technical Documentation.md`, Prompt 2 constraints): "Use Tiptap's official HTML renderer (@tiptap/html generateHTML) to convert blockJson to HTML. Do NOT write a custom JSON-to-HTML walker."
  </action>
  <verify>
    From `apps/web/`:
    - `grep -n "@tiptap/html/server" src/lib/notifications/template-renderer.ts` shows the import on a single line.
    - `grep -n "@tiptap/html'" src/lib/notifications/template-renderer.ts` returns no match (the bare import is gone).
    - `grep -n "JSON.stringify" src/lib/notifications/template-renderer.ts` returns no match (fallback removed).
    - `npx tsc --noEmit` exits 0.
  </verify>
  <done>
    template-renderer.ts imports `generateHTML` from `@tiptap/html/server`, contains no JSON.stringify fallback, exports the same public API (`renderTemplate`, `substituteVariables`) with identical signatures.
  </done>
</task>

<task type="auto">
  <name>Task 2: Replace mocked dispatcher test with real-renderer pipeline; add dedicated renderer test</name>
  <files>
    apps/web/src/lib/notifications/__tests__/template-renderer.test.ts
    apps/web/src/lib/notifications/__tests__/dispatcher.test.ts
  </files>
  <action>
    **2a — Create `apps/web/src/lib/notifications/__tests__/template-renderer.test.ts`** that exercises the REAL renderer (no mocks of `@tiptap/html` or the renderer module itself). The test must use `environment: 'node'` (which is the vitest.config.ts default for this repo — confirmed) and must NOT mock `@react-email/render` or `DynamicTemplateEmail`.

    Required tests (at minimum 4):

    1. **`renders a buildDefaultTemplate-shaped doc to HTML containing <h2>, <p>, <a>`**
       Build a blockJson via `buildDefaultTemplate({ headerText: 'Load #{{loadNumber}}', paragraphTextWithVars: 'Hi {{driverName}}, you have a new load from {{originCity}} to {{destCity}}.', ctaLabel: 'View load', ctaUrl: 'https://app.example.com/loads/{{loadId}}', footerNote: 'Sent by DriveCommand' })`.
       Call `await renderTemplate(blockJson, { loadNumber: 'LD-1042', driverName: 'Alex', originCity: 'Chicago', destCity: 'Dallas', loadId: 'load-xyz' }, 'Load {{loadNumber}} assigned')`.
       Assert:
       - `result.subjectFinal === 'Load LD-1042 assigned'`
       - `result.html` contains `<h2>` (or `<h2 ` opening) — heading rendered
       - `result.html` contains `Hi Alex` — text variable substituted
       - `result.html` contains `Chicago` and `Dallas` — multiple substitutions in one paragraph
       - `result.html` contains `href="https://app.example.com/loads/load-xyz"` — variable substituted INSIDE the link href attribute (proves substitution runs after HTML conversion, as the spec requires)
       - `result.html` does NOT contain `{{` anywhere (no unsubstituted vars leak)
       - `result.html` does NOT contain the literal string `"type":"doc"` or `"type":"heading"` (proves the JSON.stringify fallback path is dead — this is the regression assertion that would have caught quick-331)

    2. **`renders a minimal paragraph-only doc without throwing`**
       blockJson = `{ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] }`.
       Assert html contains `<p>Hello</p>` (or `<p>Hello` substring) and `subjectFinal` equals the literal subject passed in.

    3. **`missing variable resolves to empty string and emits console.warn`**
       Build a doc with `{{unknownVar}}` in body. Spy on `console.warn`. Assert the warn was called with a message containing `missing variable` and the unknown var name, and the rendered html does NOT contain `{{unknownVar}}`.

    4. **`malformed blockJson throws (no silent fallback)`**
       Pass `{ type: 'doc', content: [{ type: 'nonexistent_node_type' }] }` (or `null`) and assert `await expect(renderTemplate(...)).rejects.toThrow()`. This locks in the no-silent-fallback behavior — the exact regression guard for quick-331.

    Test imports MUST be:
    ```ts
    import { describe, it, expect, vi } from 'vitest';
    import { renderTemplate } from '../template-renderer';
    import { buildDefaultTemplate } from '../build-template';
    ```
    Do NOT add `vi.mock('@tiptap/html'...)`, `vi.mock('@tiptap/html/server'...)`, `vi.mock('../template-renderer'...)`, or `vi.mock('@react-email/render'...)` — the whole point is to exercise the real pipeline.

    **2b — Modify `apps/web/src/lib/notifications/__tests__/dispatcher.test.ts`** lines 28-59 (the `vi.mock('../template-renderer', ...)` block).

    Option A (preferred): **Remove the mock entirely** so the dispatcher tests exercise the real renderTemplate. The dispatcher tests already mock `resend` and `prisma` so no real DB or network hit happens; the real renderer just runs in-memory with happy-dom. Verify all 6 dispatcher tests still pass.

    Option B (only if Option A causes flakiness from React 19 / @react-email/render in vitest node env): keep `vi.mock('../template-renderer', ...)` but replace the hardcoded HTML body with a call into the REAL `renderTemplate`:
    ```ts
    vi.mock('../template-renderer', async () => {
      const actual = await vi.importActual<typeof import('../template-renderer')>('../template-renderer');
      return {
        renderTemplate: vi.fn(actual.renderTemplate),
        substituteVariables: actual.substituteVariables,
      };
    });
    ```
    This keeps spy capability while exercising the real Tiptap pipeline — the exact failure mode that shipped (mock returns hardcoded HTML never hitting generateHTML) becomes impossible.

    Document the choice in a brief code comment above the block: `// quick-331: real renderer exercised — JSON.stringify fallback regression`.

    Keep the dispatcher test's existing 6 scenarios; they should all still pass because the dispatcher contract is unchanged.
  </action>
  <verify>
    From `apps/web/`:
    - `npx vitest run src/lib/notifications/__tests__/template-renderer.test.ts` — all 4+ tests pass.
    - `npx vitest run src/lib/notifications/__tests__/dispatcher.test.ts` — all 6 existing tests still pass.
    - `npx vitest run src/lib/notifications/` — both test files pass together.
    - `grep -n "vi.mock('../template-renderer'" src/lib/notifications/__tests__/dispatcher.test.ts` shows EITHER no match (Option A) OR a mock that wraps `vi.importActual` (Option B). It must NOT show the original hardcoded-HTML mock.
    - `grep -n "JSON.stringify" src/lib/notifications/__tests__/template-renderer.test.ts` shows at least one match — the regression-guard assertion that the rendered HTML does NOT contain JSON-stringified doc shape.
  </verify>
  <done>
    A new `template-renderer.test.ts` exists with at least 4 real-pipeline tests, dispatcher.test.ts no longer uses a hardcoded-HTML mock, and `npx vitest run src/lib/notifications/` exits 0 with all tests in both files passing.
  </done>
</task>

<task type="auto">
  <name>Task 3: Full verification gauntlet — typecheck, build, isolation suite, dropdown regression, audit gate</name>
  <files>
    (verification only — no files modified)
  </files>
  <action>
    Run every gate the constraints require, from `apps/web/` unless noted:

    1. **TypeScript:** `npx tsc --noEmit` — must exit 0.
    2. **Build:** `npm run build` — must exit 0.
    3. **Isolation tests (17 total):** `npx vitest run src/__tests__/isolation/ src/lib/db/__tests__/driver-pay-tenant-isolation.test.ts tests/security/audit-log-isolation.test.ts` — all must pass. (These are the existing tests in `src/__tests__/isolation/group-a-isolation.test.ts`, `group-b-isolation.test.ts`, `group-c-isolation.test.ts`, `src/lib/db/__tests__/driver-pay-tenant-isolation.test.ts`, `tests/security/audit-log-isolation.test.ts` — confirmed via repo grep.)
    4. **Dropdown regression (5 tests):** `npx vitest run tests/isolation/dropdowns.test.ts` — all must pass.
    5. **Raw Prisma audit gate:** `npm run audit:raw-prisma` — must exit 0.
    6. **Notification tests** (from Task 2): `npx vitest run src/lib/notifications/` — must pass.
    7. **Manual smoke (in your verification notes, no commit needed):**
       - Open the editor at `/admin/notifications` (any of the 36 templates, e.g. `load.assigned`).
       - Confirm the Preview pane on the right shows rendered HTML (visible heading + paragraph + CTA link), NOT raw JSON, NOT `{"type":"doc"...}`.
       - Confirm the preview updates when editing the subject or body.

    If any gate fails, do NOT proceed to commit. Diagnose, fix, and re-run.

    Record the exact command output (last 10 lines per command) in the SUMMARY for traceability.
  </action>
  <verify>
    Every command in the action block exited 0. The manual smoke check shows rendered HTML in the preview pane.
  </verify>
  <done>
    `tsc --noEmit`, `npm run build`, 17 isolation tests, 5 dropdown regression tests, raw-prisma audit, and notification tests all green. Preview pane confirmed rendering HTML (no JSON).
  </done>
</task>

</tasks>

<verification>
End-to-end:

1. **The bug is dead.** Opening any template editor at `/admin/notifications` (load.assigned, user.welcome, driver.license_expiring, etc.) shows rendered HTML in the preview pane — never the literal `{"type":"doc","content":[...]}` payload from the bug report.
2. **Single source of truth.** Only one file (`template-renderer.ts`) converts Tiptap JSON to HTML, and both the preview action (`renderNotificationTemplatePreview` in `app/(admin)/actions/notifications.ts`) and the dispatcher (`dispatchNotification` in `lib/notifications/dispatcher.ts`) call into it. Confirmed by:
   ```
   grep -rn "renderTemplate\b" apps/web/src/
   ```
   Only the two call sites above invoke it.
3. **No silent fallback.** `grep -n "JSON.stringify" apps/web/src/lib/notifications/template-renderer.ts` returns no match.
4. **The mock that masked the bug is gone.** `grep -A 30 "vi.mock('../template-renderer'" apps/web/src/lib/notifications/__tests__/dispatcher.test.ts` shows either no match (mock removed) or `vi.importActual` (real renderer wrapped).
5. **Regression test exists.** `apps/web/src/lib/notifications/__tests__/template-renderer.test.ts` asserts the rendered HTML does NOT contain `"type":"doc"` — the exact string from the bug report.
6. **All gates green:** tsc, build, 17 isolation tests, 5 dropdown regression tests, audit:raw-prisma, notification tests.
</verification>

<success_criteria>
- `apps/web/src/lib/notifications/template-renderer.ts` imports `generateHTML` from `@tiptap/html/server` (not bare `@tiptap/html`).
- No JSON-stringify fallback remains in the renderer.
- A new `template-renderer.test.ts` exercises the real pipeline with at least 4 tests, including a regression assertion that asserts the rendered HTML does NOT contain `"type":"doc"`.
- `dispatcher.test.ts` no longer mocks `../template-renderer` with hardcoded HTML; the real renderer (or a `vi.importActual` wrapper) runs in those tests.
- `npx tsc --noEmit`, `npm run build`, `npx vitest run src/__tests__/isolation/ src/lib/db/__tests__/driver-pay-tenant-isolation.test.ts tests/security/audit-log-isolation.test.ts`, `npx vitest run tests/isolation/dropdowns.test.ts`, `npm run audit:raw-prisma`, and `npx vitest run src/lib/notifications/` all exit 0.
- Manual smoke check (Preview pane shows rendered HTML, not JSON) confirmed in the SUMMARY.
- No template content was changed (the 36 seeded templates are untouched).
- No custom JSON-to-HTML serializer was introduced (renderer continues to use Tiptap's official `generateHTML`).
- Variable substitution still runs AFTER HTML conversion (locked in by Test 1 in template-renderer.test.ts, which asserts `{{loadId}}` is substituted inside a link `href` attribute).
</success_criteria>

<output>
After completion, create `.planning/quick/331-fix-broken-tiptap-json-to-html-renderer-/331-SUMMARY.md` documenting:
- Root-cause sentence (the one above).
- The 1-line code change in template-renderer.ts (`@tiptap/html` → `@tiptap/html/server`).
- Confirmation that the silent JSON.stringify fallback was removed.
- Tests added (file path + count).
- Verification gate output (last 10 lines per command).
- Manual smoke confirmation: which template was opened, screenshot or text description of the preview pane showing rendered HTML.
</output>

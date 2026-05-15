# Quick Task 334 — SUMMARY

**Task:** Add `serverExternalPackages` for Tiptap to `apps/web/next.config.ts` to fix the "Cannot access level on the server" Client Reference error in the notifications template preview.

**Date:** 2026-05-15

---

## Reasoning Step

### Config shape
`next.config.ts` uses `const nextConfig: NextConfig = { ... }; export default withSentryConfig(nextConfig, { ... })`. The inner `nextConfig` is a typed plain object — `serverExternalPackages` was added as a top-level key inside it, alongside `experimental` and `headers`.

### Wrapper analysis
The config IS wrapped by `withSentryConfig`. The new key goes inside the inner `nextConfig` object (which is passed to the wrapper), NOT on the wrapped result. `NextConfig` in Next.js 16 includes `serverExternalPackages` natively — no `any` cast needed.

### Key: top-level, not experimental
`serverExternalPackages` is a top-level Next.js 16 config key. `experimental.serverComponentsExternalPackages` was the Next.js 14 name and does NOT work in Next.js 16.

---

## Diff

**File changed:** `apps/web/next.config.ts`

Added `serverExternalPackages` array (16 packages, alphabetical) at the top level of `nextConfig`:
- `@tiptap/core`, `@tiptap/extension-bold`, `@tiptap/extension-bullet-list`, `@tiptap/extension-document`, `@tiptap/extension-hard-break`, `@tiptap/extension-heading`, `@tiptap/extension-italic`, `@tiptap/extension-link`, `@tiptap/extension-list-item`, `@tiptap/extension-ordered-list`, `@tiptap/extension-paragraph`, `@tiptap/extension-text`, `@tiptap/html`, `prosemirror-model`, `prosemirror-state`, `prosemirror-transform`

---

## Verification Results

| # | Check | Result |
|---|-------|--------|
| 1 | `npx tsc --noEmit` from `apps/web` | ✅ Y — clean, no errors |
| 2 | Local production repro: `npm run build` → `npm run start` → action returns 403 (not 500) | ✅ Y — confirmed (see below) |
| 3 | `npm run build` from monorepo root | ✅ Y — build succeeded |
| 4 | Build output mentioning serverExternalPackages | ✅ Y — see note below |
| 5 | `npx vitest run src/lib/notifications/__tests__/` | ✅ Y — 17/17 tests pass |

### Check 2 — Production repro detail

Production server started on port 3001 (`npm run start -- -p 3001`). Server action `renderNotificationTemplatePreview` (action ID: `7083d6c2b32ea79bbb56ac223849c7dfeeed57468b`) called directly via POST with `Next-Action` header.

**Before fix:** 500 with "Cannot access level on the server" — Tiptap module crashed at load time before auth ran.

**After fix:** 403 "Forbidden" — Tiptap modules loaded cleanly via Node.js `require()`, auth ran and correctly rejected the unauthenticated request. Auth runs AFTER module load, so 403 proves the RSC bundler issue is resolved.

### Check 4 — Build output note

Next.js 16 does not emit a dedicated "serverExternalPackages" log line. The packages are silently excluded from server bundles. Build completed in ~3 minutes with all routes compiled successfully (no errors, no warnings related to Tiptap).

---

## Why Dev Mode Was Insufficient (quick-333 lesson)

`npm run dev` uses Turbopack in development mode, which is more permissive with Client Reference boundaries. It allows `.level` access on a Client Reference proxy in dev mode but throws in production. This means:
- `npm run dev` passes → does NOT prove the fix works in production
- `npm run build && npm run start` → is the only reliable local production test

**Quick-task-334 confirmed local production repro before push**: The server action returned 403 (not 500) on the production server, proving the fix resolves the RSC bundler crash at runtime.

---

## Notes

- Only `apps/web/next.config.ts` was modified — no other files touched
- Client-side `block-editor.tsx` is unaffected — it continues to import StarterKit normally
- `server-extensions.ts` and `template-renderer.ts` from quick-333 are unchanged and correct
- The 17 notification tests include the heading level=2 regression guard (quick-333 test #2) which directly exercises the code path that was crashing

# Quick Task 334 — Add serverExternalPackages for Tiptap to next.config.ts

**Task:** Fix the persistent "Cannot access level on the server" error in the notifications preview by externalizing Tiptap and ProseMirror packages from the RSC bundler.

**Root cause:** `block-editor.tsx` ('use client') imports StarterKit, which transitively re-exports every `@tiptap/extension-*` package. Next.js 16's RSC bundler (Turbopack production mode) hoists these into a single shared module instance marked as a Client Reference. When server-side code accesses `.level` on the Heading extension config, it gets a Client Reference proxy that throws "Cannot access level on the server."

**Fix:** Add `serverExternalPackages` to `next.config.ts` — Next.js loads these packages via Node.js `require()` at runtime, bypassing the RSC bundler entirely. The key goes inside the inner `nextConfig` object (typed as `NextConfig`), NOT on the wrapped result returned by `withSentryConfig`.

## Tasks

### Task 1 — Edit apps/web/next.config.ts

Add `serverExternalPackages` at the top level of `const nextConfig: NextConfig = { ... }`:

```typescript
serverExternalPackages: [
  '@tiptap/core',
  '@tiptap/extension-bold',
  '@tiptap/extension-bullet-list',
  '@tiptap/extension-document',
  '@tiptap/extension-hard-break',
  '@tiptap/extension-heading',
  '@tiptap/extension-italic',
  '@tiptap/extension-link',
  '@tiptap/extension-list-item',
  '@tiptap/extension-ordered-list',
  '@tiptap/extension-paragraph',
  '@tiptap/extension-text',
  '@tiptap/html',
  'prosemirror-model',
  'prosemirror-state',
  'prosemirror-transform',
],
```

**Key config facts:**
- `next.config.ts` uses `const nextConfig: NextConfig = {...}; export default withSentryConfig(nextConfig, {...})`
- `serverExternalPackages` is a top-level key (NOT `experimental.serverComponentsExternalPackages` which was Next 14)
- Must go inside the inner `nextConfig` object, before `withSentryConfig` wraps it
- No `any` cast needed — `NextConfig` type in Next 16 includes `serverExternalPackages`

**Files to touch:** `apps/web/next.config.ts` only.

---
phase: quick-277
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/migrations/20260422100001_drop_carrier_documents_type_check/migration.sql
  - apps/web/src/components/carrier/documents/DocumentUploadModal.tsx
  - apps/web/src/app/api/auth/me/route.ts
autonomous: true
must_haves:
  truths:
    - "Uploading a carrier document with any document_type string succeeds (no CHECK constraint violation)"
    - "Upload Document button on client/contract detail pages matches primary action button style"
    - "Rapid page loads do not trigger Supabase Auth 429 rate limit on /api/auth/me"
  artifacts:
    - path: "apps/web/prisma/migrations/20260422100001_drop_carrier_documents_type_check/migration.sql"
      provides: "DROP CHECK constraint migration"
      contains: "DROP CONSTRAINT carrier_documents_document_type_check"
    - path: "apps/web/src/components/carrier/documents/DocumentUploadModal.tsx"
      provides: "Restyled trigger button"
      contains: "bg-primary"
    - path: "apps/web/src/app/api/auth/me/route.ts"
      provides: "Session-cached auth endpoint"
      contains: "cachedSession"
  key_links:
    - from: "DocumentUploadModal.tsx"
      to: "ClientDetail.tsx / ContractDetail.tsx"
      via: "triggerLabel prop"
      pattern: "triggerLabel"
---

<objective>
Fix three issues: (1) drop the carrier_documents document_type CHECK constraint that blocks uploads of catalog-based document types, (2) restyle the Upload Document trigger button to match primary action buttons, (3) add server-side session caching to /api/auth/me to prevent Supabase Auth 429 rate limits.

Purpose: Unblock document uploads, improve UI consistency, prevent auth rate limiting errors.
Output: One migration file, updated DocumentUploadModal trigger styling, cached /api/auth/me route.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/prisma/migrations/20260404100010_carrier_documents/migration.sql
@apps/web/src/components/carrier/documents/DocumentUploadModal.tsx
@apps/web/src/app/api/auth/me/route.ts
@apps/web/src/components/carrier/clients/ClientList.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Drop CHECK constraint and restyle upload button</name>
  <files>
    apps/web/prisma/migrations/20260422100001_drop_carrier_documents_type_check/migration.sql
    apps/web/src/components/carrier/documents/DocumentUploadModal.tsx
  </files>
  <action>
1. Create migration file `apps/web/prisma/migrations/20260422100001_drop_carrier_documents_type_check/migration.sql` with:
   ```sql
   -- Drop the document_type CHECK constraint.
   -- Document type validation is now handled at the application layer
   -- via the CarrierDocumentType catalog (added in 20260422000001).
   ALTER TABLE carrier_documents DROP CONSTRAINT carrier_documents_document_type_check;
   ```
   Run `npx prisma migrate deploy` from apps/web to apply.

2. In `DocumentUploadModal.tsx`, update the DialogTrigger button (around line 237-242). Change from the current underlined text link style:
   ```
   className="text-xs text-primary underline hover:text-primary/80 transition-colors"
   ```
   To primary action button style matching "New Client" / "New Contract" / "New Dispatch" buttons:
   ```
   className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
   ```
   Also add an Upload icon from lucide-react before the triggerLabel text. Import `Upload` from `lucide-react` at the top of the file, and render `<Upload className="h-4 w-4" />` inside the button before `{triggerLabel}`.
  </action>
  <verify>
    - Run `cd apps/web && npx prisma migrate deploy` succeeds without errors
    - Run `cd apps/web && npx tsc --noEmit` passes
    - Visually confirm: the trigger button in ClientDetail and ContractDetail now renders as a blue primary button with upload icon
  </verify>
  <done>
    - CHECK constraint `carrier_documents_document_type_check` no longer exists in the database
    - Upload Document button renders as primary blue button with Upload icon, matching "New Client" / "New Contract" / "New Dispatch" button styling
  </done>
</task>

<task type="auto">
  <name>Task 2: Add session caching to /api/auth/me to prevent 429</name>
  <files>apps/web/src/app/api/auth/me/route.ts</files>
  <action>
Add a module-level session cache to the `/api/auth/me` route handler to reduce Supabase Auth API calls. The cache should:

1. Add module-level variables at the top of the file (after imports):
   ```typescript
   // Cache getUser() results for 5 minutes to avoid Supabase Auth 429 rate limits.
   // Key: cookie header string, Value: { user, expiry }
   const sessionCache = new Map<string, { user: any; expiry: number }>();
   const SESSION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
   ```

2. In the cookie-based (web) branch of the GET handler (after line 57 `const supabase = ...`), before calling `supabase.auth.getUser()`:
   - Extract a cache key from the cookie header: `const cacheKey = req.headers.get('cookie') || '';`
   - Check if a valid cached entry exists: `const cached = sessionCache.get(cacheKey); if (cached && Date.now() < cached.expiry) { ... use cached.user ... }`
   - If cache hit, skip the `supabase.auth.getUser()` call and use `cached.user` directly
   - If cache miss, call `supabase.auth.getUser()` as before, then store the result: `sessionCache.set(cacheKey, { user, expiry: Date.now() + SESSION_CACHE_TTL });`
   - If user is null, cache the null result too (prevents repeated lookups for unauthenticated requests): `sessionCache.set(cacheKey, { user: null, expiry: Date.now() + SESSION_CACHE_TTL });`
   - Clean up: after setting cache, prune expired entries if map size exceeds 100: `if (sessionCache.size > 100) { for (const [k, v] of sessionCache) { if (Date.now() >= v.expiry) sessionCache.delete(k); } }`

3. Do NOT cache the Bearer token (mobile) path — those are already rate-limited by Upstash and use admin.auth.getUser() which has different rate limits.

Important: The cookie header is used as cache key because it contains the Supabase session token. Different users have different cookies, so this naturally partitions the cache per user.
  </action>
  <verify>
    - Run `cd apps/web && npx tsc --noEmit` passes
    - Manual test: load any authenticated page rapidly (5+ times in 2 seconds) — no 429 errors in browser console or server logs
  </verify>
  <done>
    - /api/auth/me caches Supabase getUser() results for 5 minutes per cookie
    - Null sessions are cached correctly (no infinite retry loops)
    - Cache self-cleans when exceeding 100 entries
    - Mobile Bearer token path is NOT cached (unchanged)
  </done>
</task>

</tasks>

<verification>
- `npx prisma migrate deploy` succeeds
- `npx tsc --noEmit` passes with zero errors
- Upload Document button is visually a primary blue button with icon
- No 429 errors on rapid page navigation
</verification>

<success_criteria>
- carrier_documents_document_type_check constraint is dropped from the database
- Upload Document trigger button matches primary action button style (bg-primary, rounded-lg, px-4 py-2, Upload icon)
- /api/auth/me caches Supabase Auth calls for 5 minutes, handles null sessions, self-prunes
</success_criteria>

<output>
After completion, create `.planning/quick/277-fix-carrier-documents-check-constraint-i/277-SUMMARY.md`
</output>

---
phase: quick-270
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/carrier/documents.ts
  - apps/web/src/app/api/v1/carrier/documents/route.ts
autonomous: true
must_haves:
  truths:
    - "Storage upload errors are fully serialized in logs with message, statusCode, and stack"
    - "Logger calls use correct (message, error, context) signature throughout carrier documents module"
    - "Upload path correctly handles all optional FK fields without Prisma validation errors"
    - "No TypeScript errors in modified files"
  artifacts:
    - path: "apps/web/src/lib/carrier/documents.ts"
      provides: "Fixed error logging in uploadDocument and deleteDocument"
    - path: "apps/web/src/app/api/v1/carrier/documents/route.ts"
      provides: "Fixed error logging in route catch blocks"
  key_links:
    - from: "apps/web/src/lib/carrier/documents.ts"
      to: "logger.error"
      via: "correct 3-arg signature (message, error, context)"
      pattern: "logger\\.error\\([^,]+,\\s*(uploadError|storageError)"
---

<objective>
Fix document upload error logging so real Supabase Storage errors appear in logs instead of `[object Object]`, and audit the full upload path for any issues introduced by quick-269 FK columns.

Purpose: Uploads are failing with "storage upload failed" but the actual Supabase error is being swallowed by incorrect logger.error() call signatures. Without the real error message, debugging is impossible.

Output: Fixed error serialization in carrier documents module, correct logger call signatures throughout.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/carrier/documents.ts
@apps/web/src/lib/logger.ts
@apps/web/src/app/api/v1/carrier/documents/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix logger.error call signatures and improve error serialization in carrier documents</name>
  <files>
    apps/web/src/lib/carrier/documents.ts
    apps/web/src/app/api/v1/carrier/documents/route.ts
  </files>
  <action>
The logger.error signature is `(message: string, error?: unknown, context?: Record<string, unknown>)`.

**Bug 1 — uploadDocument line 120:**
Current: `logger.error('uploadDocument: storage upload failed', { orgId, storagePath, err: uploadError })`
This passes a plain object as the `error` arg. Since it's not an Error instance, logger does `new Error(String(object))` which produces `[object Object]`. The real Supabase StorageError (with `.message` and `.statusCode`) is completely lost.

Fix: Split into proper 3-arg call:
```ts
logger.error('uploadDocument: storage upload failed', uploadError, { orgId, storagePath });
```

**Bug 2 — deleteDocument line 264:**
Current: `logger.error('deleteDocument: storage delete failed', { orgId, docId, err: storageError })`
Same issue — object as error arg.

Fix:
```ts
logger.error('deleteDocument: storage delete failed', storageError, { orgId, docId });
```

**Bug 3 — route.ts POST catch (line 59):**
Current: `logger.error('POST /api/v1/carrier/documents failed', err)`
This is technically correct (error as 2nd arg), but add context for better debugging:
```ts
logger.error('POST /api/v1/carrier/documents failed', err, { userId: session?.userId });
```
Note: `session` may not exist if error happens before session check, so use optional chaining. Since session is declared before the try block, move the session variable declaration or use a let binding before try so it's accessible in catch. Actually, session IS declared before try on line 8, so it's already in scope — just reference it.

**Bug 4 — route.ts GET catch (line 85):**
Same pattern — add context:
```ts
logger.error('GET /api/v1/carrier/documents failed', err, { userId: session?.userId });
```

**Audit confirmation — Prisma create is fine:**
The CarrierDocument schema has all FK fields (`documentTypeId`, `loadId`, `dispatchId`, `contractId`) as `String?` (optional). The uploadDocument create call already passes them with `?? null` fallback. No Prisma validation issue here.

**Audit confirmation — Supabase Storage upload is fine:**
The upload uses `createAdminClient().storage.from(BUCKET).upload(storagePath, buffer, { contentType: file.type })`. The buffer is created via `Buffer.from(await file.arrayBuffer())`. ContentType is set from `file.type`. This is correct.

The real error is likely a Supabase Storage configuration issue (bucket doesn't exist, RLS policy, or service role key issue) — but we can't diagnose without proper error logging, which is what this fix enables.
  </action>
  <verify>
    Run: `cd C:/Users/sammy/Projects/DriveCommand && npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | head -20`
    Verify no TypeScript errors in modified files.
    Grep for the old broken pattern to confirm it's gone: `grep -n "err: uploadError\|err: storageError" apps/web/src/lib/carrier/documents.ts` should return nothing.
  </verify>
  <done>
    All logger.error calls in carrier/documents.ts and the documents route use the correct 3-arg signature (message, error, context). Supabase StorageError objects will now be properly captured by Sentry and serialized in console logs with their real message and statusCode. No TypeScript errors.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit --project apps/web/tsconfig.json` passes with no errors in modified files
- No instances of `{ err: uploadError }` or `{ err: storageError }` pattern remain in documents.ts
- All `logger.error` calls follow `(message, errorObject, contextObject)` signature
</verification>

<success_criteria>
- Storage upload errors will now show the real Supabase error message in logs and Sentry
- All 4 logger.error calls in the document upload path use correct signatures
- Zero TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/270-fix-document-upload-storage-failure-and-/270-SUMMARY.md`
</output>

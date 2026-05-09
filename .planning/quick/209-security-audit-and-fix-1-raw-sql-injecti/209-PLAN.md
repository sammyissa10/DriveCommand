---
phase: quick-209
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/actions/rate-confirmation.tsx
  - apps/web/src/app/api/documents/request-upload-url/route.ts
  - apps/web/src/app/api/support/upload-attachment/route.ts
autonomous: true
must_haves:
  truths:
    - "All raw SQL queries use parameterized inputs, never string interpolation"
    - "All file upload routes validate content type against an allowlist"
    - "All server actions enforce role checks before any DB access"
  artifacts:
    - path: "apps/web/src/app/(owner)/actions/rate-confirmation.tsx"
      provides: "Rate confirmation PDF generation with role guard"
      contains: "requireRole"
    - path: "apps/web/src/app/api/documents/request-upload-url/route.ts"
      provides: "Presigned URL generation with content type validation"
      contains: "ALLOWED_TYPES"
    - path: "apps/web/src/app/api/support/upload-attachment/route.ts"
      provides: "Support attachment upload with stricter MIME validation"
      contains: "ALLOWED_TYPES"
  key_links: []
---

<objective>
Fix security vulnerabilities found during exhaustive audit of raw SQL injection,
file upload security, and RBAC privilege escalation across the DriveCommand codebase.

Purpose: Close 3 specific security gaps identified during audit.
Output: Patched files with hardened security controls.
</objective>

<audit_findings>

## Area 1: Raw SQL Injection — CLEAN (no fixes needed)

Exhaustive grep of all `$queryRaw`, `$executeRaw`, `$queryRawUnsafe`, `$executeRawUnsafe`
across `apps/web/src/` (excluding `generated/`):

**File: `actions/support-tickets.ts`**
- Lines 98, 169, 217, 341, 371, 410, 475, 542: `$executeRaw\`SELECT set_config(...)\``
  — Tagged template literal, SAFE (Prisma parameterizes)
- Lines 285, 289, 291, 486, 562: `$queryRaw\`SELECT ... ${value}\``
  — Tagged template literal, SAFE (Prisma parameterizes)
- Line 270: `$queryRawUnsafe(query, ...params)` — Uses positional `$1`, `$2` placeholders
  with spread params. The WHERE clause is built with `$${paramIndex++}` string literals
  (not user input), and actual values go through `...params`. SAFE.

**File: `api/cron/carrier-compliance-alerts/route.ts`**
- Line 39: `$executeRawUnsafe(\`CREATE TABLE IF NOT EXISTS ...\`)`
  — Static DDL string, no user input. SAFE.

**All other 74 files** use `$executeRaw` or `$queryRaw` tagged template literals exclusively.
Every interpolated value uses Prisma's parameterization. NO INJECTION VULNERABILITIES FOUND.

## Area 2: File Upload Security — 2 fixes needed

**Already well-hardened:**
- `lib/storage/validate.ts` — Magic bytes detection via `file-type`, ALLOWED_TYPES allowlist,
  MAX_FILE_SIZE (100MB), HEIC rejection, mismatch detection. Excellent.
- `api/documents/upload/route.ts` — ALLOWED_TYPES check, MAX_FILE_SIZE check, role check. Good.
- `api/documents/multipart/initiate/route.ts` — ALLOWED_TYPES + extension fallback, MAX_FILE_SIZE. Good.
- `api/documents/multipart/part-url/route.ts` — Tenant prefix check on s3Key. Good.
- `api/documents/multipart/complete/route.ts` — Tenant prefix check, Zod validation. Good.
- `api/mobile/driver/documents/upload-url/route.ts` — ALLOWED_CONTENT_TYPES, MAX_FILE_SIZE. Good.
- `api/mobile/driver/incidents/upload-photo/route.ts` — ALLOWED_PHOTO_TYPES, MAX_PHOTO_SIZE. Good.
- `api/mobile/support/upload-screenshot/route.ts` — ALLOWED_TYPES, MAX_SIZE, base64 decode. Good.
- `api/mobile/driver/documents/[id]/url/route.ts` — driverId ownership check. Good.
- `api/documents/download-url/[id]/route.ts` — Tenant prefix check on s3Key. Good.
- `api/documents/delete/[id]/route.ts` — Tenant prefix check. Good.
- `api/documents/complete-upload/route.ts` — Tenant prefix check. Good.
- `lib/carrier/documents.ts` — Extension allowlist, MAX_FILE_SIZE, org ownership verification. Good.

**FIX NEEDED:**
1. `api/documents/request-upload-url/route.ts` — Accepts ANY contentType from client without
   validation. Client can request a presigned URL for `text/html` or `application/javascript`.
   While the presigned URL includes ContentType, this is defense-in-depth missing.
   FIX: Add ALLOWED_TYPES check matching the `upload/route.ts` allowlist.

2. `api/support/upload-attachment/route.ts` — Uses overly permissive `contentType.startsWith('image/')`
   which allows `image/svg+xml` (potential XSS vector via SVG with embedded scripts).
   FIX: Replace with explicit allowlist matching other upload routes.

## Area 3: RBAC Privilege Escalation — 1 fix needed

**All 29 owner action files audited** — every exported function has `requireRole()` or
`requirePermission()` as first operation EXCEPT:

1. **`rate-confirmation.tsx` — `generateRateConfirmationPDF()`** — NO role check.
   Calls `getTenantPrisma()` directly (which provides tenant scoping but NOT role authorization).
   A DRIVER user could call this server action directly to generate rate confirmations,
   which are owner-only financial documents containing rate/pricing information.
   FIX: Add `requireRole([UserRole.OWNER, UserRole.MANAGER])` before DB access.

**Other findings (NOT vulnerabilities):**
- `dashboard.ts` getNotificationAlerts/getDashboardMetrics — use `getAuthContext()` which
  includes role check (OWNER, MANAGER). SAFE.
- `notifications.ts` getUpcomingMaintenance/getExpiringDocuments — use `getAuthContext()`. SAFE.
- `ifta.ts` generateIFTACSV — pure data transformation, no DB access. SAFE.
- `subscription.ts` getMySubscriptionInvoices — uses `requirePermission('canViewBilling')`. SAFE.

**All 6 driver action files audited** — every function has `requireRole([UserRole.DRIVER])`.
Driver actions properly scope queries to the requesting driver's data via
`getCurrentUser()` + driver-specific filters. NO ISSUES.

</audit_findings>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/src/app/(owner)/actions/rate-confirmation.tsx
@apps/web/src/app/api/documents/request-upload-url/route.ts
@apps/web/src/app/api/support/upload-attachment/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix RBAC gap in rate-confirmation + harden upload content type validation</name>
  <files>
    apps/web/src/app/(owner)/actions/rate-confirmation.tsx
    apps/web/src/app/api/documents/request-upload-url/route.ts
    apps/web/src/app/api/support/upload-attachment/route.ts
  </files>
  <action>
1. **rate-confirmation.tsx** — Add role guard:
   - Import `requireRole` from `@/lib/auth/supabase` and `UserRole` from `@/lib/auth/roles`
   - Add `await requireRole([UserRole.OWNER, UserRole.MANAGER]);` as the FIRST line
     inside `generateRateConfirmationPDF()`, BEFORE the `getTenantPrisma()` call
   - This prevents drivers from generating rate confirmations (financial documents with pricing)

2. **request-upload-url/route.ts** — Add content type allowlist:
   - Add `const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];` at top
   - After parsing the body, add validation:
     ```
     if (!ALLOWED_TYPES.includes(contentType)) {
       return NextResponse.json(
         { error: 'Content type not allowed. Allowed: PDF, JPEG, PNG.' },
         { status: 400 }
       );
     }
     ```
   - Place this check BEFORE the `generateUploadUrl()` call
   - This matches the allowlist in `api/documents/upload/route.ts` for consistency

3. **support/upload-attachment/route.ts** — Tighten MIME type validation:
   - Replace the permissive `contentType.startsWith('image/')` check with an explicit allowlist:
     ```
     const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
     if (!ALLOWED_TYPES.includes(contentType)) {
       return NextResponse.json(
         { error: 'Only JPEG, PNG, and PDF files are accepted.' },
         { status: 400 }
       );
     }
     ```
   - This blocks SVG uploads (image/svg+xml can contain XSS scripts) and other
     exotic image types while still supporting the 3 types used in practice
  </action>
  <verify>
    Run `npx tsc --noEmit` from `apps/web/` to confirm no type errors introduced.
    Grep to verify: `grep -n "requireRole" apps/web/src/app/\(owner\)/actions/rate-confirmation.tsx`
    should show the role guard.
    Grep to verify: `grep -n "ALLOWED_TYPES" apps/web/src/app/api/documents/request-upload-url/route.ts`
    should show the content type check.
    Grep to verify: `grep -n "ALLOWED_TYPES" apps/web/src/app/api/support/upload-attachment/route.ts`
    should show the explicit allowlist (not startsWith).
  </verify>
  <done>
    - rate-confirmation.tsx has requireRole([OWNER, MANAGER]) before any DB access
    - request-upload-url validates contentType against PDF/JPEG/PNG allowlist
    - support/upload-attachment uses explicit MIME allowlist instead of startsWith('image/')
    - TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes in apps/web/
- All 3 files have their security fixes applied
- No regressions in existing functionality
</verification>

<success_criteria>
All 3 identified security gaps are closed:
1. Rate confirmation PDF generation requires OWNER/MANAGER role
2. Presigned upload URL generation validates content type
3. Support attachment upload blocks SVG and other exotic image types
</success_criteria>

<output>
After completion, create `.planning/quick/209-security-audit-and-fix-1-raw-sql-injecti/209-SUMMARY.md`
</output>

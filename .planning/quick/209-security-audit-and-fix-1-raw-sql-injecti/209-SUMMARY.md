---
phase: quick-209
plan: "01"
subsystem: security
tags: [security, rbac, file-upload, server-actions]
dependency_graph:
  requires: []
  provides: [rate-confirmation-rbac, upload-content-type-validation]
  affects: [owner-actions, document-upload, support-upload]
tech_stack:
  added: []
  patterns: [requireRole-guard, ALLOWED_TYPES-allowlist]
key_files:
  created: []
  modified:
    - apps/web/src/app/(owner)/actions/rate-confirmation.tsx
    - apps/web/src/app/api/documents/request-upload-url/route.ts
    - apps/web/src/app/api/support/upload-attachment/route.ts
decisions:
  - ALLOWED_TYPES for uploads set to PDF/JPEG/PNG only, matching existing upload/route.ts allowlist for consistency
  - SVG blocked at support attachment route because image/svg+xml can carry embedded scripts (XSS)
metrics:
  duration: "8 minutes"
  completed: "2026-04-14"
  tasks_completed: 1
  files_modified: 3
---

# Quick-209: Security Audit and Fix — RBAC Gap + Upload Content Type Hardening

**One-liner:** Closed driver RBAC bypass on rate confirmation PDF generation and replaced permissive `image/*` MIME check with explicit PDF/JPEG/PNG allowlists on two upload routes.

## What Was Done

Executed a targeted security audit across 3 areas (raw SQL injection, file upload security, RBAC privilege escalation). The raw SQL audit found no vulnerabilities — all Prisma `$queryRaw`/`$executeRaw` usage is parameterized. Two file upload routes and one server action required fixes.

## Fixes Applied

### 1. RBAC Gap — `rate-confirmation.tsx`

`generateRateConfirmationPDF()` was callable by any authenticated user including drivers, because it only used `getTenantPrisma()` (tenant scoping) with no role authorization. Rate confirmations contain pricing/rate data that is owner-only.

**Fix:** Added `await requireRole([UserRole.OWNER, UserRole.MANAGER])` as the first line inside the function, before any DB access. Added corresponding imports for `requireRole` and `UserRole`.

### 2. Missing Content Type Validation — `request-upload-url/route.ts`

The presigned URL generation endpoint accepted any `contentType` from the client with no validation. A client could request a presigned URL for `text/html` or `application/javascript`.

**Fix:** Added `const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png']` and a guard that returns HTTP 400 before `generateUploadUrl()` is called. Matches the allowlist in `api/documents/upload/route.ts`.

### 3. Permissive MIME Check — `support/upload-attachment/route.ts`

The content type check used `contentType.startsWith('image/')` which allows `image/svg+xml`. SVG files can contain embedded `<script>` tags and are a known XSS vector when stored and served back to users.

**Fix:** Replaced `startsWith` check with `const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf']` and `ALLOWED_TYPES.includes(contentType)`, blocking SVG and all other exotic MIME types.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npx tsc --noEmit` — no errors in modified files (pre-existing E2E test type errors in unrelated Playwright spec files)
- `requireRole` confirmed present in rate-confirmation.tsx at line 21
- `ALLOWED_TYPES` confirmed present in both upload routes with `.includes()` guard

## Self-Check: PASSED

Files exist:
- `apps/web/src/app/(owner)/actions/rate-confirmation.tsx` — FOUND
- `apps/web/src/app/api/documents/request-upload-url/route.ts` — FOUND
- `apps/web/src/app/api/support/upload-attachment/route.ts` — FOUND

Commit exists: `af89c37` — FOUND

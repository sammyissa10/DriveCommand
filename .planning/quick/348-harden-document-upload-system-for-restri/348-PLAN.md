---
phase: quick-348
plan: 348
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/schema.prisma
  - apps/web/prisma/migrations/20260516100001_restricted_documents/migration.sql
  - apps/web/src/lib/storage/presigned.ts
  - apps/web/src/lib/storage/restricted.ts
  - apps/web/src/lib/security/restricted-document-access.ts
  - apps/web/src/lib/security/audit-log.ts
  - apps/web/src/lib/db/repositories/document.repository.ts
  - apps/web/src/app/api/documents/request-upload-url/route.ts
  - apps/web/src/app/api/documents/download-url/[id]/route.ts
  - apps/web/src/app/(driver)/documents/document-list.tsx
  - apps/web/src/app/(owner)/components/RestrictedDocumentDownloadButton.tsx
  - apps/web/tests/security/restricted-documents.test.ts
autonomous: true

must_haves:
  truths:
    - "Uploading a restricted document (SSN_CARD, PASSPORT, CDL_SCAN, MEDICAL_CARD, VOIDED_CHECK, W9, W4, I9) produces an S3 key starting with tenant-{tenantId}/restricted/"
    - "Restricted download presigned URLs expire in 15 minutes (900s); non-restricted stays at 1 hour"
    - "Every restricted download writes one audit_log row with action=DOWNLOAD_DOCUMENT before the URL is returned"
    - "DRIVER can only download their own restricted docs; cross-driver access in same tenant returns 403 + audit_log DOWNLOAD_DOCUMENT_DENIED"
    - "DISPATCHER role is blocked from any restricted download → 403 + audit_log DOWNLOAD_DOCUMENT_DENIED (note: project has no DISPATCHER role today; gate at MANAGER+ and document the choice)"
    - "Cross-tenant document access returns 404 (no information leak), with audit_log DOWNLOAD_DOCUMENT_DENIED row in caller's tenant"
    - "is_restricted column is correctly derived from documentType at insert time"
    - "Non-restricted document flow (BOL/POD/rate confirmation) is completely unchanged"
    - "Driver UI shows Lock icon next to restricted DocumentType options and a 'Restricted' badge on restricted rows"
    - "Restricted downloads prompt a confirm dialog: 'This download will be recorded in the access log. Continue?'"
  artifacts:
    - path: "apps/web/prisma/migrations/20260516100001_restricted_documents/migration.sql"
      provides: "DocumentType enum extension, Document.is_restricted column + index, audit_log CHECK constraint update"
      contains: "ALTER TYPE \"DocumentType\""
    - path: "apps/web/src/lib/storage/restricted.ts"
      provides: "Restricted-aware key builder + presigned URL helper (15-min download, 5-min upload)"
      exports: ["RESTRICTED_DOCUMENT_TYPES", "isRestrictedDocumentType", "buildRestrictedS3Key", "generateRestrictedUploadUrl", "generateRestrictedDownloadUrl"]
      min_lines: 80
    - path: "apps/web/src/lib/security/restricted-document-access.ts"
      provides: "requireRestrictedDocumentAccess(documentId, userId) — RBAC + audit + presigned URL"
      exports: ["requireRestrictedDocumentAccess", "RestrictedAccessResult"]
      min_lines: 80
    - path: "apps/web/src/lib/security/audit-log.ts"
      provides: "writeAuditLog helper used by restricted document flow"
      exports: ["writeAuditLog", "AuditAction"]
    - path: "apps/web/tests/security/restricted-documents.test.ts"
      provides: "Vitest integration suite covering all 7 truths"
      contains: "DOWNLOAD_DOCUMENT_DENIED"
      min_lines: 200
  key_links:
    - from: "apps/web/src/app/api/documents/request-upload-url/route.ts"
      to: "apps/web/src/lib/storage/restricted.ts"
      via: "isRestrictedDocumentType(documentType) branch → generateRestrictedUploadUrl"
      pattern: "isRestrictedDocumentType"
    - from: "apps/web/src/app/api/documents/download-url/[id]/route.ts"
      to: "apps/web/src/lib/security/restricted-document-access.ts"
      via: "doc.isRestricted ? requireRestrictedDocumentAccess(...) : existing flow"
      pattern: "requireRestrictedDocumentAccess"
    - from: "apps/web/src/lib/security/restricted-document-access.ts"
      to: "audit_log table via prisma.auditLog.create"
      via: "writeAuditLog() inline before returning presigned URL"
      pattern: "prisma\\.auditLog\\.create|writeAuditLog"
    - from: "apps/web/src/app/(driver)/documents/document-list.tsx"
      to: "Restricted confirm dialog + Restricted badge + Lock icon"
      via: "isRestricted prop on Document + AlertDialog before fetch('/api/documents/download-url')"
      pattern: "isRestricted|Restricted"
---

<discovery_summary>
**Reasoning before plan (REQUIRED step done):**

1. **Document model:** `Document` model at `apps/web/prisma/schema.prisma:435` is the single web-portal document model. Key columns: `id` (UUID), `tenantId` (UUID), `truckId`, `routeId`, `driverId`, `loadId`, `fileName`, `s3Key`, `contentType`, `sizeBytes`, `uploadedBy`, `documentType` (`DocumentType?` enum), `expiryDate`, `notes`, `description`, `externalUrl`, `createdAt`, `updatedAt`. A parallel `CarrierDocument` model exists at line 2091 for carrier ops but the task scope is driver/admin sensitive docs (SSN/passport/CDL/etc.), so this plan targets `Document` only and leaves `CarrierDocument` untouched (constraint: do not break BOL/POD/rate-conf flow which lives partly in CarrierDocument).

2. **Storage abstraction:** `apps/web/src/lib/storage/presigned.ts` exports `generateUploadUrl(tenantId, category, fileId, fileName, contentType, fileSize)` and `generateDownloadUrl(s3Key)`. Current key pattern is `` `tenant-${tenantId}/${category}/${fileId}-${fileName}` `` (line 41). Upload expiry = 300s, download expiry = 3600s. Bucket comes from `getBucketName()` → `process.env.S3_BUCKET` (single bucket, Supabase Storage S3-compatible per project context). DocumentCategory union is `'trucks' | 'routes' | 'drivers' | 'support' | 'messages' | 'inspections'`.

3. **audit_log table:** ALREADY EXISTS — created in `apps/web/prisma/migrations/20260515_pii_encryption_pr1/migration.sql:18-55`. Has columns matching the spec exactly (id, tenant_id, user_id, action, resource_type, resource_id, field_name, ip_address INET, user_agent, created_at TIMESTAMPTZ(6)), append-only grants (REVOKE UPDATE,DELETE), RLS forced, all three required indexes. `AuditLog` Prisma model at `schema.prisma:3126`. BUT the existing CHECK constraint on `action` is: `('VIEW_PII','VIEW_PII_DENIED','DOWNLOAD_DOCUMENT','UPDATE_RESTRICTED','DELETE_RESTRICTED','EXPORT','RATE_LIMIT_HIT')` — it is **missing** `DOWNLOAD_DOCUMENT_DENIED`, which this plan needs. The migration in Task 1 must `ALTER TABLE audit_log DROP CONSTRAINT ... ADD CONSTRAINT` to include `DOWNLOAD_DOCUMENT_DENIED`.

**Three-sentence summary:** The web app has a single `Document` Prisma model with an existing `DocumentType` enum (`DRIVER_LICENSE`, `DRIVER_APPLICATION`, `GENERAL`, `RATE_CONFIRMATION`) and a storage helper at `apps/web/src/lib/storage/presigned.ts` that builds keys as `tenant-{tenantId}/{category}/{fileId}-{fileName}` with 5-min upload / 1-hour download expiries. The `audit_log` table from spec §4.5 already exists with full append-only RLS hardening from quick-347, but its action CHECK constraint must be extended to allow `DOWNLOAD_DOCUMENT_DENIED`. The existing role enum is `OWNER | MANAGER | DRIVER | SYSTEM_ADMIN` — there is no `DISPATCHER` role in the codebase today, so the RBAC helper gates restricted access at MANAGER+ (plus DRIVER for own docs) and documents the absence of DISPATCHER explicitly.
</discovery_summary>

<objective>
Harden the document upload + download flow for restricted PII document classes (SSN_CARD, PASSPORT, CDL_SCAN, MEDICAL_CARD, VOIDED_CHECK, W9, W4, I9) per DatabaseSecurity_MultiTenant_Spec_v1 §4.3 + §4.4, adapted for Supabase Storage (S3-compatible) instead of AWS KMS.

Purpose: Sensitive driver/employee PII documents must land on a separate `tenant-{tenantId}/restricted/...` storage prefix, use shorter (15-min) presigned download URLs, write an audit_log row on every access attempt (success AND denial), and enforce strict RBAC where DRIVERs see only their own restricted docs and lower-privilege roles are blocked. Non-restricted documents (BOL/POD/rate confirmation/receipts) flow unchanged.

Output: One Prisma migration + one new storage helper + one new security helper + audit helper + minimal touch on two existing API routes + two UI files + a full Vitest security suite. Audit log table already exists (quick-347); we extend its CHECK constraint only.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/prisma/schema.prisma
@apps/web/src/lib/storage/presigned.ts
@apps/web/src/lib/storage/s3-client.ts
@apps/web/src/app/api/documents/request-upload-url/route.ts
@apps/web/src/app/api/documents/download-url/[id]/route.ts
@apps/web/src/lib/auth/roles.ts
@apps/web/src/app/(driver)/documents/document-list.tsx
@apps/web/prisma/migrations/20260515_pii_encryption_pr1/migration.sql
@apps/web/tests/security/audit-log-isolation.test.ts
@docs/specs/DatabaseSecurity_MultiTenant_Spec_v1.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: DB migration — extend DocumentType enum, add Document.is_restricted, extend audit_log action CHECK</name>
  <files>
    apps/web/prisma/migrations/20260516100001_restricted_documents/migration.sql
    apps/web/prisma/schema.prisma
  </files>
  <action>
Apply schema changes via Supabase MCP `apply_migration` THEN write the matching `migration.sql` file (so the migration history stays in sync). The migration must be fully idempotent (`IF NOT EXISTS`, `DO $$ ... EXCEPTION WHEN duplicate_object ... $$`).

**Migration SQL (in order):**

1. Extend `DocumentType` enum with 8 new values. Postgres requires one ALTER per value, each guarded:
```sql
DO $$ BEGIN ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'SSN_CARD'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- repeat for: PASSPORT, CDL_SCAN, MEDICAL_CARD, VOIDED_CHECK, W9, W4, I9
```

2. Add `is_restricted` column on `"Document"` (note: schema uses PascalCase quoted table names — verify by inspecting actual table name; the Prisma `@@map` is absent on Document model, so the table is `"Document"`):
```sql
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS is_restricted BOOLEAN NOT NULL DEFAULT FALSE;
```

3. Backfill `is_restricted` for any rows where `"documentType"` is one of the new restricted values (will be 0 rows on first deploy, but safe):
```sql
UPDATE "Document" SET is_restricted = TRUE
WHERE "documentType" IN ('SSN_CARD','PASSPORT','CDL_SCAN','MEDICAL_CARD','VOIDED_CHECK','W9','W4','I9')
  AND is_restricted = FALSE;
```

4. Composite index on `(tenantId, is_restricted)` with optional deletedAt clause. **Document model has no `deletedAt` column today** (confirmed by reading schema.prisma:435-470), so create a simpler index — do NOT add a soft-delete column in this task (out of scope, would touch unrelated flows):
```sql
CREATE INDEX IF NOT EXISTS document_tenant_restricted_idx
  ON "Document" ("tenantId", is_restricted)
  WHERE is_restricted = TRUE;
```
Partial index keeps it cheap (only restricted rows indexed).

5. Extend `audit_log.action` CHECK constraint to include `DOWNLOAD_DOCUMENT_DENIED` (existing constraint from quick-347 omits it):
```sql
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check CHECK (action IN (
  'VIEW_PII','VIEW_PII_DENIED','DOWNLOAD_DOCUMENT','DOWNLOAD_DOCUMENT_DENIED',
  'UPDATE_RESTRICTED','DELETE_RESTRICTED','EXPORT','RATE_LIMIT_HIT'
));
```

**Then update `apps/web/prisma/schema.prisma`:**
- Extend `DocumentType` enum (lines 71-76) with the 8 new values.
- Add to `Document` model (line 435): `isRestricted Boolean @default(false) @map("is_restricted")` and `@@index([tenantId, isRestricted], name: "document_tenant_restricted_idx")`.
- Run `cd apps/web && npx prisma generate` to refresh the generated client.

**Why this design:**
- Partial index (`WHERE is_restricted = TRUE`) instead of full `(tenant_id, is_restricted, deleted_at)` — Document has no `deletedAt` and adding one is out of scope. The partial index satisfies the spec's intent (fast lookup of restricted docs per tenant) at lower storage cost.
- Single migration file keeps the change atomic.
- TODO comment in the migration header: "Per-tenant BYOK / CMK is future work; this milestone uses Supabase Storage default AES-256 encryption-at-rest on a dedicated `/restricted/` prefix."

**DO NOT:**
- Touch `CarrierDocument` table or `CarrierDocumentType`.
- Modify driver_pay_audit_logs (different table, different scope).
- Add a `deletedAt` column to Document.
  </action>
  <verify>
1. Migration applies cleanly: `cd apps/web && npx prisma migrate status` shows the new migration as applied.
2. Schema parses: `cd apps/web && npx prisma validate` exits 0.
3. Generated client has new types: `grep -q "SSN_CARD" apps/web/src/generated/prisma/index.d.ts`.
4. Re-running the migration SQL via Supabase MCP is idempotent (no errors on second run).
5. `psql ... -c "\d \"Document\""` shows `is_restricted boolean default false NOT NULL`.
6. `psql ... -c "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='audit_log_action_check';"` returns a definition containing `DOWNLOAD_DOCUMENT_DENIED`.
  </verify>
  <done>
- Migration file exists at `apps/web/prisma/migrations/20260516100001_restricted_documents/migration.sql` and is applied to the Supabase project.
- `DocumentType` Prisma enum contains all 8 new values.
- `Document.isRestricted` boolean column exists in DB + Prisma model + generated client.
- Partial index `document_tenant_restricted_idx` exists.
- `audit_log` CHECK constraint allows `DOWNLOAD_DOCUMENT_DENIED`.
- `npx prisma validate` passes.
  </done>
</task>

<task type="auto">
  <name>Task 2: Storage helpers — restricted key builder + 15-min/5-min presigned URL helpers</name>
  <files>
    apps/web/src/lib/storage/restricted.ts
    apps/web/src/lib/storage/presigned.ts
  </files>
  <action>
**Create new file `apps/web/src/lib/storage/restricted.ts`:**

```typescript
/**
 * Restricted-document storage helpers (spec §4.3 + §4.4, Supabase-adapted).
 *
 * Restricted documents land under tenant-{tenantId}/restricted/... with
 * shorter presigned URL expiries. Default AES-256 encryption-at-rest is
 * provided by Supabase Storage; per-tenant BYOK/CMK is future work.
 *
 * TODO(security): Migrate to per-tenant customer-managed keys when Supabase
 * Storage adds BYOK support (currently bucket-wide AES-256 only).
 */
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client, getBucketName } from './s3-client';
import { DocumentType } from '@/generated/prisma';

export const RESTRICTED_DOCUMENT_TYPES = [
  'SSN_CARD','PASSPORT','CDL_SCAN','MEDICAL_CARD',
  'VOIDED_CHECK','W9','W4','I9',
] as const satisfies readonly DocumentType[];

export type RestrictedDocumentType = (typeof RESTRICTED_DOCUMENT_TYPES)[number];

export function isRestrictedDocumentType(t: DocumentType | null | undefined): t is RestrictedDocumentType {
  return !!t && (RESTRICTED_DOCUMENT_TYPES as readonly string[]).includes(t);
}

export const RESTRICTED_UPLOAD_EXPIRY_SECONDS = 300;   // 5 min
export const RESTRICTED_DOWNLOAD_EXPIRY_SECONDS = 900; // 15 min (spec §4.4)

/**
 * Build the restricted S3 key. driverId is optional — when present, doc lives
 * under that driver's subfolder; otherwise under `_org`.
 */
export function buildRestrictedS3Key(args: {
  tenantId: string;
  driverId: string | null | undefined;
  fileId: string;
  sanitizedFileName: string;
}): string {
  const subfolder = args.driverId ? args.driverId : '_org';
  return `tenant-${args.tenantId}/restricted/${subfolder}/${args.fileId}-${args.sanitizedFileName}`;
}

export function isRestrictedKey(s3Key: string, tenantId: string): boolean {
  return s3Key.startsWith(`tenant-${tenantId}/restricted/`);
}

export async function generateRestrictedUploadUrl(args: {
  tenantId: string;
  driverId: string | null | undefined;
  fileId: string;
  fileName: string;
  contentType: string;
}): Promise<{ uploadUrl: string; s3Key: string }> {
  const sanitizedFileName = args.fileName.replace(/[/\\]/g, '-');
  const s3Key = buildRestrictedS3Key({ ...args, sanitizedFileName });

  // Runtime invariant — defense in depth (spec §4.3: "ALWAYS land under /restricted/")
  if (!isRestrictedKey(s3Key, args.tenantId)) {
    throw new Error(`Restricted upload rejected: computed key ${s3Key} does not start with tenant-${args.tenantId}/restricted/`);
  }

  const command = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: s3Key,
    ContentType: args.contentType,
  });
  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: RESTRICTED_UPLOAD_EXPIRY_SECONDS });
  return { uploadUrl, s3Key };
}

export async function generateRestrictedDownloadUrl(s3Key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: getBucketName(),
    Key: s3Key,
    ResponseContentDisposition: 'inline',
  });
  return getSignedUrl(s3Client, command, { expiresIn: RESTRICTED_DOWNLOAD_EXPIRY_SECONDS });
}
```

**Edit `apps/web/src/lib/storage/presigned.ts`:**
- Add a JSDoc note at the top: "For restricted document types (SSN_CARD, PASSPORT, CDL_SCAN, MEDICAL_CARD, VOIDED_CHECK, W9, W4, I9) use `./restricted.ts` instead — it enforces the `/restricted/` prefix and shorter expiry."
- No behavior change to `generateUploadUrl` / `generateDownloadUrl` / `deleteS3Object`.

**DO NOT:**
- Modify `generateUploadUrl` or `generateDownloadUrl` body (non-restricted flow must stay byte-identical).
- Re-export restricted helpers from `presigned.ts` (keep them separate so callers must explicitly opt-in).
  </action>
  <verify>
1. `cd apps/web && npx tsc --noEmit` passes.
2. `apps/web/src/lib/storage/restricted.ts` exports all 5 named symbols from the must_haves list.
3. Manual sanity: `buildRestrictedS3Key({tenantId:'t1',driverId:'d1',fileId:'f1',sanitizedFileName:'ssn.pdf'})` returns `tenant-t1/restricted/d1/f1-ssn.pdf`.
4. Manual sanity: `buildRestrictedS3Key({tenantId:'t1',driverId:null,fileId:'f1',sanitizedFileName:'w9.pdf'})` returns `tenant-t1/restricted/_org/f1-w9.pdf`.
5. Grep confirms expiry constant: `grep -q "RESTRICTED_DOWNLOAD_EXPIRY_SECONDS = 900" apps/web/src/lib/storage/restricted.ts`.
  </verify>
  <done>
- `restricted.ts` exists with isRestrictedDocumentType type guard, buildRestrictedS3Key, generateRestrictedUploadUrl (5-min expiry, runtime prefix check), generateRestrictedDownloadUrl (15-min expiry).
- `presigned.ts` carries a JSDoc pointer to restricted.ts.
- TypeScript compiles, no new `any` introduced.
  </done>
</task>

<task type="auto">
  <name>Task 3: Audit log helper + restricted document access guard (RBAC + audit + presigned URL)</name>
  <files>
    apps/web/src/lib/security/audit-log.ts
    apps/web/src/lib/security/restricted-document-access.ts
  </files>
  <action>
**Create `apps/web/src/lib/security/audit-log.ts`:**

```typescript
import { prisma } from '@/lib/db/prisma';

export const AUDIT_ACTIONS = [
  'VIEW_PII','VIEW_PII_DENIED','DOWNLOAD_DOCUMENT','DOWNLOAD_DOCUMENT_DENIED',
  'UPDATE_RESTRICTED','DELETE_RESTRICTED','EXPORT','RATE_LIMIT_HIT',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditLogInput {
  tenantId: string;
  userId: string;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  fieldName?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Append a row to audit_log. Inline write — acceptable <5ms cost for security-
 * critical paths (documented in spec §4.5 trade-off). Caller MUST await this
 * before returning a presigned URL or any sensitive payload.
 */
export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      fieldName: input.fieldName ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}
```

(Use whatever path the existing prisma client is imported from — check `apps/web/src/lib/db/` for the correct import; in this codebase grep `from '@/lib/db/prisma'` to confirm before writing.)

**Create `apps/web/src/lib/security/restricted-document-access.ts`:**

```typescript
import { prisma } from '@/lib/db/prisma';
import { UserRole } from '@/lib/auth/roles';
import { generateRestrictedDownloadUrl, isRestrictedKey } from '@/lib/storage/restricted';
import { writeAuditLog } from './audit-log';

export type RestrictedAccessResult =
  | { ok: true; downloadUrl: string; fileName: string; expiresInSeconds: 900 }
  | { ok: false; status: 403 | 404; error: string };

export interface RestrictedAccessRequest {
  documentId: string;
  userId: string;
  userRole: UserRole;
  tenantId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Gate restricted document downloads.
 *
 * RBAC matrix (spec §4.4, adapted — no DISPATCHER role exists in DriveCommand;
 * gate at MANAGER+ and the absence of DISPATCHER is the de-facto block):
 *   - SYSTEM_ADMIN / OWNER / MANAGER → allowed for any document in their tenant
 *   - DRIVER                          → allowed ONLY for documents where driverId === userId
 *   - (no DISPATCHER role today)      → if added later, gate explicitly here
 *
 * Cross-tenant access → 404 (no information leak), audit row DOWNLOAD_DOCUMENT_DENIED
 * in caller's tenant.
 *
 * The audit_log row is written BEFORE the presigned URL is returned.
 */
export async function requireRestrictedDocumentAccess(
  req: RestrictedAccessRequest
): Promise<RestrictedAccessResult> {
  // Use bypass-RLS read because we MUST classify cross-tenant attempts as 404
  // (with audit row in caller's tenant). A tenant-scoped query would already
  // 404 silently and we'd miss the audit row. Use the project's existing
  // bypass extension pattern from apps/web/src/lib/db/extensions/.
  const doc = await prisma.document.findUnique({
    where: { id: req.documentId },
    select: { id: true, tenantId: true, driverId: true, fileName: true, s3Key: true, isRestricted: true, documentType: true },
  });

  const auditBase = {
    tenantId: req.tenantId,
    userId: req.userId,
    resourceType: 'document',
    resourceId: req.documentId,
    ipAddress: req.ipAddress ?? null,
    userAgent: req.userAgent ?? null,
  };

  // Not found OR wrong tenant → 404 (no info leak) + audit denial in caller's tenant
  if (!doc || doc.tenantId !== req.tenantId) {
    await writeAuditLog({ ...auditBase, action: 'DOWNLOAD_DOCUMENT_DENIED', fieldName: 'cross_tenant_or_missing' });
    return { ok: false, status: 404, error: 'Document not found' };
  }

  // Document is not actually restricted — caller should use the normal flow.
  // Treat as a configuration error from the caller, return 404 to be safe.
  if (!doc.isRestricted) {
    return { ok: false, status: 404, error: 'Document not found' };
  }

  // Defense-in-depth: refuse if key is malformed
  if (!doc.s3Key || !isRestrictedKey(doc.s3Key, doc.tenantId)) {
    await writeAuditLog({ ...auditBase, action: 'DOWNLOAD_DOCUMENT_DENIED', fieldName: 'invalid_key' });
    return { ok: false, status: 403, error: 'Invalid restricted document key' };
  }

  // Role gate
  const isPrivileged =
    req.userRole === UserRole.SYSTEM_ADMIN ||
    req.userRole === UserRole.OWNER ||
    req.userRole === UserRole.MANAGER;
  const isOwnDriverDoc = req.userRole === UserRole.DRIVER && doc.driverId === req.userId;

  if (!isPrivileged && !isOwnDriverDoc) {
    await writeAuditLog({ ...auditBase, action: 'DOWNLOAD_DOCUMENT_DENIED', fieldName: `role:${req.userRole}` });
    return { ok: false, status: 403, error: 'Forbidden' };
  }

  // SUCCESS — write audit row BEFORE returning the URL.
  await writeAuditLog({ ...auditBase, action: 'DOWNLOAD_DOCUMENT', fieldName: doc.documentType ?? null });
  const downloadUrl = await generateRestrictedDownloadUrl(doc.s3Key);
  return { ok: true, downloadUrl, fileName: doc.fileName, expiresInSeconds: 900 };
}
```

**Important implementation notes:**
- Look up the project's existing prisma client import path (likely `@/lib/db/prisma` or similar — grep `from '.*prisma'` in `apps/web/src/lib/db/repositories/document.repository.ts` before writing).
- If the project uses an RLS-aware extension (`withTenantRLS` from `apps/web/src/lib/db/extensions/tenant-rls.ts` — seen in audit-log-isolation.test.ts:19), use the **bypass** flavor for the lookup ONLY so cross-tenant attempts are detectable. If a bypass helper exists (e.g., `prismaWithBypass`), use it; otherwise document the choice as: "Lookup uses unscoped client to enable cross-tenant 404 classification + audit row in caller's tenant."
- Strict TypeScript: no `any`. Use the generated `DocumentType` and `UserRole` enums.

**DO NOT:**
- Cache document lookups (audit must run every time).
- Catch/swallow audit failures — if the audit insert throws, propagate so the caller returns 500 and no URL leaks without an audit trail.
- Add this helper to existing routes yet (Task 5 wires it).
  </action>
  <verify>
1. `cd apps/web && npx tsc --noEmit` passes.
2. `grep -q "DOWNLOAD_DOCUMENT_DENIED" apps/web/src/lib/security/restricted-document-access.ts` returns three matches (cross-tenant, invalid-key, role-deny).
3. `grep -q "await writeAuditLog" apps/web/src/lib/security/restricted-document-access.ts` shows audit calls before every return.
4. `grep -q "expiresInSeconds: 900" apps/web/src/lib/security/restricted-document-access.ts` confirms the 15-min contract is part of the success shape.
  </verify>
  <done>
- `audit-log.ts` exports `writeAuditLog` + `AUDIT_ACTIONS` + `AuditAction` type.
- `restricted-document-access.ts` exports `requireRestrictedDocumentAccess` and `RestrictedAccessResult`.
- All four denial paths (cross-tenant 404, missing doc 404, invalid key 403, wrong role 403) write a `DOWNLOAD_DOCUMENT_DENIED` audit row before returning.
- The success path writes a `DOWNLOAD_DOCUMENT` audit row before returning the URL.
- No `any` types; TypeScript strict mode passes.
  </done>
</task>

<task type="auto">
  <name>Task 4: Wire restricted flow into upload + download API routes (non-restricted unchanged)</name>
  <files>
    apps/web/src/app/api/documents/request-upload-url/route.ts
    apps/web/src/app/api/documents/download-url/[id]/route.ts
    apps/web/src/lib/db/repositories/document.repository.ts
  </files>
  <action>
**A. Edit `apps/web/src/app/api/documents/request-upload-url/route.ts`:**

1. Extend the request body parsing to accept `documentType?: DocumentType` and `driverId?: string` (optional — only required when restricted).
2. After the existing validation block, branch:
```typescript
import { isRestrictedDocumentType, generateRestrictedUploadUrl } from '@/lib/storage/restricted';
// ...
if (isRestrictedDocumentType(documentType)) {
  // Restricted route — bypass the category/entityType branch
  if (entityType !== 'driver' && !driverId) {
    // _org bucket allowed; just ensure tenant prefix is enforced inside the helper
  }
  const { uploadUrl, s3Key } = await generateRestrictedUploadUrl({
    tenantId,
    driverId: driverId ?? null,
    fileId,
    fileName: sanitizedFileName,
    contentType,
  });
  return NextResponse.json({
    uploadUrl, s3Key, fileId, fileName, contentType, sizeBytes,
    entityType, entityId, documentType, isRestricted: true,
  });
}
// else: existing non-restricted flow unchanged
```
3. Add `isRestricted: false` to the existing success response so the client knows for free which kind it got.

**B. Edit `apps/web/src/app/api/documents/download-url/[id]/route.ts`:**

1. Import the new guard:
```typescript
import { requireRestrictedDocumentAccess } from '@/lib/security/restricted-document-access';
```
2. Fetch the document once (existing repo call) and check `doc.isRestricted`. If true, switch to the new guard:
```typescript
if (doc.isRestricted) {
  const { user } = await getAuthContext(); // or whatever the existing pattern is — see other routes
  const result = await requireRestrictedDocumentAccess({
    documentId: doc.id,
    userId: user.id,
    userRole: user.role,
    tenantId,
    ipAddress: req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? null,
    userAgent: req.headers.get('user-agent') ?? null,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({
    downloadUrl: result.downloadUrl,
    fileName: result.fileName,
    isRestricted: true,
    expiresInSeconds: result.expiresInSeconds,
  });
}
// existing non-restricted flow unchanged below
```
3. **Important:** The existing route reads role from `requireRole([OWNER, MANAGER, DRIVER])`. Look up the actual `getAuthContext`/`getSession` pattern by reading 1-2 other routes (e.g. `apps/web/src/app/api/driver/stops/[stopId]/documents/route.ts`) and reuse it. Do not invent a new auth helper.

**C. Edit `apps/web/src/lib/db/repositories/document.repository.ts`:**

1. Add `isRestricted` to the default `select` projection so the route gets it without an extra query. Just one line — find the existing `findById` and add `isRestricted: true` to its select clause (or remove an explicit select to use the default which now includes the column after `prisma generate`).
2. Add an optional `create` overload that accepts `documentType` and derives `isRestricted` server-side:
```typescript
import { isRestrictedDocumentType } from '@/lib/storage/restricted';
// inside create() or a new method `createWithRestrictedDerivation`:
const isRestricted = isRestrictedDocumentType(input.documentType);
return this.prisma.document.create({ data: { ...input, isRestricted } });
```
   If no `create` method exists on the repo, add a free function or extend the create path used by the upload-complete handler. Check `apps/web/src/app/api/documents/` and `apps/web/src/actions/` for the existing "save document metadata after upload" path and ensure `isRestricted` is derived there.

**Constraints:**
- The non-restricted code path through `generateUploadUrl` and `generateDownloadUrl` must remain BYTE-IDENTICAL. Diff each route surgically.
- Reuse the existing rate limiter, error logger, and auth pattern.
- Do not break: `apps/web/src/app/(owner)/actions/documents.ts`, `apps/web/src/app/(driver)/actions/driver-documents.ts`, mobile `apps/web/src/app/api/mobile/driver/documents/upload-url/route.ts` (mobile route is out of scope for this task, but verify it still compiles).

**DO NOT:**
- Modify `apps/web/src/lib/storage/presigned.ts` behavior.
- Touch carrier document upload routes (`apps/web/src/app/api/driver/stops/[stopId]/documents/route.ts` carrier path).
- Touch `apps/web/src/app/api/support/upload-attachment/route.ts`.
  </action>
  <verify>
1. `cd apps/web && npx tsc --noEmit` passes.
2. Manual smoke (mock test): POST `/api/documents/request-upload-url` with `documentType: 'SSN_CARD'` returns a `s3Key` starting with `tenant-${tenantId}/restricted/`.
3. Manual smoke: POST with `documentType: 'GENERAL'` returns the legacy `tenant-${tenantId}/trucks/...` or `routes/...` key (unchanged).
4. `grep -q "isRestricted: true" apps/web/src/app/api/documents/download-url/\[id\]/route.ts` confirms the wired branch.
5. `grep -q "isRestrictedDocumentType" apps/web/src/lib/db/repositories/document.repository.ts` confirms the create-side derivation.
6. Existing tests still pass: `cd apps/web && npx vitest run tests/security/audit-log-isolation.test.ts`.
  </verify>
  <done>
- Restricted document type in upload request routes to `generateRestrictedUploadUrl` and returns `isRestricted: true`.
- Restricted document download routes through `requireRestrictedDocumentAccess` (which writes audit row + 15-min URL).
- Non-restricted upload + download paths produce identical output to before this task.
- `Document.isRestricted` is derived from `documentType` automatically in the repo create path.
- TypeScript strict mode passes; no `any` introduced.
  </done>
</task>

<task type="auto">
  <name>Task 5: UI updates — Lock icon, Restricted badge, confirm dialog, role-based disable</name>
  <files>
    apps/web/src/app/(driver)/documents/document-list.tsx
    apps/web/src/app/(owner)/components/RestrictedDocumentDownloadButton.tsx
  </files>
  <action>
**A. Edit `apps/web/src/app/(driver)/documents/document-list.tsx`:**

1. Extend the `Document` interface inside the file to include `isRestricted: boolean` and `driverId: string | null`.
2. Import `Lock` from `lucide-react` (already used elsewhere — no new deps).
3. Where `formatDocumentType` is called or the document row is rendered, conditionally render:
   - A small `Lock` icon (12px) inline before the type label when `isRestricted` is true.
   - A `Badge` with variant `destructive` text `"Restricted"` next to the row when `isRestricted` is true.
4. Add a confirm dialog using the shared `AlertDialog` component (look up the import path — likely `@/components/ui/alert-dialog`; the project already uses shadcn): before triggering the download fetch, if `isRestricted` is true, open the dialog with body text:
   > **This download will be recorded in the access log.**
   > A timestamped record of who accessed this document will be created. Continue?
   Buttons: **Cancel** / **Continue**. Only on Continue do we call `fetch('/api/documents/download-url/${id}')`.
5. Add an `aria-label` to the row that includes the word "Restricted" for screen readers when applicable.

**B. Create `apps/web/src/app/(owner)/components/RestrictedDocumentDownloadButton.tsx`:**

A small shared client component that:
- Accepts `documentId`, `fileName`, `isRestricted`, and an optional `currentUserRole` prop (`UserRole`).
- Renders the existing download button.
- If `isRestricted && currentUserRole` is a role that should be disabled (per the task description: DISPATCHER would be — note in code that no DISPATCHER role exists today so this is forward-compat) → render disabled button with tooltip "Restricted documents require Manager+ access".
- Wraps the click handler with the same confirm dialog from the driver list.

This file is created NEW (no existing owner-side document list to edit invasively). Wire-up to the owner pages is out of scope for this task — file exists so future owner UI work can adopt it.

**C. Mobile check (per task description item 9):**
The task description asks: "check if apps/mobile/ has document upload flow; if yes mirror UI changes; if no skip."

Discovery confirmed: `apps/mobile/components/driver/DocumentUploadSheet.tsx` and `DocumentDetailSheet.tsx` EXIST. **Defer mobile UI mirroring to a follow-up quick task** — rationale documented inline in the PLAN summary: this task is already large (DB + storage + security + API + web UI + tests) and mobile mirroring would push it past the ~40% context budget. The mobile screens will continue to function (server enforces RBAC + 15-min expiry regardless of which client requests the URL); they just won't show the Lock icon / confirm dialog until a follow-up. **Add a TODO comment in `apps/mobile/components/driver/DocumentUploadSheet.tsx`** saying:
```
// TODO(quick-348-followup): Mirror Lock icon + Restricted badge + confirm dialog
// from apps/web/src/app/(driver)/documents/document-list.tsx for restricted DocumentTypes.
```

**DO NOT:**
- Add new npm packages.
- Refactor any unrelated UI in document-list.tsx.
- Wire the new RestrictedDocumentDownloadButton into owner pages (out of scope).
- Modify the BOL/POD/rate-confirmation UI (CarrierDocument-driven UI).
  </action>
  <verify>
1. `cd apps/web && npx tsc --noEmit` passes.
2. Visual diff of `document-list.tsx`: Lock icon shown on restricted rows; Badge with "Restricted" label renders.
3. Confirm dialog opens before `fetch('/api/documents/download-url')` on restricted rows (manual test by setting `isRestricted: true` in mock data, or assert via a small RTL/Vitest component test if time permits — optional, not blocking).
4. `grep -q "TODO(quick-348-followup)" apps/mobile/components/driver/DocumentUploadSheet.tsx` confirms the mobile follow-up note.
5. No new dependencies in `apps/web/package.json` (`git diff apps/web/package.json` shows no changes).
  </verify>
  <done>
- Driver documents list renders Lock icon + Restricted badge + confirm dialog for restricted rows.
- `RestrictedDocumentDownloadButton.tsx` exists as a reusable component for future owner UI.
- Mobile follow-up TODO is logged; no mobile code regression.
- Non-restricted rows render exactly as before.
  </done>
</task>

<task type="auto">
  <name>Task 6: Vitest security suite — restricted-documents.test.ts (full coverage of all 7 truths)</name>
  <files>
    apps/web/tests/security/restricted-documents.test.ts
  </files>
  <action>
Create `apps/web/tests/security/restricted-documents.test.ts` modeled on the existing `apps/web/tests/security/audit-log-isolation.test.ts` and `apps/web/tests/isolation/setup.ts` patterns (read those two files first to match conventions).

**Test cases (all required by task description item 10):**

1. **`is_restricted derived correctly`** (unit-style, no HTTP):
   - Create a Document row with `documentType: 'SSN_CARD'` via the repository create path → assert `isRestricted === true`.
   - Create with `documentType: 'GENERAL'` → assert `isRestricted === false`.

2. **`buildRestrictedS3Key produces the right prefix`** (unit):
   - With driverId → `tenant-{t}/restricted/{driverId}/{fileId}-{fileName}`.
   - Without driverId → `tenant-{t}/restricted/_org/{fileId}-{fileName}`.

3. **`URL expiry <= 900 seconds`** (unit):
   - Call `generateRestrictedDownloadUrl(key)`; parse the returned URL's `X-Amz-Expires` query param; assert `<= 900`.
   - Call `generateRestrictedUploadUrl(...)`; assert `X-Amz-Expires <= 300`.

4. **`Cross-tenant access → 404 + audit row`** (integration with DB):
   - Seed tenant A with a restricted doc (driver in tenant A). Seed user X in tenant B.
   - Call `requireRestrictedDocumentAccess({ documentId: docA.id, userId: X.id, userRole: OWNER, tenantId: B.id })`.
   - Assert result is `{ ok: false, status: 404 }`.
   - Assert exactly one `audit_log` row exists with `tenantId=B.id, userId=X.id, action='DOWNLOAD_DOCUMENT_DENIED', resourceType='document', resourceId=docA.id`.

5. **`Driver isolation → 403 + audit row`**:
   - Two drivers in same tenant A. Driver1 owns a restricted doc. Call guard as Driver2.
   - Assert `{ ok: false, status: 403 }`.
   - Assert `audit_log` row with `action='DOWNLOAD_DOCUMENT_DENIED', fieldName='role:DRIVER'`.

6. **`Manager allowed → 200 + URL + audit row`**:
   - Manager in tenant A requests Driver1's restricted doc.
   - Assert `{ ok: true, downloadUrl: string, expiresInSeconds: 900 }`.
   - Assert URL contains `X-Amz-Expires=900`.
   - Assert `audit_log` row with `action='DOWNLOAD_DOCUMENT', fieldName='SSN_CARD'`.

7. **`Owner allowed`** + **`SystemAdmin allowed`** (parameterized — quick variants of #6).

8. **`Driver can access own restricted doc`**:
   - Driver1 requesting Driver1's own restricted doc → `{ ok: true, ... }` + `audit_log` `action='DOWNLOAD_DOCUMENT'`.

9. **`DISPATCHER (placeholder — does not exist today)`**:
   - Skip this case with a TODO comment noting the role does not exist in UserRole enum. The role-mismatch fallback path is exercised by case #5.

10. **`audit_log append-only invariant`**:
    - Try `prisma.$executeRaw\`UPDATE audit_log SET action='X' WHERE id=$1\`` as `app_user` → expect throw (no privilege). Or use `has_table_privilege` like the existing audit-log-isolation test.
    - This may already be covered by `audit-log-isolation.test.ts` — if so, link via a comment and just re-assert the CHECK constraint accepts `DOWNLOAD_DOCUMENT_DENIED` (was missing before this plan's migration).

**Patterns to follow:**
- Use `withTenantRLS` and the test setup helpers `createTestTenant`, `createTestUser`, `cleanupTestData`, `disconnectPrisma` from `apps/web/tests/isolation/setup.ts`.
- Wrap the whole describe in `hasDatabase ? describe : describe.skip` exactly like the existing test (line 28-29).
- Skip the test file when `DATABASE_URL` is not set (same pattern).
- Use `bypass_rls` SET LOCAL when seeding cross-tenant rows.

**Constraints:**
- TypeScript strict, no `any`.
- Tests must clean up after themselves (`afterAll(cleanupTestData)`).
- Do NOT add fake/mock S3 — call the real `generateRestrictedDownloadUrl` (it does not hit S3; it only signs).
  </action>
  <verify>
1. `cd apps/web && npx vitest run tests/security/restricted-documents.test.ts` passes when `DATABASE_URL` is set. (If running in CI without DB, suite is skipped.)
2. `cd apps/web && npx tsc --noEmit` passes.
3. All 7 truth statements from must_haves have at least one test asserting them (grep the truth keywords in the test file).
4. Test file is `>= 200 lines` (must_haves min_lines requirement).
5. Running the full security folder does not break existing tests: `cd apps/web && npx vitest run tests/security/`.
  </verify>
  <done>
- `apps/web/tests/security/restricted-documents.test.ts` exists with all listed cases.
- All tests pass against the migrated DB.
- Existing security tests (`audit-log-isolation.test.ts`, `carrier-driver-pii.test.ts`, `field-crypto.test.ts`) still pass.
- No tests were removed or modified.
  </done>
</task>

</tasks>

<verification>
End-to-end manual smoke (run after all tasks complete):

1. **Upload restricted:** POST `/api/documents/request-upload-url` with `{ entityType:'driver', entityId:'<driverId>', fileName:'ssn.pdf', contentType:'application/pdf', sizeBytes:1024, documentType:'SSN_CARD', driverId:'<driverId>' }` → response contains `s3Key` matching `^tenant-[a-f0-9-]+/restricted/[a-f0-9-]+/[a-zA-Z0-9_-]+-ssn\.pdf$` and `isRestricted: true`.

2. **Upload non-restricted (regression):** Same call without `documentType` → response `s3Key` matches `^tenant-.../trucks/...` (existing pattern), `isRestricted: false`.

3. **Download restricted as Manager:** GET `/api/documents/download-url/<restrictedDocId>` → 200, `expiresInSeconds: 900`, URL `X-Amz-Expires=900`. Verify `audit_log` row exists: `SELECT action, field_name FROM audit_log WHERE resource_id='<docId>' ORDER BY created_at DESC LIMIT 1` → returns `('DOWNLOAD_DOCUMENT', 'SSN_CARD')`.

4. **Download restricted cross-tenant:** Same call but signed in as user in different tenant → 404, audit row `DOWNLOAD_DOCUMENT_DENIED` exists in **caller's** tenant.

5. **Download non-restricted (regression):** GET `/api/documents/download-url/<nonRestrictedDocId>` → 200, URL `X-Amz-Expires=3600` (unchanged 1-hour expiry).

6. **Driver UI:** Sign in as driver with at least one restricted doc — Lock icon shows on the SSN row, "Restricted" badge shows, clicking download opens the confirm dialog.

7. **TypeScript:** `cd apps/web && npx tsc --noEmit` exits 0.

8. **Tests:** `cd apps/web && npx vitest run tests/security/` — all green.

9. **Prisma:** `cd apps/web && npx prisma migrate status` → migration `20260516100001_restricted_documents` applied.

10. **No regression in carrier flow:** Open `/owner/carrier/clients/[id]` page and verify a BOL/POD document still uploads and downloads normally (this exercises the untouched `CarrierDocument` flow).
</verification>

<success_criteria>
- Restricted uploads land under `tenant-{tenantId}/restricted/` prefix (runtime-enforced by `generateRestrictedUploadUrl` throwing if not).
- Restricted download presigned URLs expire in exactly 900 seconds; upload URLs in 300 seconds.
- Every restricted download write attempts an `audit_log` row BEFORE returning the URL; denial paths write `DOWNLOAD_DOCUMENT_DENIED`, success path writes `DOWNLOAD_DOCUMENT`.
- RBAC enforced: DRIVER restricted access limited to own docs; MANAGER/OWNER/SYSTEM_ADMIN allowed for any tenant doc; cross-tenant → 404 (no leak).
- `is_restricted` column is automatically derived from `documentType` in the create path.
- Non-restricted document flow (BOL/POD/rate confirmation/receipts) is unchanged — verified by:
  - `git diff apps/web/src/lib/storage/presigned.ts` shows only JSDoc additions, no body changes.
  - Existing tests pass.
  - Carrier document UI still functions.
- Vitest security suite at `apps/web/tests/security/restricted-documents.test.ts` exercises all 7 truths and passes.
- `npx tsc --noEmit` passes with no `any` introduced.
- Mobile follow-up logged with TODO comment in `DocumentUploadSheet.tsx`.
- DocumentType enum extended with 8 new values; audit_log CHECK constraint extended with DOWNLOAD_DOCUMENT_DENIED.
</success_criteria>

<output>
After completion, create `.planning/quick/348-harden-document-upload-system-for-restri/348-SUMMARY.md` documenting:
- Migration applied + ID
- New storage helper API
- New security helper API and RBAC matrix
- Non-restricted flow byte-identical confirmation
- Test results
- Mobile follow-up TODO reference
</output>

---
phase: 18-driver-document-uploads
plan: 01
subsystem: driver-documents
tags: [storage, database, multipart-upload, compliance]
dependency_graph:
  requires: [phase-17]
  provides: [driver-document-schema, multipart-upload-api, driver-document-crud]
  affects: [Document-model, storage-layer, validation-schemas]
tech_stack:
  added: [multipart-upload-orchestration, DocumentType-enum]
  patterns: [defense-in-depth-s3-validation, presigned-urls-per-part, abort-on-failure]
key_files:
  created:
    - src/lib/storage/multipart.ts
    - src/app/api/documents/multipart/initiate/route.ts
    - src/app/api/documents/multipart/part-url/route.ts
    - src/app/api/documents/multipart/complete/route.ts
    - src/app/(owner)/actions/driver-documents.ts
  modified:
    - prisma/schema.prisma
    - src/lib/storage/presigned.ts
    - src/lib/storage/validate.ts
    - src/lib/validations/document.schemas.ts
    - src/lib/db/repositories/document.repository.ts
decisions:
  - Use DocumentType enum only for driver documents (DRIVER_LICENSE, DRIVER_APPLICATION, GENERAL) - existing truck documents use JSONB metadata to avoid migration complexity
  - Increase MAX_FILE_SIZE from 10MB to 100MB to support large scanned compliance PDFs
  - Implement multipart upload using presigned URLs per part (client uploads directly to R2) rather than server-side streaming
  - Enforce defense-in-depth s3Key validation in 4 locations (tenant prefix + drivers category check)
  - Abort multipart upload on validation failure to prevent orphaned parts in R2
  - Make all new Document fields optional for backwards compatibility with existing truck/route documents
metrics:
  duration: 373s
  tasks_completed: 2
  files_created: 5
  files_modified: 5
  commits: 2
  completed_date: 2026-02-17T01:39:49Z
---

# Phase 18 Plan 01: Driver Document Storage Foundation Summary

Extended database schema, storage layer, and server actions to support driver document uploads with multipart upload for large files (50-100MB) and expiry tracking metadata.

## What Was Built

### Database Schema Extensions

Added `DocumentType` enum with three values:
- `DRIVER_LICENSE` - Driver's license documents
- `DRIVER_APPLICATION` - Driver application forms
- `GENERAL` - Miscellaneous driver documents

Extended `Document` model with optional fields (backwards compatible):
- `driverId` - Optional driver ownership
- `documentType` - Driver document categorization
- `expiryDate` - Compliance expiry tracking
- `notes` - Additional context (up to 500 characters)

Added indexes on `driverId` and `expiryDate` for query performance.

### Storage Layer Enhancements

**Multipart Upload Orchestration** (`src/lib/storage/multipart.ts`):
- `initiateMultipartUpload()` - Creates S3 multipart upload, returns uploadId and s3Key
- `getPartUploadUrl()` - Generates presigned URL for uploading a specific part (10-min expiry)
- `completeMultipartUpload()` - Completes upload after all parts uploaded
- `abortMultipartUpload()` - Cleans up orphaned parts on failure

**File Size Increase**:
- Raised `MAX_FILE_SIZE` from 10MB to 100MB to accommodate large scanned compliance PDFs

**Category Expansion**:
- Added `'drivers'` to `DocumentCategory` type alongside `'trucks'` and `'routes'`

### API Routes for Multipart Uploads

Created three POST endpoints under `/api/documents/multipart/`:

1. **`/initiate`** - Start multipart upload
   - Validates file metadata (size, type, entity)
   - Generates unique fileId with nanoid
   - Returns uploadId, s3Key, and totalParts

2. **`/part-url`** - Get presigned URL for part upload
   - Enforces tenant prefix + drivers category validation
   - Returns presigned URL (10-min expiry) for client to upload part directly

3. **`/complete`** - Finalize upload and save metadata
   - Completes multipart upload in S3
   - Validates document data with Zod schema
   - Creates database record via DocumentRepository
   - Aborts upload and cleans up on validation failure
   - Revalidates driver page

All routes enforce OWNER/MANAGER role authorization.

### Driver Document Server Actions

Created five server actions in `src/app/(owner)/actions/driver-documents.ts`:

1. **`requestDriverUploadUrl()`** - For small files (<5MB) using single PUT pattern
2. **`completeDriverDocumentUpload()`** - Save metadata after small file upload
3. **`listDriverDocuments()`** - List all documents for a driver (OWNER/MANAGER/DRIVER)
4. **`deleteDriverDocument()`** - Delete document from S3 and database (OWNER/MANAGER)
5. **`updateDriverDocument()`** - Edit expiry date, notes, or document type (OWNER/MANAGER)

### Validation Schema Updates

Extended `documentCreateSchema` with:
- Entity exclusivity check: exactly one of `[truckId, routeId, driverId]` must be set
- Driver document requirement: if `driverId` is set, `documentType` is required
- Expiry date coercion: accepts string input, converts to Date
- Notes max length: 500 characters

### Repository Extensions

Added to `DocumentRepository`:
- `findByDriverId()` - Query documents by driver with uploader details
- `update()` - Edit document metadata (expiry date, notes, document type)

## Technical Implementation

### Defense-in-Depth Security

Implemented s3Key validation in 4 locations to enforce tenant isolation:
1. `/api/documents/multipart/part-url` - Verifies `tenant-${tenantId}/drivers/` prefix
2. `/api/documents/multipart/complete` - Verifies prefix before completing upload
3. `completeDriverDocumentUpload()` - Verifies prefix when saving metadata
4. `deleteDriverDocument()` - Verifies prefix before deletion

This prevents cross-tenant document access even if authorization is bypassed.

### Multipart Upload Flow

**Client-side flow:**
1. Call `/api/documents/multipart/initiate` with file metadata → receive uploadId, s3Key
2. Split file into 5MB chunks (parts)
3. For each part: call `/api/documents/multipart/part-url` → receive presigned URL → upload part directly to R2 → collect ETag
4. Call `/api/documents/multipart/complete` with all part ETags → finalize upload and save metadata

**Server responsibilities:**
- Orchestrate multipart upload via S3 commands
- Generate presigned URLs for each part
- Validate s3Key tenant isolation
- Abort and cleanup on failure

**Client responsibilities:**
- Split file into chunks
- Upload parts directly to R2
- Track ETags from each part upload
- Handle retry logic for failed parts

### Backwards Compatibility

All new Document model fields are optional, ensuring existing truck and route documents continue to work without migration:
- Existing documents: `driverId = null`, `documentType = null`, `expiryDate = null`, `notes = null`
- New driver documents: All fields populated
- Schema change is additive only (no breaking changes)

## Deviations from Plan

None - plan executed exactly as written.

## Task Breakdown

### Task 1: Extend Document model, storage layer, and validation schemas
**Commit:** `536b139`
**Files modified:** 6 (prisma/schema.prisma, presigned.ts, validate.ts, multipart.ts, document.schemas.ts, document.repository.ts)

- Added `DocumentType` enum before Document model
- Extended Document model with 4 optional fields (driverId, documentType, expiryDate, notes)
- Added relation to User model via `driverDocuments` field
- Added indexes on driverId and expiryDate
- Increased MAX_FILE_SIZE to 100MB
- Added 'drivers' to DocumentCategory type
- Created multipart.ts with 4 orchestration functions
- Updated documentCreateSchema with entity exclusivity check and driver document requirement
- Added findByDriverId and update methods to DocumentRepository

### Task 2: Create multipart upload API routes and driver document server actions
**Commit:** `0fa84ff`
**Files created:** 4 (initiate/route.ts, part-url/route.ts, complete/route.ts, driver-documents.ts)

- Implemented POST /api/documents/multipart/initiate endpoint
- Implemented POST /api/documents/multipart/part-url endpoint with s3Key validation
- Implemented POST /api/documents/multipart/complete endpoint with abort-on-failure
- Created 5 driver document server actions (request upload URL, complete upload, list, delete, update)
- Enforced role-based auth (OWNER/MANAGER) in all routes and actions
- Added defense-in-depth s3Key validation in 4 locations

## Verification Results

All verification criteria passed:

1. `npx prisma db push` succeeded - schema migration applied
2. `npm run build` succeeded - no TypeScript compilation errors
3. `driverId` field confirmed in Document model (line 185, 200, 208 in schema.prisma)
4. `DocumentType` enum confirmed (line 71 in schema.prisma)
5. Defense-in-depth s3Key validation confirmed in 4 locations:
   - part-url/route.ts:35
   - complete/route.ts:58
   - driver-documents.ts:127 (completeDriverDocumentUpload)
   - driver-documents.ts:227 (deleteDriverDocument)
6. 4 multipart functions exported from multipart.ts
7. 3 API routes export POST handlers
8. 5 server actions exported from driver-documents.ts

## Dependencies Satisfied

**Requires:**
- Phase 17 (Unified Route View/Edit) - Complete

**Provides for Plan 02 (Upload UI):**
- Document model with driver support
- Multipart upload API routes for large files
- Driver document server actions for CRUD operations
- Validation schemas with driver document support

**Provides for Plan 03 (Expiry Notifications):**
- Document.expiryDate field with index for efficient queries
- DocumentType enum for filtering compliance-critical documents
- DocumentRepository.findByDriverId for querying driver documents

## Production Readiness

**Ready for UI integration:**
- Server actions provide form-compatible API (FormData input)
- Multipart upload API ready for client-side chunking library
- Validation schemas enforce data integrity
- Defense-in-depth security prevents tenant isolation bypass

**Monitoring considerations:**
- Log orphaned multipart uploads (failed before complete/abort)
- Track large file upload success/failure rates
- Alert on documents approaching expiry (Plan 03)

## Next Steps

**Plan 02 - Upload UI Components:**
- Build DriverDocumentUploadForm with file picker
- Implement chunked upload with progress bar for large files
- Create DriverDocumentsList table with expiry status badges
- Add edit/delete dialogs for document metadata

**Plan 03 - Expiry Notifications:**
- Query documents with expiryDate within 30 days
- Generate email notifications for expiring licenses
- Create dashboard widget showing upcoming expirations

## Self-Check

Verifying all claimed artifacts exist:

**Created files:**
- src/lib/storage/multipart.ts: FOUND
- src/app/api/documents/multipart/initiate/route.ts: FOUND
- src/app/api/documents/multipart/part-url/route.ts: FOUND
- src/app/api/documents/multipart/complete/route.ts: FOUND
- src/app/(owner)/actions/driver-documents.ts: FOUND

**Modified files:**
- prisma/schema.prisma: FOUND
- src/lib/storage/presigned.ts: FOUND
- src/lib/storage/validate.ts: FOUND
- src/lib/validations/document.schemas.ts: FOUND
- src/lib/db/repositories/document.repository.ts: FOUND

**Commits:**
- 536b139: FOUND (Task 1)
- 0fa84ff: FOUND (Task 2)

## Self-Check: PASSED

All files, commits, and exports verified. Plan executed successfully.

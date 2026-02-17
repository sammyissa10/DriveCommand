# Phase 18: Driver Document Uploads - Research

**Researched:** 2026-02-16
**Domain:** File upload system with multipart upload, document expiry tracking, and notifications
**Confidence:** HIGH

## Summary

Phase 18 extends the existing document storage system (Phase 6) to support driver-specific documents with expiry tracking and notifications. The codebase already has production-proven infrastructure for document uploads (Cloudflare R2, presigned URLs, magic byte validation), expiry notifications (cron jobs, email templates), and metadata patterns (JSONB fields on entities).

The primary technical challenge is implementing **multipart upload for large files (50-100MB PDFs)**, which requires different architecture than the existing single-PUT presigned URL pattern. Cloudflare R2 supports S3-compatible multipart upload but requires separate presigned URLs for each part (CreateMultipartUpload, UploadPart per chunk, CompleteMultipartUpload).

The secondary challenge is **extending the Document model** to support driver ownership (adding optional `driverId` field) and expiry metadata (adding `documentType`, `expiryDate`, `notes` fields) while maintaining backwards compatibility with existing truck/route documents.

**Primary recommendation:** Extend existing Document model with driver support and expiry tracking, implement multipart upload for files >5MB using `@aws-sdk/lib-storage` on server and XMLHttpRequest progress tracking on client, reuse existing notification infrastructure (Phase 9) with 30/60/90 day reminder intervals.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @aws-sdk/lib-storage | 3.x | Multipart upload to S3/R2 | Official AWS SDK for handling uploads >5MB with automatic chunking, retry, and progress tracking |
| @aws-sdk/client-s3 | 3.x (already installed) | S3-compatible operations for R2 | Already used in project for presigned URLs; multipart requires CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand |
| Prisma | 7.x (already installed) | Schema migration for Document model | Existing ORM; will extend Document model with optional driverId, documentType enum, expiryDate |
| Zod | 3.x (already installed) | Document validation schemas | Already used for document.schemas.ts; will add expiry date validation |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| XMLHttpRequest | Browser native | Upload progress tracking | For multipart upload progress on client (alternative to Axios; no new dependency) |
| date-fns | Already installed | Date formatting for expiry | Already used in project; for calculating 30/60/90 day reminder dates |
| React Hook Form | Already installed | File upload form with date picker | Already used project-wide for forms |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @aws-sdk/lib-storage | Custom chunking logic | lib-storage handles retry, parallelization, and edge cases automatically; custom solution prone to bugs |
| XMLHttpRequest progress | Axios onUploadProgress | Axios adds dependency and complexity; native XHR sufficient for progress tracking |
| Multipart for all files | Multipart for files >5MB only | <5MB files work well with existing single-PUT pattern; only large scanned documents need multipart |

**Installation:**
```bash
npm install @aws-sdk/lib-storage
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   ├── storage/
│   │   ├── presigned.ts           # Existing: single-PUT presigned URLs
│   │   ├── multipart.ts           # NEW: multipart upload orchestration
│   │   └── validate.ts            # Existing: magic byte validation (extend for 100MB limit)
│   ├── validations/
│   │   └── document.schemas.ts    # Extend: add driver support, documentType, expiryDate
│   ├── notifications/
│   │   └── check-expiring-driver-documents.ts  # NEW: query driver doc expiry (mirror check-expiring-documents.ts)
│   └── email/
│       └── send-driver-document-expiry-reminder.ts  # NEW: send driver doc notifications
├── app/
│   ├── (owner)/
│   │   ├── drivers/[id]/
│   │   │   └── driver-documents-section.tsx  # NEW: driver document list + upload
│   │   └── actions/
│   │       └── driver-documents.ts           # NEW: server actions for driver doc CRUD
│   └── api/
│       └── cron/send-reminders/route.ts      # Extend: add driver document expiry checks
└── components/
    └── documents/
        ├── document-upload.tsx               # Extend: add multipart support for large files
        └── document-upload-multipart.tsx     # NEW: multipart-specific upload component
```

### Pattern 1: Multipart Upload Server Orchestration
**What:** Server-side API routes to manage multipart upload lifecycle (initiate, generate part URLs, complete)
**When to use:** Files >5MB (configurable threshold)
**Example:**
```typescript
// Source: AWS SDK v3 documentation + Cloudflare R2 multipart docs

// lib/storage/multipart.ts
import {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client, bucket } from './s3-client';

export interface MultipartUploadSession {
  uploadId: string;
  s3Key: string;
  totalParts: number;
}

/**
 * Initiate multipart upload and return uploadId.
 * Client will use this to request presigned URLs for each part.
 */
export async function initiateMultipartUpload(
  tenantId: string,
  category: 'trucks' | 'routes' | 'drivers',
  fileId: string,
  fileName: string,
  contentType: string,
  totalParts: number
): Promise<MultipartUploadSession> {
  const s3Key = `tenant-${tenantId}/${category}/${fileId}-${fileName}`;

  const command = new CreateMultipartUploadCommand({
    Bucket: bucket,
    Key: s3Key,
    ContentType: contentType,
  });

  const response = await s3Client.send(command);

  return {
    uploadId: response.UploadId!,
    s3Key,
    totalParts,
  };
}

/**
 * Generate presigned URL for a specific part number.
 * Called once per chunk by the client.
 */
export async function getPartUploadUrl(
  s3Key: string,
  uploadId: string,
  partNumber: number
): Promise<string> {
  const command = new UploadPartCommand({
    Bucket: bucket,
    Key: s3Key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });

  // 10-minute expiry per part (longer than single upload due to network variability)
  return await getSignedUrl(s3Client, command, { expiresIn: 600 });
}

/**
 * Complete multipart upload after all parts uploaded.
 * Client provides ETag from each part's upload response.
 */
export async function completeMultipartUpload(
  s3Key: string,
  uploadId: string,
  parts: Array<{ PartNumber: number; ETag: string }>
): Promise<void> {
  const command = new CompleteMultipartUploadCommand({
    Bucket: bucket,
    Key: s3Key,
    UploadId: uploadId,
    MultipartUpload: { Parts: parts },
  });

  await s3Client.send(command);
}

/**
 * Abort multipart upload on error or user cancellation.
 * Cleans up orphaned parts in R2 storage.
 */
export async function abortMultipartUpload(
  s3Key: string,
  uploadId: string
): Promise<void> {
  const command = new AbortMultipartUploadCommand({
    Bucket: bucket,
    Key: s3Key,
    UploadId: uploadId,
  });

  await s3Client.send(command);
}
```

### Pattern 2: Client-Side Multipart Upload with Progress
**What:** React component that chunks file, uploads parts sequentially/parallel with retry, tracks progress
**When to use:** Large file uploads (50-100MB PDFs)
**Example:**
```typescript
// Source: React file upload best practices + XMLHttpRequest.upload API

// components/documents/document-upload-multipart.tsx
'use client';

import { useState } from 'react';

const PART_SIZE = 10 * 1024 * 1024; // 10MB per part (minimum 5MB for R2)

interface UploadProgress {
  uploadedBytes: number;
  totalBytes: number;
  currentPart: number;
  totalParts: number;
  percentage: number;
}

export function DocumentUploadMultipart({
  entityType,
  entityId,
  onUploadComplete,
}: {
  entityType: 'driver';
  entityId: string;
  onUploadComplete: () => void;
}) {
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const uploadFile = async (file: File) => {
    const totalParts = Math.ceil(file.size / PART_SIZE);
    let uploadedBytes = 0;

    try {
      // Step 1: Initiate multipart upload
      const initResult = await fetch('/api/documents/multipart/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          fileSize: file.size,
          entityType,
          entityId,
          totalParts,
        }),
      });

      const { uploadId, s3Key, fileId } = await initResult.json();

      // Step 2: Upload each part
      const uploadedParts: Array<{ PartNumber: number; ETag: string }> = [];
      const controller = new AbortController();
      setAbortController(controller);

      for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
        const start = (partNumber - 1) * PART_SIZE;
        const end = Math.min(start + PART_SIZE, file.size);
        const chunk = file.slice(start, end);

        // Get presigned URL for this part
        const urlResult = await fetch('/api/documents/multipart/part-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ s3Key, uploadId, partNumber }),
        });

        const { uploadUrl } = await urlResult.json();

        // Upload part with progress tracking
        const etag = await uploadPartWithProgress(
          uploadUrl,
          chunk,
          partNumber,
          totalParts,
          file.size,
          uploadedBytes,
          controller.signal
        );

        uploadedParts.push({ PartNumber: partNumber, ETag: etag });
        uploadedBytes += chunk.size;
      }

      // Step 3: Complete multipart upload
      await fetch('/api/documents/multipart/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          s3Key,
          uploadId,
          parts: uploadedParts,
          fileName: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          entityType,
          entityId,
        }),
      });

      setProgress(null);
      onUploadComplete();
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Upload cancelled');
      } else {
        setError(err instanceof Error ? err.message : 'Upload failed');
      }
    }
  };

  const uploadPartWithProgress = (
    url: string,
    chunk: Blob,
    partNumber: number,
    totalParts: number,
    totalFileSize: number,
    uploadedBytes: number,
    signal: AbortSignal
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const currentPartBytes = uploadedBytes + event.loaded;
          const percentage = Math.round((currentPartBytes / totalFileSize) * 100);

          setProgress({
            uploadedBytes: currentPartBytes,
            totalBytes: totalFileSize,
            currentPart: partNumber,
            totalParts,
            percentage,
          });
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          const etag = xhr.getResponseHeader('ETag')?.replace(/"/g, '');
          if (etag) {
            resolve(etag);
          } else {
            reject(new Error('Missing ETag in response'));
          }
        } else {
          reject(new Error(`Part ${partNumber} upload failed: ${xhr.statusText}`));
        }
      });

      xhr.addEventListener('error', () => reject(new Error(`Network error uploading part ${partNumber}`)));
      xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

      signal.addEventListener('abort', () => xhr.abort());

      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.send(chunk);
    });
  };

  const cancelUpload = () => {
    if (abortController) {
      abortController.abort();
    }
  };

  // ... render UI with progress bar and cancel button
}
```

### Pattern 3: Document Model Extension for Driver Support
**What:** Extend existing Document model to support driver ownership and expiry tracking
**When to use:** All driver document operations
**Example:**
```prisma
// Source: Existing schema.prisma Document model + Prisma relations docs

enum DocumentType {
  DRIVER_LICENSE
  DRIVER_APPLICATION
  GENERAL
  TRUCK_REGISTRATION    // Existing truck documents (backwards compatible)
  TRUCK_INSURANCE       // Existing truck documents (backwards compatible)
}

model Document {
  id          String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String        @db.Uuid
  truckId     String?       @db.Uuid
  routeId     String?       @db.Uuid
  driverId    String?       @db.Uuid          // NEW: driver document ownership
  documentType DocumentType?                  // NEW: categorize document type
  expiryDate   DateTime?    @db.Timestamptz  // NEW: track expiry for compliance docs
  notes        String?                        // NEW: additional context (e.g., "State of CA")
  fileName    String
  s3Key       String
  contentType String
  sizeBytes   Int
  uploadedBy  String        @db.Uuid
  createdAt   DateTime      @default(now()) @db.Timestamptz
  updatedAt   DateTime      @updatedAt @db.Timestamptz

  tenant   Tenant @relation(fields: [tenantId], references: [id])
  truck    Truck?  @relation(fields: [truckId], references: [id])
  route    Route?  @relation(fields: [routeId], references: [id])
  driver   User?   @relation(name: "DriverDocuments", fields: [driverId], references: [id])  // NEW
  uploader User    @relation(name: "UploadedDocuments", fields: [uploadedBy], references: [id])

  @@index([tenantId])
  @@index([truckId])
  @@index([routeId])
  @@index([driverId])        // NEW: index for driver document queries
  @@index([uploadedBy])
  @@index([expiryDate])      // NEW: index for expiry notification queries
}

// Update User model to support driver document relation
model User {
  // ... existing fields

  uploadedDocuments Document[] @relation(name: "UploadedDocuments")
  driverDocuments   Document[] @relation(name: "DriverDocuments")  // NEW
}
```

**Validation schema extension:**
```typescript
// lib/validations/document.schemas.ts
import { z } from 'zod';

export const documentTypeEnum = z.enum([
  'DRIVER_LICENSE',
  'DRIVER_APPLICATION',
  'GENERAL',
  'TRUCK_REGISTRATION',
  'TRUCK_INSURANCE',
]);

export const documentCreateSchema = z
  .object({
    fileName: z.string().min(1).max(255),
    s3Key: z.string().min(1),
    contentType: z.string(),
    sizeBytes: z.number().positive().max(100 * 1024 * 1024), // 100MB max
    truckId: z.string().uuid().optional(),
    routeId: z.string().uuid().optional(),
    driverId: z.string().uuid().optional(),
    documentType: documentTypeEnum.optional(),
    expiryDate: z.coerce.date().optional(), // Allows string input, coerces to Date
    notes: z.string().max(500).optional(),
  })
  .refine(
    (data) => {
      // Exactly one entity association required
      const entityCount = [data.truckId, data.routeId, data.driverId].filter(Boolean).length;
      return entityCount === 1;
    },
    {
      message: 'Document must be associated with exactly one entity (truck, route, or driver)',
    }
  )
  .refine(
    (data) => {
      // Driver documents require documentType
      if (data.driverId && !data.documentType) {
        return false;
      }
      return true;
    },
    {
      message: 'Driver documents must have a documentType',
    }
  );
```

### Pattern 4: Expiry Notification Integration
**What:** Extend existing notification cron to check driver document expiry at 30/60/90 day intervals
**When to use:** Daily cron job (already runs for truck documents and maintenance)
**Example:**
```typescript
// Source: Existing src/lib/notifications/check-expiring-documents.ts pattern

// lib/notifications/check-expiring-driver-documents.ts
import { prisma } from '../db/prisma';
import { withTenantRLS } from '../db/extensions/tenant-rls';

export interface ExpiringDriverDocumentItem {
  driverId: string;
  driverName: string;
  documentType: string;
  documentId: string;
  expiryDate: Date;
  daysUntilExpiry: number;
}

/**
 * Find driver documents expiring in 30, 60, or 90 days.
 * Notifications sent at these specific milestones (not every day).
 */
export async function findExpiringDriverDocuments(
  tenantId: string
): Promise<ExpiringDriverDocumentItem[]> {
  const tenantPrisma = prisma.$extends(withTenantRLS(tenantId));

  const now = new Date();
  const ninetyDaysFromNow = new Date(now);
  ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

  // @ts-ignore - Extended client type inference
  const documents = await tenantPrisma.document.findMany({
    where: {
      driverId: { not: null },
      expiryDate: { not: null, lte: ninetyDaysFromNow },
    },
    include: {
      driver: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  const expiringItems: ExpiringDriverDocumentItem[] = [];

  for (const doc of documents) {
    if (!doc.expiryDate || !doc.driver) continue;

    const daysUntilExpiry = Math.ceil(
      (doc.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Only notify at milestone intervals: 90, 60, 30 days (and when expired)
    const milestones = [90, 60, 30, 0];
    const isNotificationDay = milestones.some(
      (milestone) => Math.abs(daysUntilExpiry - milestone) < 1
    );

    if (isNotificationDay || daysUntilExpiry < 0) {
      expiringItems.push({
        driverId: doc.driver.id,
        driverName: `${doc.driver.firstName} ${doc.driver.lastName}`,
        documentType: doc.documentType || 'Unknown Document',
        documentId: doc.id,
        expiryDate: doc.expiryDate,
        daysUntilExpiry,
      });
    }
  }

  return expiringItems;
}
```

**Extend cron to include driver documents:**
```typescript
// app/api/cron/send-reminders/route.ts (extend existing)

import { findExpiringDriverDocuments } from '@/lib/notifications/check-expiring-driver-documents';

// ... in main loop after truck documents:

// Process driver document expiry reminders
const expiringDriverDocuments = await findExpiringDriverDocuments(tenant.id);
console.log(`[CRON] Found ${expiringDriverDocuments.length} expiring driver document(s)`);

for (const item of expiringDriverDocuments) {
  const idempotencyKey = generateIdempotencyKey(
    'driver-document-expiry',
    item.documentId,
    today
  );

  // ... send email similar to truck document pattern
}
```

### Anti-Patterns to Avoid

- **Using multipart for all files:** Multipart adds complexity; only use for files >5MB threshold
- **Storing expiry in JSONB metadata:** Use dedicated `expiryDate` column for query performance (notifications need indexed date queries)
- **Client-side chunking without server coordination:** Multipart requires server-managed uploadId and part tracking; client cannot orchestrate alone
- **Missing AbortMultipartUpload on error:** Orphaned multipart uploads consume storage; always abort on failure/cancellation

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multipart upload chunking | Custom file splitting and S3 API calls | @aws-sdk/lib-storage Upload class | Handles part size calculation, parallel uploads, retry logic, progress events automatically |
| Upload progress calculation | Manual byte counting across chunks | XMLHttpRequest.upload.onprogress | Browser-native progress events with loaded/total bytes |
| Expiry notification scheduling | Custom cron with date arithmetic | Extend existing notification cron (Phase 9) | Already proven system with idempotency, retry, and logging |
| File type validation | Extension-based checking | Existing magic byte validation (file-type package) | Already implemented in Phase 6; prevents MIME spoofing |

**Key insight:** 80% of Phase 18 infrastructure already exists. Multipart upload is the only net-new pattern; everything else extends proven systems (Document model, notifications, presigned URLs).

## Common Pitfalls

### Pitfall 1: Cloudflare R2 Multipart Requires Separate Presigned URLs Per Part
**What goes wrong:** Attempting to use a single presigned URL for multipart upload fails because each UploadPart operation has a different signature (part number is part of signature).
**Why it happens:** Developers assume multipart works like single-PUT with chunked request body.
**How to avoid:** Generate presigned URL per part on server; client requests URL for each chunk before uploading.
**Warning signs:** "SignatureDoesNotMatch" errors when uploading parts, or attempting to PUT chunks to CreateMultipartUpload URL.

### Pitfall 2: Forgetting to Abort Failed Multipart Uploads
**What goes wrong:** Incomplete multipart uploads remain in R2 storage indefinitely, consuming storage quota and potentially incurring costs.
**Why it happens:** Error handling doesn't call AbortMultipartUploadCommand when upload fails or user cancels.
**How to avoid:** Always wrap multipart upload in try/catch and abort on error; implement cancel button that calls abort endpoint.
**Warning signs:** R2 storage usage grows over time without corresponding completed uploads; "orphaned parts" accumulating in bucket.

### Pitfall 3: Part Size Below R2's 5MB Minimum
**What goes wrong:** R2 rejects UploadPart calls with parts <5MB (except final part).
**Why it happens:** Using too-small chunk size (e.g., 1MB) for better progress granularity.
**How to avoid:** Use minimum 5MB part size (10MB recommended for balance of progress vs. API calls); only final part can be smaller.
**Warning signs:** "EntityTooSmall" errors from R2 on UploadPart calls.

### Pitfall 4: Not Handling Document Model Migration for Existing Data
**What goes wrong:** Existing truck/route documents lack `documentType` enum value, causing enum constraint violations.
**Why it happens:** Adding non-nullable enum to model with existing NULL values.
**How to avoid:** Make `documentType` nullable, provide default values in migration for existing rows (e.g., TRUCK_REGISTRATION for truckId documents), or use two-phase migration (add nullable column, backfill data, make non-nullable).
**Warning signs:** Migration fails with "null value in column violates not-null constraint" or enum validation errors on existing documents.

### Pitfall 5: Expiry Date Validation Without Timezone Consideration
**What goes wrong:** Expiry dates stored as midnight UTC interpreted as previous day in user's timezone, causing premature expiry warnings.
**Why it happens:** Date picker returns midnight local time, converted to UTC shifts date backwards.
**How to avoid:** Store expiry as end-of-day in user's tenant timezone, or use date-only comparison (ignore time component) in expiry queries.
**Warning signs:** Notifications sent 1 day early; users report expiry warnings when document still valid.

### Pitfall 6: Missing ETag Extraction from Part Upload Response
**What goes wrong:** CompleteMultipartUpload fails with "InvalidPart" error because ETags not provided.
**Why it happens:** Forgetting to extract ETag header from each UploadPart response; R2 requires ETags to verify part integrity.
**How to avoid:** Extract ETag from XMLHttpRequest response headers (`xhr.getResponseHeader('ETag')`) and include in CompleteMultipartUpload parts array.
**Warning signs:** Multipart upload completes but CompleteMultipartUpload returns "InvalidPart" or "InvalidRequest" errors.

## Code Examples

Verified patterns from official sources and existing codebase:

### File Size Threshold Check (Existing Pattern Extended)
```typescript
// Source: Existing document-upload.tsx + multipart threshold decision

// components/documents/document-upload.tsx (modify handleFileChange)

const MULTIPART_THRESHOLD = 5 * 1024 * 1024; // 5MB
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0];
  if (!file) return;

  // Determine upload strategy based on file size
  if (file.size > MULTIPART_THRESHOLD) {
    // Use multipart upload for large files
    await handleMultipartUpload(file);
  } else {
    // Use existing single-PUT presigned URL for small files
    await handleSingleUpload(file);
  }
};
```

### Driver Document Upload Server Action
```typescript
// Source: Existing app/(owner)/actions/documents.ts pattern

// app/(owner)/actions/driver-documents.ts

'use server';

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { requireTenantId } from '@/lib/context/tenant-context';
import { DocumentRepository } from '@/lib/db/repositories/document.repository';
import { documentCreateSchema } from '@/lib/validations/document.schemas';

/**
 * Complete driver document upload (after S3 upload completes).
 * Similar to existing completeUpload but includes documentType and expiryDate.
 */
export async function completeDriverDocumentUpload(data: {
  s3Key: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  driverId: string;
  documentType: 'DRIVER_LICENSE' | 'DRIVER_APPLICATION' | 'GENERAL';
  expiryDate?: string; // ISO date string
  notes?: string;
}) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  try {
    const tenantId = await requireTenantId();
    const user = await getCurrentUser();

    if (!user) {
      return { error: 'User not found' };
    }

    // Defense-in-depth: verify s3Key tenant prefix
    if (!data.s3Key.startsWith(`tenant-${tenantId}/drivers/`)) {
      return { error: 'Invalid S3 key: does not match tenant/category' };
    }

    // Validate with schema
    const documentData = {
      fileName: data.fileName,
      s3Key: data.s3Key,
      contentType: data.contentType,
      sizeBytes: data.sizeBytes,
      driverId: data.driverId,
      documentType: data.documentType,
      expiryDate: data.expiryDate ? new Date(data.expiryDate) : undefined,
      notes: data.notes,
    };

    const result = documentCreateSchema.safeParse(documentData);

    if (!result.success) {
      return { error: result.error.flatten().fieldErrors };
    }

    // Create document record
    const repo = new DocumentRepository(tenantId);
    const document = await repo.create({
      ...result.data,
      tenantId,
      uploadedBy: user.id,
    });

    // Revalidate driver detail page
    revalidatePath(`/drivers/${data.driverId}`);

    return { success: true, document };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to complete upload',
    };
  }
}
```

### Expiry Status Badge Component
```typescript
// Source: Existing patterns + date-fns for date comparison

// components/documents/expiry-status-badge.tsx

import { differenceInDays } from 'date-fns';

export function ExpiryStatusBadge({ expiryDate }: { expiryDate: Date | null }) {
  if (!expiryDate) {
    return null;
  }

  const today = new Date();
  const daysUntilExpiry = differenceInDays(expiryDate, today);

  let status: 'valid' | 'expiring-soon' | 'expired';
  let colorClass: string;
  let text: string;

  if (daysUntilExpiry < 0) {
    status = 'expired';
    colorClass = 'bg-red-100 text-red-800';
    text = `Expired ${Math.abs(daysUntilExpiry)} days ago`;
  } else if (daysUntilExpiry <= 30) {
    status = 'expiring-soon';
    colorClass = 'bg-yellow-100 text-yellow-800';
    text = `Expires in ${daysUntilExpiry} days`;
  } else {
    status = 'valid';
    colorClass = 'bg-green-100 text-green-800';
    text = `Valid (expires in ${daysUntilExpiry} days)`;
  }

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}>
      {text}
    </span>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single presigned URL for all files | Multipart upload for files >5MB | AWS best practice since S3 multipart API v2 (2012+) | Enables reliable large file uploads with resume capability |
| Storing expiry in JSONB metadata | Dedicated expiryDate column with index | Modern practice (2020+) for queryable temporal data | Enables efficient notification queries without JSON extraction |
| Extension-based file validation | Magic byte validation | Security best practice (2018+) | Prevents MIME spoofing attacks |
| Axios for upload progress | Native XMLHttpRequest.upload | 2024+ trend to reduce dependencies | Zero added dependencies, native browser API, same functionality |

**Deprecated/outdated:**
- **@aws-sdk/s3-request-presigner v2 API:** v3 uses `getSignedUrl` with command pattern (already used in codebase)
- **react-dropzone for file uploads:** Modern native file input with drag-drop via browser API sufficient; avoid dependency
- **Moment.js for date handling:** Project uses date-fns (modern, tree-shakeable alternative)

## Open Questions

1. **Should multipart uploads support parallel part uploads?**
   - What we know: `@aws-sdk/lib-storage` supports `queueSize` for parallel uploads (default 4)
   - What's unclear: Whether Cloudflare R2 benefits from parallel uploads or if sequential is more reliable
   - Recommendation: Start with sequential (queueSize: 1) for simplicity; optimize to parallel (queueSize: 4) if performance testing shows benefit

2. **Should existing truck documentMetadata JSONB be migrated to Document records?**
   - What we know: Truck model has `documentMetadata` JSONB with registration/insurance expiry; Document model now supports expiry
   - What's unclear: Whether to migrate existing truck expiry data to Document records for consistency, or maintain parallel systems
   - Recommendation: Phase 18 scope is driver documents only; defer truck migration to future phase to avoid scope creep

3. **Should drivers receive their own document expiry notifications?**
   - What we know: Current notification system sends to OWNER role only
   - What's unclear: Whether DRIVER role should receive notifications about their own expiring documents (e.g., license renewal reminder)
   - Recommendation: Phase 18 sends to OWNER only (matches existing pattern); add driver notifications in future enhancement if requested

## Sources

### Primary (HIGH confidence)
- Existing codebase:
  - `src/lib/storage/presigned.ts` - Presigned URL patterns
  - `src/lib/storage/validate.ts` - Magic byte validation (MAX_FILE_SIZE)
  - `src/app/(owner)/actions/documents.ts` - Document upload server actions
  - `src/lib/notifications/check-expiring-documents.ts` - Expiry notification queries
  - `prisma/schema.prisma` - Document model structure
  - `.planning/STATE.md` - v3.0 architectural decision: "Multipart upload for files >5MB"
- [AWS SDK for JavaScript v3 - @aws-sdk/lib-storage](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/modules/_aws_sdk_lib_storage.html) (official AWS docs)
- [Cloudflare R2 Multipart Upload](https://developers.cloudflare.com/r2/objects/multipart-objects/) (official Cloudflare docs)
- [Cloudflare R2 Presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) (official Cloudflare docs)

### Secondary (MEDIUM confidence)
- [Prisma Relations Documentation](https://www.prisma.io/docs/orm/prisma-schema/data-model/relations) - One-to-many relations for driver documents (verified with official docs)
- [How to Upload Large Files to S3 Using Multipart Upload](https://oneuptime.com/blog/post/2026-02-12-upload-large-files-to-s3-multipart-upload/view) - 2026 blog post on multipart patterns (verified with AWS docs)
- [MDN: XMLHttpRequest.upload](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/upload) - Progress event handling (official browser API docs)
- [Zod Documentation](https://zod.dev/) - Schema validation patterns (official Zod docs)

### Tertiary (LOW confidence)
- [Next.js file upload progress bar using Axios](https://codersteps.com/articles/next-js-file-upload-progress-bar-using-axios) - Community blog on progress patterns (alternative approach; project will use native XHR)
- [Document Management Best Practices 2026](https://thedigitalprojectmanager.com/project-management/document-management-best-practices/) - General guidance on document expiry tracking (conceptual, not implementation-specific)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - @aws-sdk/lib-storage is official AWS SDK; existing libraries already proven in production
- Architecture: HIGH - 80% reuses existing patterns (Phase 6 documents, Phase 9 notifications); only multipart upload is new
- Pitfalls: MEDIUM-HIGH - R2 multipart quirks documented in official Cloudflare docs; abort/ETag pitfalls common in community forums but verified in AWS docs
- Code examples: HIGH - Based on existing codebase patterns and official API documentation

**Research date:** 2026-02-16
**Valid until:** 60 days (stable domain - S3 API, document management patterns well-established)

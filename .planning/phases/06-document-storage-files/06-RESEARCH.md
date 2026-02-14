# Phase 6: Document Storage & Files - Research

**Researched:** 2026-02-14
**Domain:** Secure file upload and storage in multi-tenant Next.js applications
**Confidence:** MEDIUM-HIGH

## Summary

Phase 6 implements secure file upload and storage for truck documents and route attachments with strict tenant isolation. The research reveals that Next.js 16 Server Actions provide native FormData handling with configurable size limits (default 1MB). Three viable storage approaches emerged: (1) AWS S3 with tenant-prefixed paths, (2) Vercel Blob storage, and (3) UploadThing managed service. Security requires multiple validation layers: MIME type validation (Content-Type header), magic bytes validation (file signature inspection), randomized filenames to prevent directory traversal, and file size limits. For multi-tenant isolation, the industry standard is S3 bucket with tenant-prefixed paths (s3://bucket/tenant-{id}/files/) combined with IAM policies restricting access to specific prefixes. Virus scanning with ClamAV is recommended for production but adds significant complexity. The existing documentMetadata JSONB field on Truck can store file references, and a new Document table with similar JSONB flexibility should be created for Route attachments.

**Primary recommendation:** Use AWS S3 with @aws-sdk/client-s3 v3, implement presigned URLs for direct upload/download, validate with both MIME type checking and file-type npm package for magic bytes, store file metadata in Prisma with separate Document table. Defer ClamAV virus scanning to future phase unless security requirements are critical.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @aws-sdk/client-s3 | 3.x (latest) | S3 storage operations | Official AWS SDK v3, modern promise-based API, tree-shakable |
| @aws-sdk/s3-request-presigner | 3.x (latest) | Generate presigned URLs | Secure temporary access tokens for direct upload/download |
| file-type | 19.x (ESM only) | Magic bytes validation | Most popular (4M+ weekly downloads), cannot be faked like MIME |
| zod | 4.3.6 (installed) | Upload validation schemas | Already in stack, validates size/type/metadata |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| clamscan | 2.x | Virus scanning integration | Production environments with high security requirements |
| nanoid | 5.x | Generate random file IDs | URL-safe, collision-resistant alternative to UUID for filenames |
| mime-types | 2.x | MIME type lookup/validation | Fallback when file-type cannot detect format |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| AWS S3 | Vercel Blob | Easier setup, tighter Next.js integration BUT vendor lock-in, 5TB max file size, higher cost at scale |
| AWS S3 | UploadThing | Managed service, built-in UI components BUT third-party dependency, additional cost, less control |
| Presigned URLs | Direct server upload | Simpler logic BUT server processes large files (memory/CPU), timeout issues >10MB |
| file-type | magic-bytes.js | Alternative magic bytes library BUT smaller community (100K vs 4M weekly downloads) |

**Installation:**
```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner file-type nanoid
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   ├── storage/
│   │   ├── s3-client.ts          # Configured S3Client singleton
│   │   ├── upload.ts             # Generate presigned upload URLs
│   │   ├── download.ts           # Generate presigned download URLs
│   │   ├── delete.ts             # Delete files from S3
│   │   └── validate.ts           # MIME + magic bytes validation
│   └── documents/
│       ├── repository.ts         # Document CRUD with RLS
│       └── types.ts              # Document metadata types
├── server/
│   └── actions/
│       ├── truck-documents.ts    # Upload/delete truck files
│       └── route-documents.ts    # Upload/delete route files
└── app/
    └── (owner)/
        └── trucks/
            └── [id]/
                └── _components/
                    └── DocumentUploadForm.tsx  # File upload UI
```

### Pattern 1: Presigned URL Upload Flow
**What:** Client requests presigned URL from server action, uploads directly to S3, notifies server on completion
**When to use:** All file uploads (avoids server processing large files)
**Example:**
```typescript
// Source: AWS S3 presigned URL documentation + Next.js Server Actions pattern

// 1. Server Action: Generate presigned URL
"use server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client } from "@/lib/storage/s3-client";
import { nanoid } from "nanoid";

export async function getUploadUrl(
  fileName: string,
  contentType: string,
  fileSize: number
) {
  // Validate file type and size
  const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
  if (!allowedTypes.includes(contentType)) {
    throw new Error("Invalid file type");
  }
  if (fileSize > 10 * 1024 * 1024) { // 10MB
    throw new Error("File too large");
  }

  const tenantId = await getTenantId(); // From RLS context
  const fileId = nanoid();
  const key = `tenant-${tenantId}/documents/${fileId}-${fileName}`;

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key,
    ContentType: contentType,
    ContentLength: fileSize,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: 300, // 5 minutes
  });

  return { uploadUrl, key, fileId };
}

// 2. Client: Upload to S3 via presigned URL
async function uploadFile(file: File) {
  const { uploadUrl, key, fileId } = await getUploadUrl(
    file.name,
    file.type,
    file.size
  );

  const response = await fetch(uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });

  if (!response.ok) throw new Error("Upload failed");

  // 3. Notify server to save metadata
  await saveDocumentMetadata({ key, fileId, fileName: file.name });
}
```

### Pattern 2: Magic Bytes Validation
**What:** Verify file signature matches claimed MIME type to prevent file type spoofing
**When to use:** All uploads before generating presigned URL
**Example:**
```typescript
// Source: file-type npm package documentation

import { fileTypeFromBuffer } from "file-type";

export async function validateFileType(
  file: File,
  allowedTypes: string[]
): Promise<boolean> {
  // Read first 4100 bytes (covers most magic numbers)
  const buffer = await file.slice(0, 4100).arrayBuffer();
  const fileType = await fileTypeFromBuffer(Buffer.from(buffer));

  if (!fileType) {
    throw new Error("Could not determine file type");
  }

  // Verify detected type matches claimed MIME type
  if (fileType.mime !== file.type) {
    throw new Error(
      `File type mismatch: claimed ${file.type}, actual ${fileType.mime}`
    );
  }

  // Verify type is allowed
  if (!allowedTypes.includes(fileType.mime)) {
    throw new Error(`File type ${fileType.mime} not allowed`);
  }

  return true;
}
```

### Pattern 3: Tenant-Isolated S3 Paths
**What:** Prefix all S3 keys with tenant ID to enforce isolation at storage level
**When to use:** All file operations (upload, download, delete)
**Example:**
```typescript
// Source: AWS multi-tenant S3 isolation patterns

// Path structure: tenant-{uuid}/category/{fileId}-{originalName}
const buildS3Key = (
  tenantId: string,
  category: "trucks" | "routes",
  fileId: string,
  fileName: string
): string => {
  return `tenant-${tenantId}/${category}/${fileId}-${fileName}`;
};

// IAM policy restricts each tenant to their prefix
// {
//   "Effect": "Allow",
//   "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
//   "Resource": "arn:aws:s3:::bucket/tenant-${tenant.id}/*"
// }
```

### Pattern 4: Document Metadata in Prisma
**What:** Store file metadata (key, size, type, name) in PostgreSQL with RLS, actual file in S3
**When to use:** All file uploads (enables searchable metadata, RLS protection)
**Example:**
```typescript
// prisma/schema.prisma additions

model Document {
  id           String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId     String      @db.Uuid
  truckId      String?     @db.Uuid  // Null for route documents
  routeId      String?     @db.Uuid  // Null for truck documents
  fileName     String      // Original filename
  s3Key        String      // Full S3 path
  contentType  String      // Validated MIME type
  sizeBytes    Int
  metadata     Json?       // Additional file-specific metadata
  uploadedBy   String      @db.Uuid  // User who uploaded
  createdAt    DateTime    @default(now()) @db.Timestamptz
  updatedAt    DateTime    @updatedAt @db.Timestamptz

  tenant Tenant @relation(fields: [tenantId], references: [id])
  truck  Truck?  @relation(fields: [truckId], references: [id])
  route  Route?  @relation(fields: [routeId], references: [id])
  user   User    @relation(fields: [uploadedBy], references: [id])

  @@index([tenantId])
  @@index([truckId])
  @@index([routeId])
  @@index([uploadedBy])
}
```

### Pattern 5: Optimistic UI with useOptimistic
**What:** Show file in UI immediately on upload start, rollback on error
**When to use:** File upload forms to improve perceived performance
**Example:**
```typescript
// Source: React 19 useOptimistic documentation

"use client";
import { useOptimistic } from "react";

function DocumentList({ documents }) {
  const [optimisticDocs, addOptimisticDoc] = useOptimistic(
    documents,
    (state, newDoc) => [...state, { ...newDoc, isPending: true }]
  );

  async function handleUpload(file: File) {
    // Optimistically add to UI
    addOptimisticDoc({
      id: "temp",
      fileName: file.name,
      sizeBytes: file.size,
    });

    try {
      await uploadDocument(file);
      // On success, server returns updated list
    } catch (error) {
      // On error, optimistic update auto-reverts
      console.error("Upload failed:", error);
    }
  }

  return (
    <ul>
      {optimisticDocs.map((doc) => (
        <li key={doc.id} className={doc.isPending ? "opacity-50" : ""}>
          {doc.fileName}
          {doc.isPending && <Spinner />}
        </li>
      ))}
    </ul>
  );
}
```

### Anti-Patterns to Avoid
- **Trusting client-provided MIME type alone:** Always validate with magic bytes
- **Using original filename in S3 key:** Enables directory traversal attacks (../../etc/passwd)
- **Processing files through server memory:** Causes timeouts/crashes on large files
- **Storing files in database as BLOB:** Poor performance, expensive storage, no CDN
- **Single bucket without tenant prefixes:** Cross-tenant access vulnerabilities
- **Presigned URLs without expiration:** Security risk if URL leaks
- **No file size validation:** Enables storage exhaustion DoS attacks

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File type detection | Regex on file extension | file-type npm package | Extensions can be spoofed, magic bytes cannot |
| S3 client configuration | Manual HTTP requests to S3 API | @aws-sdk/client-s3 v3 | Handles retries, credentials, regions, multipart uploads automatically |
| Presigned URL generation | Manual signature calculation | @aws-sdk/s3-request-presigner | AWS SigV4 signing is complex, easy to get wrong |
| Unique filename generation | Timestamp + random number | nanoid or crypto.randomUUID() | Collision-resistant, URL-safe, cryptographically secure |
| Virus scanning | Custom malware detection | ClamAV + clamscan npm | Thousands of malware signatures, actively maintained |
| File upload progress | Custom XHR progress tracking | Native fetch + ReadableStream | Standard API, works with presigned URLs |

**Key insight:** File upload security is deceptively complex. MIME validation alone is insufficient (easily spoofed), directory traversal is a real risk (sanitize filenames), and virus scanning requires specialized knowledge. Use battle-tested libraries for validation and AWS SDK for storage operations.

## Common Pitfalls

### Pitfall 1: MIME Type Spoofing
**What goes wrong:** Accepting files based only on Content-Type header or file extension, allowing malicious files disguised as safe types
**Why it happens:** Browsers and clients can set arbitrary Content-Type headers; file extensions are trivially changed
**How to avoid:** Always validate with magic bytes (file signature) using file-type package before accepting upload
**Warning signs:** File opens as different type than expected; executables disguised as PDFs

### Pitfall 2: Directory Traversal via Filename
**What goes wrong:** Using unsanitized user-provided filenames in S3 keys, allowing paths like "../../secrets.txt" to escape tenant directory
**Why it happens:** Trusting client-provided filename without validation
**How to avoid:** Never use original filename in storage path; generate random ID (nanoid) and only preserve original name in metadata
**Warning signs:** S3 keys containing "../" or absolute paths

### Pitfall 3: Server Memory Exhaustion
**What goes wrong:** Server action reads entire file into memory before uploading to S3, causing timeouts or crashes on files >100MB
**Why it happens:** Using FormData.get() returns entire file as Blob in memory
**How to avoid:** Use presigned URLs for direct client-to-S3 upload, bypassing server entirely
**Warning signs:** 500 errors on large files; high memory usage during uploads; Vercel function timeouts

### Pitfall 4: Presigned URL Expiration Too Long
**What goes wrong:** Presigned URLs valid for hours/days can be leaked and abused
**Why it happens:** Setting expiresIn too high for convenience
**How to avoid:** Upload URLs: 5-15 minutes max; Download URLs: 1 hour max; regenerate on demand
**Warning signs:** Old URLs still working; URLs shared publicly remain accessible

### Pitfall 5: Cross-Tenant File Access
**What goes wrong:** User modifies S3 key in request to access another tenant's files
**Why it happens:** Not validating S3 key matches current tenant before generating presigned URL
**How to avoid:** Always extract tenantId from RLS context and verify it matches S3 key prefix before any operation
**Warning signs:** No tenant validation in upload/download actions; S3 keys not prefixed with tenant ID

### Pitfall 6: File Size Limit Mismatch
**What goes wrong:** Client uploads 20MB file, server rejects because Next.js bodySizeLimit is 1MB
**Why it happens:** Forgetting to configure next.config.js serverActions.bodySizeLimit
**How to avoid:** Set bodySizeLimit to max file size (10MB) OR use presigned URLs to skip server entirely
**Warning signs:** "Body exceeded 1MB limit" errors; uploads fail silently

### Pitfall 7: No Cleanup on Upload Failure
**What goes wrong:** File uploaded to S3 but metadata save fails, leaving orphaned files consuming storage
**Why it happens:** Not wrapping upload + metadata save in transaction or cleanup logic
**How to avoid:** Save metadata first with "pending" status, then upload; mark "completed" on success; background job cleans old pending files
**Warning signs:** S3 storage growing faster than Document count; files in S3 not in database

### Pitfall 8: Virus Scanning After Storage
**What goes wrong:** Malicious file stored in S3, scanned later, but already accessible via presigned URL
**Why it happens:** Scanning after storage to avoid upload delays
**How to avoid:** Either scan before storage (adds latency) OR store in quarantine prefix, scan async, move to public prefix on clean result
**Warning signs:** Infected files downloadable before scan completes

## Code Examples

Verified patterns from official sources:

### S3 Client Configuration
```typescript
// Source: AWS SDK v3 documentation

import { S3Client } from "@aws-sdk/client-s3";

export const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});
```

### Next.js Config for 10MB Uploads
```typescript
// Source: Next.js serverActions documentation

// next.config.js
module.exports = {
  serverActions: {
    bodySizeLimit: '10mb',
  },
};
```

### Complete Upload Flow with Validation
```typescript
// Source: Combined AWS S3 + file-type + Next.js patterns

"use server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { fileTypeFromBuffer } from "file-type";
import { nanoid } from "nanoid";
import { s3Client } from "@/lib/storage/s3-client";
import { getTenantId } from "@/lib/auth";

const ALLOWED_TYPES = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
};

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function uploadTruckDocument(formData: FormData) {
  const file = formData.get("file") as File;
  const truckId = formData.get("truckId") as string;

  // 1. Basic validation
  if (!file || file.size === 0) {
    throw new Error("No file provided");
  }
  if (file.size > MAX_SIZE) {
    throw new Error("File exceeds 10MB limit");
  }

  // 2. Magic bytes validation
  const buffer = await file.slice(0, 4100).arrayBuffer();
  const fileType = await fileTypeFromBuffer(Buffer.from(buffer));

  if (!fileType || !ALLOWED_TYPES[fileType.mime]) {
    throw new Error(`File type ${fileType?.mime || "unknown"} not allowed`);
  }

  // 3. Verify MIME type matches detected type
  if (fileType.mime !== file.type) {
    throw new Error("File type mismatch detected");
  }

  // 4. Get tenant context
  const tenantId = await getTenantId();

  // 5. Generate random file ID and S3 key
  const fileId = nanoid();
  const s3Key = `tenant-${tenantId}/trucks/${fileId}-${file.name}`;

  // 6. Generate presigned upload URL
  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET!,
    Key: s3Key,
    ContentType: fileType.mime,
    ContentLength: file.size,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: 300, // 5 minutes
  });

  // 7. Return URL + metadata for client-side upload
  return {
    uploadUrl,
    s3Key,
    fileId,
    metadata: {
      fileName: file.name,
      contentType: fileType.mime,
      sizeBytes: file.size,
      truckId,
    },
  };
}

// Client-side completion handler
export async function completeUpload(
  s3Key: string,
  metadata: DocumentMetadata
) {
  const tenantId = await getTenantId();

  // Verify S3 key belongs to this tenant
  if (!s3Key.startsWith(`tenant-${tenantId}/`)) {
    throw new Error("Invalid S3 key");
  }

  // Save to database
  await documentRepository.create({
    ...metadata,
    s3Key,
    tenantId,
  });

  return { success: true };
}
```

### Generate Download URL
```typescript
// Source: AWS S3 presigned URL documentation

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export async function getDownloadUrl(documentId: string) {
  const tenantId = await getTenantId();

  // Fetch document with RLS
  const doc = await documentRepository.findById(documentId);

  if (!doc) {
    throw new Error("Document not found");
  }

  // Verify S3 key matches tenant (defense in depth)
  if (!doc.s3Key.startsWith(`tenant-${tenantId}/`)) {
    throw new Error("Access denied");
  }

  const command = new GetObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET!,
    Key: doc.s3Key,
  });

  const downloadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: 3600, // 1 hour
  });

  return { downloadUrl, fileName: doc.fileName };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Multer middleware (Express) | Next.js Server Actions with FormData | Next.js 14 (2023) | Native framework support, no middleware needed |
| AWS SDK v2 | AWS SDK v3 | 2020-2022 | Modular imports, tree-shaking, promise-native, better TypeScript |
| MIME type validation only | Magic bytes + MIME validation | Ongoing security evolution | Prevents file type spoofing attacks |
| Store files in database | Store in S3, metadata in DB | Industry standard since ~2010 | Scalability, CDN integration, cost efficiency |
| File extension checking | file-type package | 2015+ | Reliable file type detection regardless of extension |
| Long-lived presigned URLs | Short expiration (5-60 min) | 2018+ security best practices | Limits exposure window if URL leaks |

**Deprecated/outdated:**
- Multer: Express-specific, not compatible with Next.js App Router Server Actions
- AWS SDK v2: Maintenance mode, use v3 for new projects (v2 support ends 2024+)
- Body parser middleware: Not needed in Next.js Server Actions, FormData handled natively
- File upload to /tmp then S3: Use presigned URLs for direct upload to avoid server bottleneck

## Open Questions

1. **Should we implement ClamAV virus scanning in Phase 6?**
   - What we know: clamscan npm package integrates ClamAV, requires ClamAV daemon running, adds significant latency (seconds per file)
   - What's unclear: Whether security requirements justify complexity and cost
   - Recommendation: Start without virus scanning, add in future phase if needed. Document as technical debt. If required, use quarantine pattern (upload to temp prefix, scan async, move on success).

2. **Should we use Vercel Blob instead of S3?**
   - What we know: Vercel Blob easier setup, tighter Next.js integration, but vendor lock-in and higher cost at scale
   - What's unclear: Long-term storage costs, migration difficulty
   - Recommendation: AWS S3 for production (industry standard, cost-effective, portable), Vercel Blob acceptable for MVP/prototyping

3. **What's the file retention policy?**
   - What we know: Files deleted when truck/route deleted (cascade), or explicit user delete
   - What's unclear: Soft delete vs hard delete, compliance requirements (retain for X years?)
   - Recommendation: Hard delete from S3 when Document record deleted (matches Phase 1 hard delete pattern). If compliance requires retention, add deletedAt timestamp and filter queries, schedule background job to purge after retention period.

4. **How to handle large file uploads (>100MB)?**
   - What we know: Presigned URLs support multipart upload, S3 supports files up to 5TB
   - What's unclear: Whether 10MB limit is sufficient for all use cases
   - Recommendation: Start with 10MB limit (covers PDFs, images, scans). If larger files needed, implement multipart upload flow or increase limit to 50MB. Monitor actual usage patterns.

5. **Should we implement direct S3 download or proxy through server?**
   - What we know: Presigned download URLs enable direct S3 access (faster, no server load); proxy enables access logging and download counting
   - What's unclear: Whether download analytics are required
   - Recommendation: Use presigned URLs for performance. If analytics needed later, add download tracking via separate server action that logs then returns presigned URL.

## Sources

### Primary (HIGH confidence)
- [AWS S3 Multi-Tenant Isolation Patterns](https://aws.amazon.com/blogs/apn/partitioning-and-isolating-multi-tenant-saas-data-with-amazon-s3/) - Tenant prefix-based isolation
- [AWS S3 Presigned URL Security Best Practices](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html) - Expiration and security guidance
- [Next.js Server Actions Documentation](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions) - bodySizeLimit configuration
- [React useOptimistic Hook](https://react.dev/reference/react/useOptimistic) - Optimistic UI patterns
- [file-type npm package](https://www.npmjs.com/package/file-type) - Magic bytes validation library
- [Prisma JSON Fields Documentation](https://www.prisma.io/docs/orm/prisma-client/special-fields-and-types/working-with-json-fields) - JSONB for metadata storage

### Secondary (MEDIUM confidence)
- [Next.js 15 File Upload Tutorial with Server Actions](https://strapi.io/blog/epic-next-js-15-tutorial-part-5-file-upload-using-server-actions) - Implementation patterns
- [AWS SDK for JavaScript v3](https://github.com/aws/aws-sdk-js-v3/releases) - Node.js version support (v18 dropped Jan 2026)
- [Secure File Upload Node.js Guide](https://medium.com/@tahaharbouch1/toward-secure-code-how-to-secure-file-upload-on-expressjs-using-multer-6598b1715bb4) - Security principles
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) - Security best practices
- [ClamAV Integration Node.js](https://github.com/kylefarris/clamscan) - Virus scanning library

### Tertiary (LOW confidence - needs validation)
- [Vercel Blob Storage](https://vercel.com/docs/storage/vercel-blob) - Alternative to S3 (vendor-specific, 2026 pricing unclear)
- [UploadThing Documentation](https://docs.uploadthing.com/) - Managed upload service (third-party dependency)
- [Pompelmi Security Scanner](https://www.helpnetsecurity.com/2026/02/02/pompelmi-open-source-secure-file-upload-scanning-node-js/) - New 2026 security tool (too new for production)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - AWS S3 is industry standard, file-type is proven, Next.js Server Actions are stable
- Architecture: MEDIUM-HIGH - Presigned URL pattern is well-documented, but implementation details vary
- Pitfalls: HIGH - Based on OWASP guidelines, real CVEs (CVE-2026-1357), and AWS security docs
- Virus scanning: LOW - ClamAV integration is complex, unclear if required for this phase

**Research date:** 2026-02-14
**Valid until:** ~2026-03-31 (45 days - stable domain, but security best practices evolve)

/**
 * Restricted-document storage helpers (spec §4.3 + §4.4, Supabase-adapted).
 *
 * Restricted documents land under tenant-{tenantId}/restricted/... with
 * shorter presigned URL expiries. Default AES-256 encryption-at-rest is
 * provided by Supabase Storage; per-tenant BYOK/CMK is future work.
 *
 * For non-restricted document types (BOL/POD/rate confirmation/receipts) use
 * `./presigned.ts` instead — this file is only for the 8 restricted PII types.
 *
 * TODO(security): Migrate to per-tenant customer-managed keys when Supabase
 * Storage adds BYOK support (currently bucket-wide AES-256 only).
 */

import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client, getBucketName } from './s3-client';
import { DocumentType } from '@/generated/prisma';

/**
 * The 8 restricted PII document types that require:
 * - A dedicated `tenant-{tenantId}/restricted/` storage prefix
 * - Shorter presigned URL expiries (15-min download, 5-min upload)
 * - An audit_log row on every access attempt
 * - RBAC enforcement (DRIVER → own docs only; MANAGER+ → any in tenant)
 */
export const RESTRICTED_DOCUMENT_TYPES = [
  'SSN_CARD',
  'PASSPORT',
  'CDL_SCAN',
  'MEDICAL_CARD',
  'VOIDED_CHECK',
  'W9',
  'W4',
  'I9',
] as const satisfies readonly DocumentType[];

export type RestrictedDocumentType = (typeof RESTRICTED_DOCUMENT_TYPES)[number];

/**
 * Type guard — returns true when the provided documentType is one of the
 * 8 restricted PII types that require the restricted storage + RBAC flow.
 */
export function isRestrictedDocumentType(
  t: DocumentType | null | undefined
): t is RestrictedDocumentType {
  return !!t && (RESTRICTED_DOCUMENT_TYPES as readonly string[]).includes(t);
}

/** 5-minute upload expiry for restricted documents (same as non-restricted). */
export const RESTRICTED_UPLOAD_EXPIRY_SECONDS = 300;

/**
 * 15-minute download expiry for restricted documents.
 * Shorter than the standard 1-hour expiry to limit exposure window of PII URLs.
 * Per spec §4.4: "presigned URLs for restricted docs expire in 15 minutes".
 */
export const RESTRICTED_DOWNLOAD_EXPIRY_SECONDS = 900;

/**
 * Build the restricted S3 object key.
 *
 * Pattern: `tenant-{tenantId}/restricted/{subfolder}/{fileId}-{sanitizedFileName}`
 *
 * When driverId is provided the file lives under that driver's subfolder,
 * giving per-driver storage isolation within the restricted prefix. When
 * driverId is null/undefined (e.g. an org-level W9) it falls under `_org`.
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

/**
 * Returns true when `s3Key` starts with the expected restricted prefix for
 * the given tenant. Used as a defense-in-depth check before signing URLs.
 */
export function isRestrictedKey(s3Key: string, tenantId: string): boolean {
  return s3Key.startsWith(`tenant-${tenantId}/restricted/`);
}

/**
 * Generate a presigned upload URL for a restricted document.
 *
 * Enforces the `/restricted/` prefix at runtime — throws if the computed
 * key somehow doesn't start with the expected prefix (defense in depth).
 *
 * @returns `{ uploadUrl, s3Key }` — caller MUST persist `s3Key` in the DB.
 */
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
    throw new Error(
      `Restricted upload rejected: computed key ${s3Key} does not start with tenant-${args.tenantId}/restricted/`
    );
  }

  const command = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: s3Key,
    ContentType: args.contentType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: RESTRICTED_UPLOAD_EXPIRY_SECONDS,
  });

  return { uploadUrl, s3Key };
}

/**
 * Generate a presigned download (inline view) URL for a restricted document.
 *
 * Expires in 15 minutes (900s) — shorter than the standard 1-hour expiry
 * to limit the exposure window for PII presigned URLs.
 *
 * Caller MUST write an audit_log row BEFORE calling this function (or use
 * `requireRestrictedDocumentAccess` from `@/lib/security/restricted-document-access`
 * which handles both audit and URL generation together).
 */
export async function generateRestrictedDownloadUrl(s3Key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: getBucketName(),
    Key: s3Key,
    ResponseContentDisposition: 'inline',
  });

  return getSignedUrl(s3Client, command, {
    expiresIn: RESTRICTED_DOWNLOAD_EXPIRY_SECONDS,
  });
}

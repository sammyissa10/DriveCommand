/**
 * Presigned upload for import source files.
 *
 * Reuses the existing storage layer verbatim — `generateUploadUrl` builds the
 * tenant-prefixed key, exactly as it does for truck and driver documents. The
 * only storage change this module makes anywhere is the `'imports'` category
 * added to `DocumentCategory` (audit C10). There is no second upload utility.
 *
 * Multipart is deliberately NOT used — see **DEC-10** for the full reasoning,
 * which is not a preference. In short: the existing multipart route rejects
 * anything with `entityType !== 'driver'` and allows only PDF/JPEG/PNG, so it
 * cannot carry an import at all; the repo's own strategy threshold is 5MB and
 * import sources sit well under it; and `MAX_IMPORT_FILE_BYTES` exists because
 * the server reads each file back into memory to hash and extract, so an import
 * can never reach a size where multipart pays. A file above the ceiling is
 * refused up front with a reason rather than accepted and dropped later.
 */

import { nanoid } from 'nanoid';
import { generateUploadUrl } from '@/lib/storage/presigned';
import { sanitizeFilename } from '@/lib/storage/validate';
import { MAX_OBJECT_BYTES } from '@/lib/storage/object-bytes';
import { XLSX_TYPES } from './pages';

/** What the intake screens accept. Mirrors `pages.ts` classify(). */
export const IMPORT_UPLOAD_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/csv',
  'application/csv',
] as const;

/** Server reads these back into memory, so the storage ceiling is the real one. */
export const MAX_IMPORT_FILE_BYTES = MAX_OBJECT_BYTES;

export interface UploadUrlRequest {
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface UploadUrlGrant {
  uploadUrl: string;
  storageKey: string;
  filename: string;
  contentType: string;
}

export type UploadUrlResult =
  | { ok: true; grant: UploadUrlGrant }
  | { ok: false; status: number; message: string };

/**
 * Strip the parameters off a content type.
 *
 * A CSV picked on Android arrives as `text/csv; charset=utf-8`, and an exact
 * match against the allow-list would reject it. Exported so this can be tested
 * without reaching the storage layer.
 */
export function normaliseUploadType(contentType: string): string {
  return contentType.toLowerCase().split(';')[0].trim();
}

export async function requestImportUploadUrl(
  tenantId: string,
  req: UploadUrlRequest,
): Promise<UploadUrlResult> {
  const { fileName, sizeBytes } = req;
  const contentType = normaliseUploadType(req.contentType ?? '');

  if (!fileName || !contentType || typeof sizeBytes !== 'number' || sizeBytes <= 0) {
    return { ok: false, status: 400, message: 'fileName, contentType and sizeBytes are required.' };
  }

  // DEC-4: `.xlsx` gets its own message, not a generic type error, because
  // "save it as CSV" is something the user can actually do.
  if ((XLSX_TYPES as readonly string[]).includes(contentType)) {
    return {
      ok: false,
      status: 400,
      message: 'Excel files are not supported yet. Save the sheet as CSV and upload that instead.',
    };
  }

  if (!(IMPORT_UPLOAD_TYPES as readonly string[]).includes(contentType)) {
    return {
      ok: false,
      status: 400,
      message: 'Upload a photo (JPEG, PNG or WebP), a PDF, or a CSV.',
    };
  }

  if (sizeBytes > MAX_IMPORT_FILE_BYTES) {
    return {
      ok: false,
      status: 400,
      message: `That file is too large. The limit is ${Math.round(MAX_IMPORT_FILE_BYTES / (1024 * 1024))}MB per page.`,
    };
  }

  const safeName = sanitizeFilename(fileName);
  const { uploadUrl, s3Key } = await generateUploadUrl(
    tenantId,
    'imports',
    nanoid(),
    safeName,
    contentType,
    sizeBytes,
  );

  return { ok: true, grant: { uploadUrl, storageKey: s3Key, filename: safeName, contentType } };
}

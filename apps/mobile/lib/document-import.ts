import { ownerImportsApi } from '@drivecommand/api-client'
import { fileSizeBytes, uploadFileToPresignedUrl } from './upload'

/**
 * Staging helpers for the document import screens.
 *
 * The upload itself is NOT implemented here — it delegates to `lib/upload.ts`,
 * which owns the single presigned PUT. The first Phase 2 commit copied that
 * body into this file, which is the "second upload utility next to the existing
 * one" the phase prompt warned about; this file now holds only what is specific
 * to import staging.
 */

export interface StagedPage {
  /** Stable id for reordering. Not the array index. */
  id: string
  uri: string
  name: string
  mimeType: string
  sizeBytes: number
  /** Set once uploaded — a retry must not pay for the same bytes twice. */
  storageKey?: string
  error?: string
}

let seq = 0
export function nextStagedId(): string {
  seq += 1
  return `staged-${seq}`
}

export const MAX_IMPORT_BYTES = 25 * 1024 * 1024

/** Best-effort MIME type from a local file URI. */
export function mimeFromUri(uri: string, fallback = 'image/jpeg'): string {
  const ext = uri.split('?')[0].split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'pdf':
      return 'application/pdf'
    case 'csv':
      return 'text/csv'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    default:
      return fallback
  }
}

/** Re-exported so the import screens have one import line, not two. */
export const sizeOf = fileSizeBytes

/**
 * Upload one staged page and return its tenant-prefixed storage key.
 *
 * The grant comes from the typed api-client (which knows the import endpoint
 * and its response shape); the transfer goes through the shared PUT.
 */
export async function uploadImportPage(token: string, page: StagedPage): Promise<string> {
  if (page.storageKey) return page.storageKey

  const { uploadUrl, storageKey } = await ownerImportsApi.getUploadUrl(token, {
    fileName: page.name,
    contentType: page.mimeType,
    sizeBytes: page.sizeBytes,
  })

  await uploadFileToPresignedUrl(page.uri, uploadUrl, page.mimeType)

  return storageKey
}

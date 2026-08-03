import { getInfoAsync, readAsStringAsync, EncodingType } from 'expo-file-system/legacy'
import { ownerImportsApi } from '@drivecommand/api-client'

/**
 * Upload one staged import page.
 *
 * Same shape as `lib/upload.ts` — presigned PUT straight to storage, bytes read
 * through `expo-file-system` and converted with `atob`, exactly as the incident
 * photo and driver document paths already do. The only difference is which
 * endpoint mints the URL, so the tenant key prefixing and the storage layer are
 * the existing ones rather than a second implementation.
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

export async function sizeOf(uri: string): Promise<number> {
  const info = await getInfoAsync(uri)
  return info.exists ? (info.size ?? 0) : 0
}

/** Upload one page and return its tenant-prefixed storage key. */
export async function uploadImportPage(token: string, page: StagedPage): Promise<string> {
  if (page.storageKey) return page.storageKey

  const { uploadUrl, storageKey } = await ownerImportsApi.getUploadUrl(token, {
    fileName: page.name,
    contentType: page.mimeType,
    sizeBytes: page.sizeBytes,
  })

  const base64 = await readAsStringAsync(page.uri, { encoding: EncodingType.Base64 })

  // atob is available in Hermes; this is the same conversion lib/upload.ts uses.
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': page.mimeType },
    body: bytes,
  })
  if (!res.ok) throw new Error(`Upload failed: HTTP ${res.status}`)

  return storageKey
}

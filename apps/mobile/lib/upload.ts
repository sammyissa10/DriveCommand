import { getInfoAsync, readAsStringAsync, EncodingType } from 'expo-file-system/legacy'

/**
 * The mobile upload path. One implementation, used by every caller.
 *
 * Before this consolidation the same presigned-PUT body was written out in
 * `lib/upload.ts`, `lib/document-import.ts` and `components/driver/
 * DocumentUploadSheet.tsx`, and three driver-workflow screens each had their
 * own `fetch(uploadUrl, { method: 'PUT' })`. Six copies of four lines is how a
 * header change or a retry policy ends up applied to five of them.
 *
 * `putToPresignedUrl` is now the only place a presigned PUT is issued. Anything
 * that uploads bytes on mobile calls it — directly, or through one of the
 * conveniences below.
 *
 * NOT covered, deliberately: `lib/driver-pay/uploadReceipt.ts` uses
 * `FileSystem.uploadAsync`, a native upload that never goes through `fetch` at
 * all. It is a different mechanism, not a duplicate of this one.
 */

const getBaseUrl = () => {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL
  return 'http://localhost:3000'
}

/** What a presigned PUT can carry. `Uint8Array` from a base64 read, `Blob` from a URI fetch. */
export type UploadBody = Uint8Array | Blob

export interface PresignedGrant {
  uploadUrl: string
  s3Key: string
}

/**
 * THE presigned PUT.
 *
 * Every mobile upload lands here. Throws with the HTTP status on failure —
 * callers decide how to present that.
 */
export async function putToPresignedUrl(
  uploadUrl: string,
  body: UploadBody,
  contentType: string
): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: body as BodyInit,
  })

  if (!res.ok) {
    throw new Error(`Upload failed: HTTP ${res.status}`)
  }
}

/**
 * Read a local file URI into bytes.
 *
 * Base64 via `expo-file-system`, then `atob` — which is available in Hermes.
 * React Native's `fetch(uri).blob()` also works for local files, but it is not
 * reliable for every URI scheme the pickers produce, which is why the base64
 * route is the one used for anything the user chose from a picker.
 */
export async function readFileAsBytes(uri: string): Promise<Uint8Array> {
  const base64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 })

  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Read a local file and PUT it. The common case. */
export async function uploadFileToPresignedUrl(
  uri: string,
  uploadUrl: string,
  contentType: string
): Promise<void> {
  const bytes = await readFileAsBytes(uri)
  await putToPresignedUrl(uploadUrl, bytes, contentType)
}

/**
 * Ask a mobile endpoint for a presigned grant.
 *
 * The endpoint is an argument. It used to be hardcoded to the incidents route,
 * which is exactly why the import path could not reuse this file and copied it
 * instead.
 */
export async function requestPresignedUpload(
  endpoint: string,
  token: string,
  body: { fileName: string; contentType: string; sizeBytes?: number }
): Promise<PresignedGrant> {
  const res = await fetch(`${getBaseUrl()}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to get upload URL' }))
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`)
  }

  return (await res.json()) as PresignedGrant
}

/** File size in bytes, or 0 if the file is gone. */
export async function fileSizeBytes(uri: string): Promise<number> {
  const info = await getInfoAsync(uri)
  return info.exists ? (info.size ?? 0) : 0
}

/**
 * Upload an incident photo and return its s3Key.
 *
 * Public API unchanged — `(driver)/incidents/new.tsx` calls this exactly as
 * before. Only the body is now shared.
 */
export async function uploadPhotoToS3(
  uri: string,
  token: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  const info = await getInfoAsync(uri)
  if (!info.exists) {
    throw new Error('Photo file not found')
  }

  const fileName = uri.split('/').pop() ?? 'incident-photo.jpg'
  const contentType = fileName.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'

  onProgress?.(10)

  const { uploadUrl, s3Key } = await requestPresignedUpload(
    '/api/mobile/driver/incidents/upload-photo',
    token,
    { fileName, contentType, sizeBytes: info.size ?? 0 }
  )

  onProgress?.(33)

  await uploadFileToPresignedUrl(uri, uploadUrl, contentType)

  onProgress?.(100)

  return s3Key
}

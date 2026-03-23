import { getInfoAsync, readAsStringAsync, EncodingType } from 'expo-file-system/legacy'

const getBaseUrl = () => {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL
  return 'http://localhost:3000'
}

/**
 * Upload a photo from a local URI to S3 via the mobile presigned URL endpoint.
 *
 * Flow:
 * 1. Get file info (size) using expo-file-system
 * 2. Request presigned upload URL from /api/mobile/driver/incidents/upload-photo
 * 3. Read file as base64 and PUT bytes directly to the presigned S3 URL
 * 4. Return the s3Key for use in the incident payload
 *
 * @param uri    - Local file URI (from expo-image-picker)
 * @param token  - Bearer token for API auth
 * @param onProgress - Optional progress callback (0–100)
 * @returns s3Key of the uploaded photo
 */
export async function uploadPhotoToS3(
  uri: string,
  token: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  // 1. Get file info
  const fileInfo = await getInfoAsync(uri)
  if (!fileInfo.exists) {
    throw new Error('Photo file not found')
  }

  const sizeBytes = fileInfo.size
  const fileName = uri.split('/').pop() ?? 'incident-photo.jpg'
  const contentType = fileName.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'

  onProgress?.(10)

  // 2. Request presigned upload URL
  const initRes = await fetch(`${getBaseUrl()}/api/mobile/driver/incidents/upload-photo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ fileName, contentType, sizeBytes }),
  })

  if (!initRes.ok) {
    const err = await initRes.json().catch(() => ({ error: 'Failed to get upload URL' }))
    throw new Error((err as { error?: string }).error ?? `HTTP ${initRes.status}`)
  }

  const { uploadUrl, s3Key } = (await initRes.json()) as { uploadUrl: string; s3Key: string }

  onProgress?.(33)

  // 3. Read file as base64, convert to Uint8Array, PUT to presigned URL
  const base64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 })

  // Convert base64 to binary via atob (available in Hermes)
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    body: bytes,
  })

  if (!uploadRes.ok) {
    throw new Error(`S3 upload failed: HTTP ${uploadRes.status}`)
  }

  onProgress?.(100)

  return s3Key
}

/**
 * Two-step receipt upload helper for pay component attachments.
 *
 * Flow:
 *   1. Get file info (sizeBytes) via expo-file-system
 *   2. Compress if > 2MB (up to 3 attempts with expo-image-manipulator if installed)
 *   3. POST presign → receive { uploadUrl, storageKey }
 *   4. PUT binary content to uploadUrl via FileSystem.uploadAsync
 *   5. POST confirm → receive { attachment }
 *
 * Exposed function: uploadReceipt(params) → Promise<{ id, filename }>
 */

import * as FileSystem from 'expo-file-system/legacy';

const COMPRESS_THRESHOLD = 2 * 1024 * 1024; // 2 MB
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const getBaseUrl = () => {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  return 'http://localhost:3000';
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UploadReceiptParams {
  assignmentId: string;
  componentId: string;
  uri: string;
  filename: string;
  contentType: string;
  /** Bearer token for API auth */
  token: string;
}

export interface UploadReceiptResult {
  id: string;
  filename: string;
}

// ---------------------------------------------------------------------------
// Compression helper (gracefully degrades if expo-image-manipulator not installed)
// ---------------------------------------------------------------------------

async function tryCompress(uri: string, contentType: string): Promise<string> {
  // Only attempt JPEG compression — skip for HEIC/PNG/PDF
  if (contentType !== 'image/jpeg') return uri;

  let compressed = uri;
  let attempts = 0;

  while (attempts < 3) {
    const info = await FileSystem.getInfoAsync(compressed);
    if (!info.exists) break;
    // @ts-ignore — size property exists on FileInfo
    const size: number = (info as any).size ?? 0;
    if (size <= COMPRESS_THRESHOLD) break;

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ImageManipulator = require('expo-image-manipulator') as {
        manipulateAsync: (
          uri: string,
          actions: unknown[],
          options: { compress: number; format: string },
        ) => Promise<{ uri: string }>;
        SaveFormat: { JPEG: string };
      };
      // expo-image-manipulator not installed → require throws; caught below
      const result = await ImageManipulator.manipulateAsync(
        compressed,
        [],
        {
          compress: 0.7,
          format: ImageManipulator.SaveFormat.JPEG,
        },
      );
      compressed = result.uri;
      attempts++;
    } catch {
      // expo-image-manipulator not installed — skip compression silently
      break;
    }
  }

  return compressed;
}

// ---------------------------------------------------------------------------
// uploadReceipt
// ---------------------------------------------------------------------------

/**
 * Upload a receipt photo to a pay component's attachment collection.
 *
 * @example
 * const result = await uploadReceipt({
 *   assignmentId, componentId,
 *   uri: capturedUri, filename: `receipt-${Date.now()}.jpg`,
 *   contentType: 'image/jpeg',
 *   token: session.token,
 * });
 */
export async function uploadReceipt(params: UploadReceiptParams): Promise<UploadReceiptResult> {
  const { assignmentId, componentId, uri, filename, contentType, token } = params;

  // Step 1: Get file size
  const fileInfo = await FileSystem.getInfoAsync(uri);
  if (!fileInfo.exists) {
    throw new Error('Receipt file not found at the specified URI.');
  }

  // Step 2: Compress if needed
  const finalUri = await tryCompress(uri, contentType);

  // Re-check size after compression
  const finalInfo = await FileSystem.getInfoAsync(finalUri);
  // @ts-ignore — size property
  const sizeBytes: number = (finalInfo as any).size ?? 0;

  if (sizeBytes > MAX_SIZE_BYTES) {
    throw new Error('Receipt too large — max 10MB');
  }

  const baseUrl = getBaseUrl();
  const attachmentsBase = `${baseUrl}/api/driver-pay/assignments/${assignmentId}/components/${componentId}/attachments`;

  // Step 3: Presign
  const presignRes = await fetch(`${attachmentsBase}?action=presign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ filename, contentType, sizeBytes }),
  });

  if (!presignRes.ok) {
    const err = await presignRes.json().catch(() => ({ error: 'Failed to get upload URL' }));
    throw new Error((err as { error?: string }).error ?? `Presign failed: HTTP ${presignRes.status}`);
  }

  const { uploadUrl, storageKey } = (await presignRes.json()) as {
    uploadUrl: string;
    storageKey: string;
    expiresIn: number;
  };

  // Step 4: PUT binary content to S3 using FileSystem.uploadAsync
  // (more reliable than fetch + blob for large files on RN 0.76)
  const uploadResult = await FileSystem.uploadAsync(uploadUrl, finalUri, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      'Content-Type': contentType,
    },
  });

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error(`S3 upload failed: HTTP ${uploadResult.status}`);
  }

  // Step 5: Confirm
  const confirmRes = await fetch(`${attachmentsBase}?action=confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ storageKey, filename, contentType, sizeBytes }),
  });

  if (!confirmRes.ok) {
    const err = await confirmRes.json().catch(() => ({ error: 'Failed to confirm upload' }));
    throw new Error((err as { error?: string }).error ?? `Confirm failed: HTTP ${confirmRes.status}`);
  }

  const { attachment } = (await confirmRes.json()) as {
    attachment: { id: string; filename: string };
  };

  return { id: attachment.id, filename: attachment.filename };
}

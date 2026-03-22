/**
 * File validation using magic bytes (not just Content-Type header).
 *
 * Validates file type by reading the file's magic bytes signature,
 * preventing MIME type spoofing attacks.
 */

// Allowed MIME types mapped to file extensions
export const ALLOWED_TYPES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
};

// Maximum file size: 100MB
export const MAX_FILE_SIZE = 100 * 1024 * 1024;

export interface FileValidationResult {
  valid: true;
  detectedType: string;
}

export interface FileValidationError {
  valid: false;
  error: string;
}

/**
 * Validate file type using magic bytes detection.
 *
 * @param buffer - First 4100 bytes of the file (enough for magic bytes detection)
 * @param claimedType - MIME type from Content-Type header
 * @returns Validation result with detected type or error message
 */
export async function validateFileType(
  buffer: ArrayBuffer,
  claimedType: string
): Promise<FileValidationResult | FileValidationError> {
  try {
    // Dynamic import to handle ESM-only module in Next.js server actions
    const { fileTypeFromBuffer } = await import('file-type');

    // Convert ArrayBuffer to Uint8Array for file-type
    const uint8Array = new Uint8Array(buffer);

    // Detect actual file type from magic bytes
    const detected = await fileTypeFromBuffer(uint8Array);

    if (!detected) {
      return {
        valid: false,
        error: 'Unable to detect file type from content. File may be corrupted or unsupported.',
      };
    }

    // Check if detected type is in allowed list — this is the real security check.
    // Magic bytes detection is the source of truth regardless of what the browser claims.
    if (!ALLOWED_TYPES[detected.mime]) {
      return {
        valid: false,
        error: `File type ${detected.mime} is not allowed. Allowed types: PDF, JPEG, PNG.`,
      };
    }

    // Relaxed mismatch check for mobile browser compatibility.
    // Mobile browsers (iOS Safari, Android Chrome) often report non-standard MIME types:
    //   - empty string ""      : Android gallery / unknown type
    //   - "image/heic"         : iOS camera (auto-converted to JPEG by iOS for web)
    //   - "image/heif"         : iOS HEIF variant
    //   - "application/octet-stream" : generic binary type used by some browsers
    // Only reject if the claimed type is a known allowed type that does NOT match
    // the detected type — that's an actual spoofing attempt (e.g., claim PDF, send JPEG).
    const MOBILE_PASSTHROUGH_TYPES = ['', 'image/heic', 'image/heif', 'application/octet-stream'];
    if (
      claimedType &&
      !MOBILE_PASSTHROUGH_TYPES.includes(claimedType) &&
      detected.mime !== claimedType
    ) {
      return {
        valid: false,
        error: `File type mismatch. File appears to be ${detected.mime} but was uploaded as ${claimedType}.`,
      };
    }

    return {
      valid: true,
      detectedType: detected.mime,
    };
  } catch (error) {
    return {
      valid: false,
      error: `File validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * File validation using magic bytes (not just Content-Type header).
 *
 * Validates file type by reading the file's magic bytes signature,
 * preventing MIME type spoofing attacks.
 *
 * Extended by quick-349 with:
 * - validateImageDimensions (decompression bomb protection via sharp)
 * - validatePdfPageCount (PDF bomb protection via pdfjs-dist)
 * - validateNoMacroFormats (macro-enabled Office file rejection)
 * - validateNoSvgHtml (SVG/HTML upload rejection)
 * - ValidationError class
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

    // HEIC/HEIF check: provide a specific, actionable message before the generic rejection.
    // iOS camera photos may be detected as HEIC/HEIF by magic bytes even when iOS auto-converts
    // them for web — the converted file must actually be JPEG for upload to succeed.
    if (detected.mime === 'image/heic' || detected.mime === 'image/heif') {
      return {
        valid: false,
        error: 'HEIC/HEIF image format is not supported. Please convert your photo to JPEG or PNG before uploading.',
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

// ─── Extended validators (quick-349) ───────────────────────────────────────

/**
 * Thrown when an extended upload validator rejects a file.
 */
export class ValidationError extends Error {
  public readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
  }
}

const MAX_IMAGE_DIM = 20_000;
const MAX_IMAGE_AREA = 100_000_000;
const MAX_PDF_PAGES = 1_000;

/** Macro-enabled Office extensions — these are ZIP files with embedded VBA */
const MACRO_EXTENSIONS = ['.docm', '.xlsm', '.pptm', '.dotm', '.xltm', '.potm'];

/**
 * Validate image dimensions to prevent decompression bomb attacks.
 *
 * Uses sharp's metadata() which reads only the image header (IHDR for PNG,
 * SOF for JPEG) — it does NOT decode the full pixel buffer.
 *
 * Rejects images wider or taller than 20 000 px, or with area > 100 M pixels.
 */
export async function validateImageDimensions(buffer: Buffer): Promise<void> {
  const sharp = (await import('sharp')).default;
  const meta = await sharp(buffer, { failOn: 'none' }).metadata();
  if (!meta.width || !meta.height) {
    throw new ValidationError('Unable to read image dimensions', 'INVALID_IMAGE');
  }
  if (meta.width > MAX_IMAGE_DIM || meta.height > MAX_IMAGE_DIM) {
    throw new ValidationError(
      `Image dimensions ${meta.width}x${meta.height} exceed ${MAX_IMAGE_DIM}px limit`,
      'IMAGE_TOO_LARGE'
    );
  }
  if (meta.width * meta.height > MAX_IMAGE_AREA) {
    throw new ValidationError(
      `Image area ${meta.width * meta.height} pixels exceeds ${MAX_IMAGE_AREA} pixel limit (decompression bomb)`,
      'IMAGE_TOO_LARGE'
    );
  }
}

/**
 * Validate PDF page count to prevent PDF bomb attacks.
 *
 * Uses pdfjs-dist legacy build (Node-compatible) to count pages.
 * Rejects PDFs with more than 1 000 pages.
 */
export async function validatePdfPageCount(buffer: Buffer): Promise<void> {
  // Use dynamic import + legacy build path for ESM/Node compatibility
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs' as string);
  const loadingTask = (pdfjsLib as any).getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    isEvalSupported: false,
  });
  const doc = await loadingTask.promise;
  try {
    if (doc.numPages > MAX_PDF_PAGES) {
      throw new ValidationError(
        `PDF has ${doc.numPages} pages, exceeding the ${MAX_PDF_PAGES} page limit`,
        'PDF_TOO_LARGE'
      );
    }
  } finally {
    await doc.destroy();
  }
}

/**
 * Reject macro-enabled Office formats by extension.
 *
 * Macro-enabled formats (.docm, .xlsm, .pptm, .dotm, .xltm, .potm) can
 * execute arbitrary code when opened. Block them regardless of content.
 */
export function validateNoMacroFormats(filename: string, _buffer: Buffer): void {
  const lower = filename.toLowerCase();
  for (const ext of MACRO_EXTENSIONS) {
    if (lower.endsWith(ext)) {
      throw new ValidationError(
        `Macro-enabled format ${ext} is not allowed`,
        'MACRO_FORMAT'
      );
    }
  }
}

/**
 * Reject SVG and HTML uploads.
 *
 * SVG can contain embedded scripts; HTML can be used for phishing pages.
 * Both are rejected regardless of content.
 */
export function validateNoSvgHtml(filename: string): void {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.svg') || lower.endsWith('.html') || lower.endsWith('.htm')) {
    throw new ValidationError('SVG/HTML uploads are not allowed', 'UNSAFE_FORMAT');
  }
}

/** Re-export for convenience — routes can import sanitizeFilename from here */
export { sanitizeFilename } from '@/lib/security/sanitize';

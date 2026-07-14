/**
 * Best-effort VIN barcode scan from a camera photo, using the native
 * `BarcodeDetector` API (available on most mobile Chromium browsers). VIN plates
 * on the door jamb are typically Code 39 / Data Matrix.
 *
 * Returns a sanitized 17-character VIN, or `null` when the platform can't scan
 * or no VIN-shaped code is found — callers then fall back to manual typing.
 * Never throws.
 */

type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = {
  detect(source: ImageBitmapSource): Promise<DetectedBarcode[]>;
};
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

export async function scanVinFromImage(file: File): Promise<string | null> {
  const Ctor = (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (!Ctor || typeof createImageBitmap === 'undefined') return null;

  try {
    const detector = new Ctor({ formats: ['code_39', 'code_128', 'data_matrix', 'qr_code'] });
    const bitmap = await createImageBitmap(file);
    const codes = await detector.detect(bitmap);
    for (const code of codes) {
      const raw = String(code.rawValue ?? '')
        .toUpperCase()
        .replace(/[^A-HJ-NPR-Z0-9]/g, '');
      if (raw.length === 17) return raw;
      // Some VIN barcodes embed a leading 'I' delimiter or a trailing check —
      // the VIN is the last 17 legal characters.
      if (raw.length > 17) return raw.slice(-17);
    }
    return null;
  } catch {
    return null;
  }
}

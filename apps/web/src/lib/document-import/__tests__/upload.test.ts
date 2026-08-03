/**
 * Upload-grant validation.
 *
 * Every case here returns before the storage layer is touched, so these run
 * with no S3 credentials and no network.
 */

import { describe, it, expect } from 'vitest';
import {
  requestImportUploadUrl,
  normaliseUploadType,
  IMPORT_UPLOAD_TYPES,
  MAX_IMPORT_FILE_BYTES,
} from '../upload';

const TENANT = '11111111-1111-1111-1111-111111111111';

describe('requestImportUploadUrl', () => {
  it('rejects a missing filename or size', async () => {
    const a = await requestImportUploadUrl(TENANT, {
      fileName: '',
      contentType: 'image/jpeg',
      sizeBytes: 10,
    });
    expect(a.ok).toBe(false);
    if (a.ok) return;
    expect(a.status).toBe(400);

    const b = await requestImportUploadUrl(TENANT, {
      fileName: 'page.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 0,
    });
    expect(b.ok).toBe(false);
  });

  it('names CSV when an xlsx is offered, rather than a MIME error (DEC-4)', async () => {
    const result = await requestImportUploadUrl(TENANT, {
      fileName: 'manifest.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes: 5000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/CSV/);
    expect(result.message).not.toMatch(/MIME|mime type/i);
  });

  it('rejects a type nothing downstream can read', async () => {
    const result = await requestImportUploadUrl(TENANT, {
      fileName: 'manifest.docx',
      contentType: 'application/msword',
      sizeBytes: 5000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/photo|PDF|CSV/i);
  });

  it('refuses a file larger than the server can read back into memory', async () => {
    const result = await requestImportUploadUrl(TENANT, {
      fileName: 'huge.pdf',
      contentType: 'application/pdf',
      sizeBytes: MAX_IMPORT_FILE_BYTES + 1,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/too large/i);
  });

  it('tolerates a charset suffix on the content type', () => {
    // A CSV picked on Android arrives as "text/csv; charset=utf-8"; an exact
    // match against the allow-list would reject a perfectly good file.
    const normalised = normaliseUploadType('text/csv; charset=utf-8');
    expect(normalised).toBe('text/csv');
    expect(IMPORT_UPLOAD_TYPES).toContain(normalised);
    expect(normaliseUploadType('IMAGE/JPEG')).toBe('image/jpeg');
  });

  it('accepts exactly the types the extractor can classify', () => {
    expect([...IMPORT_UPLOAD_TYPES]).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'text/csv',
      'application/csv',
    ]);
  });
});

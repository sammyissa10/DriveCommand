/**
 * Read an uploaded object back into memory, server-side.
 *
 * The import pipeline needs the actual bytes twice: once to hash them for the
 * dedupe key, and once to hand to the extractor. Both happen on the server,
 * after the browser or the phone has already PUT the file straight to storage
 * with a presigned URL — so there is no request body to read them from.
 *
 * Deliberately size-capped. `MAX_FILE_SIZE` (100MB) bounds a single upload, but
 * a sixteen-photo manifest is sixteen of those, and pulling them all into one
 * lambda's heap at once is how a function dies with no useful error.
 */

import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, getBucketName } from './s3-client';

/** Per-object ceiling. Above this we refuse rather than risk the heap. */
export const MAX_OBJECT_BYTES = 25 * 1024 * 1024;

export class ObjectTooLargeError extends Error {
  readonly sizeBytes: number;
  constructor(sizeBytes: number) {
    super(`That file is too large to read (${Math.round(sizeBytes / (1024 * 1024))}MB).`);
    this.name = 'ObjectTooLargeError';
    this.sizeBytes = sizeBytes;
  }
}

/**
 * Fetch one object's bytes.
 *
 * The caller is responsible for having validated the key's tenant prefix first
 * — use `assertTenantKey`. This function does not know who is asking.
 */
export async function getObjectBytes(s3Key: string): Promise<Buffer> {
  const res = await s3Client.send(
    new GetObjectCommand({ Bucket: getBucketName(), Key: s3Key }),
  );

  const declared = res.ContentLength ?? 0;
  if (declared > MAX_OBJECT_BYTES) throw new ObjectTooLargeError(declared);

  const body = res.Body;
  if (!body) throw new Error('Storage returned an empty object.');

  // `transformToByteArray` is present on the Node stream wrapper the AWS SDK v3
  // returns; the fallback covers a plain async iterable.
  const maybe = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof maybe.transformToByteArray === 'function') {
    const arr = await maybe.transformToByteArray();
    if (arr.byteLength > MAX_OBJECT_BYTES) throw new ObjectTooLargeError(arr.byteLength);
    return Buffer.from(arr);
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength;
    if (total > MAX_OBJECT_BYTES) throw new ObjectTooLargeError(total);
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Write bytes the server produced itself, rather than bytes a client uploaded.
 *
 * The presigned flow in `presigned.ts` exists so a browser or a phone can PUT
 * straight to storage without the file passing through a lambda. That is the
 * right shape for a user's upload and the wrong shape for an object the server
 * just generated in memory — a rendered PDF page — where round-tripping through
 * a presigned URL would mean signing a URL and then calling it from the same
 * process that already holds the bytes.
 *
 * Same bucket, same tenant-prefixed key convention, same size ceiling. The
 * caller must have built the key with the tenant prefix and validated it with
 * `assertTenantKey`; this function does not know who is asking.
 */
export async function putObjectBytes(
  s3Key: string,
  bytes: Buffer,
  contentType: string,
): Promise<void> {
  if (bytes.byteLength > MAX_OBJECT_BYTES) throw new ObjectTooLargeError(bytes.byteLength);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: s3Key,
      Body: bytes,
      ContentType: contentType,
    }),
  );
}

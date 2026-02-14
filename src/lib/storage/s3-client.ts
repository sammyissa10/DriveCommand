/**
 * S3 client singleton configured for both AWS S3 and Cloudflare R2.
 *
 * Environment variables:
 * - S3_ENDPOINT (optional): Custom endpoint for R2 or S3-compatible services
 * - S3_REGION: AWS region or 'auto' for R2
 * - S3_ACCESS_KEY_ID: AWS access key or R2 API token ID
 * - S3_SECRET_ACCESS_KEY: AWS secret key or R2 API token secret
 * - S3_BUCKET: Bucket name
 */

import { S3Client } from '@aws-sdk/client-s3';

// Lazy-evaluate config (allows module import without runtime error if vars not set yet)
function getS3Config() {
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION || 'auto';
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('S3 credentials not configured: S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY required');
  }

  return {
    region,
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    // R2 requires forcePathStyle, harmless for AWS S3
    forcePathStyle: !!endpoint,
  };
}

// Lazy-initialized S3 client singleton (only throws when actually used)
let _s3Client: S3Client | null = null;

export const s3Client = new Proxy({} as S3Client, {
  get(target, prop) {
    if (!_s3Client) {
      _s3Client = new S3Client(getS3Config());
    }
    return (_s3Client as any)[prop];
  },
});

// Lazy bucket name (throws only when accessed)
export const bucket = new Proxy(
  {},
  {
    get() {
      const bucketName = process.env.S3_BUCKET;
      if (!bucketName) {
        throw new Error('S3_BUCKET environment variable is required');
      }
      return bucketName;
    },
  }
) as string;

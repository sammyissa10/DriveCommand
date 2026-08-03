/**
 * Tenant-prefix validation for storage keys.
 *
 * Audit C9: the check `s3Key.startsWith(`tenant-${tenantId}/`)` is copy-pasted
 * inline across ~15 call sites. This is the shared helper all NEW code uses
 * instead of adding a sixteenth copy. Existing call sites are deliberately left
 * alone — repointing them is a separate, testable change.
 *
 * Keys are built by `generateUploadUrl` / `initiateMultipartUpload` as
 * `tenant-{tenantId}/{category}/{fileId}-{fileName}`. A key that does not start
 * with the caller's own tenant prefix is either a bug or an attempt to read
 * another carrier's document, and both are the same failure here.
 */

export class TenantKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantKeyError';
  }
}

/** True when `s3Key` lives under this tenant's prefix and escapes nothing. */
export function isTenantKey(s3Key: string, tenantId: string): boolean {
  if (!s3Key || !tenantId) return false;
  // Traversal never appears in a key we generated, and a key we did not
  // generate has no business being read back.
  if (s3Key.includes('..') || s3Key.includes('\\')) return false;
  return s3Key.startsWith(`tenant-${tenantId}/`);
}

/**
 * Throws `TenantKeyError` unless the key belongs to this tenant.
 *
 * The message never echoes the key back — an error string is one of the easier
 * places to leak another tenant's filename into a log or a response body.
 */
export function assertTenantKey(s3Key: string, tenantId: string): void {
  if (!isTenantKey(s3Key, tenantId)) {
    throw new TenantKeyError('Storage key does not belong to this organization.');
  }
}

/** The prefix every key for a given tenant and category shares. */
export function tenantKeyPrefix(tenantId: string, category: string): string {
  return `tenant-${tenantId}/${category}/`;
}

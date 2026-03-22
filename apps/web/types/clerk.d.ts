/**
 * Clerk type customizations
 */

export {};

declare global {
  interface UserPublicMetadata {
    role?: string;
  }

  interface UserPrivateMetadata {
    tenantId?: string;
  }
}

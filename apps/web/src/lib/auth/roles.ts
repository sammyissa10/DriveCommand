/**
 * Role definitions and authorization constants
 */

export enum UserRole {
  SYSTEM_ADMIN = 'SYSTEM_ADMIN',
  OWNER = 'OWNER',
  MANAGER = 'MANAGER',
  DRIVER = 'DRIVER',
}

/**
 * Role hierarchy for permission comparison
 * Higher numbers = more permissions
 */
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  [UserRole.SYSTEM_ADMIN]: 100,
  [UserRole.OWNER]: 50,
  [UserRole.MANAGER]: 40,
  [UserRole.DRIVER]: 10,
};

/**
 * Portal access mapping
 * Defines which roles can access which portal
 */
export const PORTAL_ROLES = {
  admin: [UserRole.SYSTEM_ADMIN],
  owner: [UserRole.OWNER, UserRole.MANAGER],
  driver: [UserRole.DRIVER],
} as const;

"use client";

/**
 * Client-side authorization guards for conditional UI rendering
 *
 * IMPORTANT: These are for UI VISIBILITY only, NOT security.
 * All security must be enforced server-side in layouts, server actions, and API routes.
 */

import { useAuth } from '@/lib/auth/auth-context';
import { UserRole } from '@/lib/auth/roles';
import type { UserPermissions } from '@/lib/auth/permissions';

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
  fallback?: React.ReactNode;
}

/**
 * RoleGuard - Conditionally render children based on user role
 *
 * @param children - Content to show if user has allowed role
 * @param allowedRoles - Array of roles that can see the content
 * @param fallback - Optional content to show if user doesn't have allowed role (defaults to null)
 *
 * @example
 * <RoleGuard allowedRoles={[UserRole.OWNER, UserRole.MANAGER]}>
 *   <button>Add Driver</button>
 * </RoleGuard>
 */
export function RoleGuard({
  children,
  allowedRoles,
  fallback = null,
}: RoleGuardProps) {
  const { user, isLoaded } = useAuth();

  // Prevent flash of content while auth loads
  if (!isLoaded) {
    return null;
  }

  const userRole = user?.role as UserRole | undefined;

  // If user doesn't have an allowed role, show fallback
  if (!userRole || !allowedRoles.includes(userRole)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

interface PermissionGuardProps {
  permission: keyof UserPermissions;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * PermissionGuard - Conditionally render children based on user permissions
 *
 * - OWNER: always shows children (unrestricted access)
 * - MANAGER: shows children only if the specific permission is granted
 * - All other roles: shows fallback
 *
 * @example
 * <PermissionGuard permission="canViewPayroll">
 *   <Link href="/payroll">Payroll</Link>
 * </PermissionGuard>
 */
export function PermissionGuard({
  permission,
  children,
  fallback = null,
}: PermissionGuardProps) {
  const { user, isLoaded } = useAuth();

  // Prevent flash of content while auth loads
  if (!isLoaded) {
    return null;
  }

  if (!user) {
    return <>{fallback}</>;
  }

  // OWNER always has access
  if (user.role === UserRole.OWNER) {
    return <>{children}</>;
  }

  // MANAGER: check the specific permission
  if (user.role === UserRole.MANAGER) {
    if (user.permissions?.[permission]) {
      return <>{children}</>;
    }
    return <>{fallback}</>;
  }

  // All other roles: show fallback
  return <>{fallback}</>;
}

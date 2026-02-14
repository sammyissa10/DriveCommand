"use client";

/**
 * Client-side authorization guards for conditional UI rendering
 *
 * IMPORTANT: These are for UI VISIBILITY only, NOT security.
 * All security must be enforced server-side in layouts, server actions, and API routes.
 */

import { useUser } from "@clerk/nextjs";
import { UserRole } from "@/lib/auth/roles";

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
  const { user, isLoaded } = useUser();

  // Prevent flash of content while Clerk loads
  if (!isLoaded) {
    return null;
  }

  // Type assertion needed until Clerk type augmentation is properly configured
  const publicMetadata = user?.publicMetadata as { role?: string } | undefined;
  const userRole = publicMetadata?.role as UserRole | undefined;

  // If user doesn't have an allowed role, show fallback
  if (!userRole || !allowedRoles.includes(userRole)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

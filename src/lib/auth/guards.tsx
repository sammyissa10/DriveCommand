"use client";

import { UserRole } from "@/lib/auth/roles";

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
  fallback?: React.ReactNode;
}

export function RoleGuard({ children }: RoleGuardProps) {
  return <>{children}</>;
}

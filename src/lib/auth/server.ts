/**
 * Server-side authentication and authorization helpers
 * Auth disabled — all functions return permissive defaults.
 */

import { prisma } from '../db/prisma';
import { UserRole } from './roles';

export async function getRole(): Promise<UserRole | null> {
  return UserRole.OWNER;
}

export async function requireAuth(): Promise<string> {
  return 'dev-user';
}

export async function requireRole(allowedRoles: UserRole[]): Promise<UserRole> {
  return allowedRoles[0];
}

export async function isSystemAdmin(): Promise<boolean> {
  return true;
}

export async function getCurrentUser() {
  return await prisma.user.findFirst();
}

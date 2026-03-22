/**
 * Server-side permission enforcement helper.
 *
 * Use after requireRole() in server actions that should be accessible to MANAGER
 * but gated by specific permissions. OWNER users always pass through.
 *
 * @example
 * export async function getPayrollRecords() {
 *   await requireRole([UserRole.OWNER, UserRole.MANAGER]);
 *   await requirePermission('canViewPayroll');
 *   // ...
 * }
 */

import { getSession } from './session';
import type { UserPermissions } from './permissions';

/**
 * Require a specific permission for the current user.
 *
 * - OWNER: always allowed (returns immediately)
 * - MANAGER: checks session.permissions — throws PERMISSION_DENIED if not granted
 * - All other roles: throws Unauthorized
 *
 * @throws {Error} 'Unauthorized' if not authenticated
 * @throws {Error} 'PERMISSION_DENIED: ...' if MANAGER lacks the required permission
 * @throws {Error} 'Unauthorized' if any other role
 */
export async function requirePermission(key: keyof UserPermissions): Promise<void> {
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized');
  }

  // OWNER always has access
  if (session.role === 'OWNER') {
    return;
  }

  // MANAGER: check the specific permission from the session
  if (session.role === 'MANAGER') {
    const perms = (session.permissions ?? {}) as UserPermissions;
    if (!perms[key]) {
      throw new Error('PERMISSION_DENIED: You do not have access to this feature');
    }
    return;
  }

  // All other roles are not authorized
  throw new Error('Unauthorized');
}

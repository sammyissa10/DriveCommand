import { getAllUsers } from '@/app/(admin)/actions/users';
import { UsersList } from './users-list';

/**
 * Tenant Users page (server component).
 * Fetches all non-sample, non-sysadmin users across every tenant
 * and passes them to the client component for display.
 * Auth guard: (admin)/layout.tsx isSystemAdmin() + getAllUsers() requireAdminAccess().
 */
export default async function UsersPage() {
  const users = await getAllUsers();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Tenant Users</h1>
        <p className="text-gray-600 mt-1">Search and view users across all tenants</p>
      </div>
      <UsersList users={users} />
    </div>
  );
}

'use client';

import { useState, useEffect, useRef } from 'react';
import { EditUserModal, type EditableUser } from '@/app/(admin)/users/edit-user-modal';
import { type AdminUserRow } from '@/app/(admin)/actions/users';

interface TenantUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: 'OWNER' | 'MANAGER' | 'DRIVER';
  isActive: boolean;
}

interface TenantUsersSectionProps {
  tenantId: string;
}

interface ChangeRoleModalUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  role: 'MANAGER' | 'DRIVER';
}

function getRoleBadgeClasses(role: string): string {
  switch (role) {
    case 'OWNER':
      return 'bg-purple-100 text-purple-700';
    case 'MANAGER':
      return 'bg-blue-100 text-blue-700';
    case 'DRIVER':
      return 'bg-green-100 text-green-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function ActionsDropdown({
  user,
  onSendReset,
  onChangeRole,
  onEdit,
}: {
  user: TenantUser;
  onSendReset: (user: TenantUser) => void;
  onChangeRole: (user: TenantUser) => void;
  onEdit: (user: TenantUser) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
        aria-label="Actions"
      >
        <span className="text-lg leading-none">⋯</span>
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-48 rounded-md border border-gray-200 bg-white shadow-lg">
          <div className="py-1">
            <button
              type="button"
              onClick={() => { setOpen(false); onEdit(user); }}
              className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            >
              Edit User
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onSendReset(user);
              }}
              className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            >
              Send Password Reset
            </button>
            {user.role !== 'OWNER' && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onChangeRole(user);
                }}
                className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                Change Role
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function TenantUsersSection({ tenantId }: TenantUsersSectionProps) {
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [resetConfirm, setResetConfirm] = useState<TenantUser | null>(null);
  const [roleModalUser, setRoleModalUser] = useState<ChangeRoleModalUser | null>(null);
  const [editingUser, setEditingUser] = useState<EditableUser | null>(null);

  useEffect(() => {
    fetch(`/api/admin/tenants/${tenantId}/users`)
      .then((r) => r.json())
      .then((data) => {
        setUsers(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [tenantId]);

  function showBanner(type: 'success' | 'error', message: string) {
    setBanner({ type, message });
    setTimeout(() => setBanner(null), 4000);
  }

  async function handleSendReset(user: TenantUser) {
    try {
      const res = await fetch('/api/auth/admin-reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, action: 'send_reset' }),
      });
      const data = await res.json();
      if (!res.ok) {
        showBanner('error', data.error || 'Failed to send reset email');
      } else {
        showBanner('success', `Password reset email sent to ${user.email}`);
      }
    } catch {
      showBanner('error', 'An unexpected error occurred');
    }
    setResetConfirm(null);
  }

  function handleRoleSuccess(updatedUser: TenantUser) {
    setUsers((prev) => prev.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
    const displayName = [updatedUser.firstName, updatedUser.lastName].filter(Boolean).join(' ') || updatedUser.email;
    showBanner('success', `Role updated to ${updatedUser.role} for ${displayName}`);
  }

  if (loading) {
    return <p className="text-sm text-gray-400">Loading users...</p>;
  }

  if (users.length === 0) {
    return <p className="text-sm text-gray-400">No users found for this tenant.</p>;
  }

  return (
    <div className="space-y-3">
      {/* Banner */}
      {banner && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            banner.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {banner.message}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <th className="pb-2 pr-4">Name</th>
              <th className="pb-2 pr-4">Email</th>
              <th className="pb-2 pr-4">Role</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="py-2.5 pr-4 font-medium text-gray-900">
                  {user.firstName || user.lastName
                    ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
                    : <span className="text-gray-400 italic">No name</span>
                  }
                </td>
                <td className="py-2.5 pr-4 text-gray-600">{user.email}</td>
                <td className="py-2.5 pr-4">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getRoleBadgeClasses(user.role)}`}
                  >
                    {user.role}
                  </span>
                </td>
                <td className="py-2.5 pr-4">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${user.isActive ? 'bg-green-500' : 'bg-gray-400'}`}
                    />
                    <span className={user.isActive ? 'text-gray-700' : 'text-gray-400'}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </td>
                <td className="py-2.5 text-right">
                  <ActionsDropdown
                    user={user}
                    onSendReset={(u) => setResetConfirm(u)}
                    onChangeRole={(u) => {
                      if (u.role !== 'OWNER') {
                        setRoleModalUser(u as ChangeRoleModalUser);
                      }
                    }}
                    onEdit={(u) => setEditingUser({
                      id: u.id,
                      firstName: u.firstName,
                      lastName: u.lastName,
                      email: u.email,
                      role: u.role,
                      isActive: u.isActive,
                    })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Reset confirm dialog */}
      {resetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setResetConfirm(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="px-4 py-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">Send Password Reset</h3>
              <p className="text-sm text-gray-600">
                Send a password reset email to <strong className="text-gray-900">{resetConfirm.email}</strong>?
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResetConfirm(null)}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSendReset(resetConfirm)}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                >
                  Send Reset Email
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Change Role modal (rendered by Task 3 component) */}
      {roleModalUser && (
        <ChangeRoleModal
          user={roleModalUser}
          onClose={() => setRoleModalUser(null)}
          onSuccess={(updatedUser) => {
            handleRoleSuccess(updatedUser);
            setRoleModalUser(null);
          }}
        />
      )}

      {/* Edit User modal */}
      <EditUserModal
        user={editingUser}
        open={editingUser !== null}
        onOpenChange={(open) => { if (!open) setEditingUser(null); }}
        onSuccess={(updated: AdminUserRow) => {
          setUsers((prev) => prev.map((u) => (u.id === updated.id
            ? { ...u, firstName: updated.firstName, lastName: updated.lastName,
                role: updated.role as 'OWNER' | 'MANAGER' | 'DRIVER', isActive: updated.isActive }
            : u)));
          const name = [updated.firstName, updated.lastName].filter(Boolean).join(' ') || updated.email;
          showBanner('success', `Updated profile for ${name}`);
        }}
      />
    </div>
  );
}

// ChangeRoleModal is co-located here and also exported for Task 3 wiring
interface ChangeRoleModalProps {
  user: ChangeRoleModalUser;
  onClose: () => void;
  onSuccess: (updatedUser: TenantUser) => void;
}

export function ChangeRoleModal({ user, onClose, onSuccess }: ChangeRoleModalProps) {
  const [selectedRole, setSelectedRole] = useState<'MANAGER' | 'DRIVER'>(user.role);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (selectedRole === user.role) {
      onClose();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: selectedRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to update role');
        setLoading(false);
        return;
      }
      onSuccess(data);
    } catch {
      setError('An unexpected error occurred');
      setLoading(false);
    }
  }

  const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'this user';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-gray-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">Change role for {displayName}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-4 py-4 space-y-3">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-2">
            {(['MANAGER', 'DRIVER'] as const).map((role) => (
              <label
                key={role}
                className="flex items-center gap-3 rounded-md border border-gray-200 px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <input
                  type="radio"
                  name="role"
                  value={role}
                  checked={selectedRole === role}
                  onChange={() => setSelectedRole(role)}
                  className="text-blue-600"
                />
                <span className="text-sm font-medium text-gray-900">{role.charAt(0) + role.slice(1).toLowerCase()}</span>
                <span
                  className={`ml-auto inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getRoleBadgeClasses(role)}`}
                >
                  {role}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-gray-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading || selectedRole === user.role}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Saving...' : 'Save Role'}
          </button>
        </div>
      </div>
    </div>
  );
}

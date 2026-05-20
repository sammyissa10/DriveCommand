'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { updateUserProfile, type AdminUserRow } from '@/app/(admin)/actions/users';

// Lighter shape accepted by the tenant-detail call site (no tenant/createdAt needed)
export interface EditableUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: 'OWNER' | 'MANAGER' | 'DRIVER';
  isActive: boolean;
}

interface EditUserModalProps {
  user: EditableUser | AdminUserRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (updated: AdminUserRow) => void;
}

export function EditUserModal({ user, open, onOpenChange, onSuccess }: EditUserModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<'OWNER' | 'MANAGER' | 'DRIVER'>('DRIVER');
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reset form whenever the user prop changes (modal reused across rows)
  useEffect(() => {
    if (user) {
      setFirstName(user.firstName ?? '');
      setLastName(user.lastName ?? '');
      setRole(user.role as 'OWNER' | 'MANAGER' | 'DRIVER');
      setIsActive(user.isActive);
      setError(null);
    }
  }, [user]);

  if (!open || !user) return null;

  function handleSave() {
    if (!user) return;
    setError(null);
    startTransition(async () => {
      const result = await updateUserProfile({
        userId: user.id,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role,
        isActive,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      onSuccess?.(result.user);
      router.refresh();
      onOpenChange(false);
    });
  }

  const canSave = !isPending && firstName.trim() !== '' && lastName.trim() !== '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => !isPending && onOpenChange(false)}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">Edit User</h3>
          <button
            type="button"
            onClick={() => !isPending && onOpenChange(false)}
            className="rounded-md p-1 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
            disabled={isPending}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-4">
          {/* Email — read-only */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-700">Email</label>
            <p className="text-sm text-gray-500">{user.email}</p>
            <p className="text-xs text-gray-400">Email cannot be changed here</p>
          </div>

          {/* First Name */}
          <div className="space-y-1">
            <label htmlFor="edit-first-name" className="block text-xs font-medium text-gray-700">
              First Name <span className="text-red-500">*</span>
            </label>
            <input
              id="edit-first-name"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              maxLength={100}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Last Name */}
          <div className="space-y-1">
            <label htmlFor="edit-last-name" className="block text-xs font-medium text-gray-700">
              Last Name <span className="text-red-500">*</span>
            </label>
            <input
              id="edit-last-name"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              maxLength={100}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Role */}
          <div className="space-y-1">
            <label htmlFor="edit-role" className="block text-xs font-medium text-gray-700">
              Role
            </label>
            <select
              id="edit-role"
              value={role}
              onChange={(e) => setRole(e.target.value as 'OWNER' | 'MANAGER' | 'DRIVER')}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="OWNER">Owner</option>
              <option value="MANAGER">Manager</option>
              <option value="DRIVER">Driver</option>
            </select>
          </div>

          {/* isActive */}
          <div className="space-y-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-900">Active</span>
            </label>
            <p className="text-xs text-gray-400 ml-6">
              Unchecking will sign the user out of all sessions
            </p>
          </div>

          {/* Error banner */}
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-gray-100 px-4 py-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

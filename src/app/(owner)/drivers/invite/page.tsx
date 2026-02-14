'use client';

import Link from 'next/link';
import { DriverForm } from '@/components/drivers/driver-invite-form';
import { inviteDriver } from '@/app/(owner)/actions/drivers';

export default function InviteDriverPage() {
  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/drivers"
          className="text-blue-600 hover:text-blue-800 font-medium"
        >
          ← Back to Drivers
        </Link>
        <h1 className="text-3xl font-bold">Invite Driver</h1>
      </div>

      {/* Invite Form */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <DriverForm
          action={inviteDriver}
          mode="invite"
          submitLabel="Send Invitation"
        />
      </div>
    </div>
  );
}

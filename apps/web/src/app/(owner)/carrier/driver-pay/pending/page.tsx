import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { PendingQueueClient } from '@/components/driver-pay/pending-queue-client';

export const metadata = { title: 'Pending Pay | DriveCommand' };

export default async function PendingPayQueuePage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const role = session.role as string;
  const isOwnerOrManager =
    role === UserRole.OWNER ||
    role === UserRole.MANAGER ||
    role === 'owner' ||
    role === 'manager';

  if (!isOwnerOrManager) redirect('/carrier/dashboard');

  return (
    <div className="flex h-full flex-col p-6">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold">Pending Pay</h1>
        <p className="text-sm text-muted-foreground">
          Review and approve driver pay for completed loads. Use ↑/↓ to navigate, A to approve, D to dispute.
        </p>
      </header>
      <PendingQueueClient />
    </div>
  );
}

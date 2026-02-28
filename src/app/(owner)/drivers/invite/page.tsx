import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { DriverForm } from '@/components/drivers/driver-invite-form';
import { inviteDriver } from '@/app/(owner)/actions/drivers';

export default function InviteDriverPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/drivers"
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back to Drivers
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Invite Driver</h1>
        <p className="mt-1 text-muted-foreground">Send an invitation to a new driver</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <DriverForm
          action={inviteDriver}
          mode="invite"
          submitLabel="Send Invitation"
        />
      </div>
    </div>
  );
}

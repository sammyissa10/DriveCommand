import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { inviteDriver } from '@/app/(owner)/actions/drivers';
import { DriverInviteForm } from './_components/DriverInviteForm';
import { Skeleton } from '@/components/ui/skeleton';

function FormSkeleton() {
  return (
    <div className="max-w-2xl space-y-8">
      <Skeleton className="h-6 w-32" />
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}

export default function DriverInvitePage() {
  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/drivers"
        className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        Back to Drivers
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Invite Driver
        </h1>
        <p className="mt-1 text-muted-foreground">
          Send an invitation to add a new driver to your fleet
        </p>
      </div>

      {/* Form */}
      <Suspense fallback={<FormSkeleton />}>
        <DriverInviteForm action={inviteDriver} />
      </Suspense>
    </div>
  );
}

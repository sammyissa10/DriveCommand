import Link from 'next/link';
import { ArrowLeft, Plus } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getActiveTemplate, listTemplatesForDriver } from '@/app/(owner)/actions/driver-compensation-templates';
import { ActiveTemplateCard } from '@/components/driver-compensation/active-template-card';
import { TemplateHistory } from '@/components/driver-compensation/template-history';
import { requireTenantId, getTenantPrisma } from '@/lib/context/tenant-context';
import { Button } from '@/components/ui/button';

interface CompensationPageProps {
  params: Promise<{ id: string }>;
}

export default async function DriverCompensationPage({ params }: CompensationPageProps) {
  const { id: driverId } = await params;

  // Look up driver name for the header
  let driverName = 'Driver';
  try {
    const tenantId = await requireTenantId();
    const prisma = await getTenantPrisma();
    // CarrierDriver is not auto-scoped — add orgId manually
    const cd = await prisma.carrierDriver.findFirst({
      where: { userId: driverId, orgId: tenantId },
      select: { firstName: true, lastName: true },
    });
    if (cd) {
      driverName = `${cd.firstName} ${cd.lastName}`;
    } else {
      // Try User model as fallback
      const user = await prisma.user.findUnique({
        where: { id: driverId },
        select: { firstName: true, lastName: true },
      });
      if (user) {
        driverName = `${user.firstName} ${user.lastName}`;
      } else {
        notFound();
      }
    }
  } catch {
    // Non-fatal — continue with fallback name
  }

  const [activeResult, historyResult] = await Promise.all([
    getActiveTemplate(driverId),
    listTemplatesForDriver(driverId),
  ]);

  const activeTemplate = activeResult.data?.template ?? null;
  const allTemplates = historyResult.data?.templates ?? [];

  const hasNoTemplates = !activeTemplate && allTemplates.length === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href={`/carrier/fleet/drivers/${driverId}`}
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back to {driverName}
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Compensation
            </h1>
            <p className="text-muted-foreground text-sm mt-1">{driverName}</p>
          </div>
          <Button asChild>
            <Link href={`/carrier/fleet/drivers/${driverId}/compensation/wizard`}>
              <Plus className="h-4 w-4 mr-1.5" />
              {activeTemplate ? 'End and replace' : 'Create template'}
            </Link>
          </Button>
        </div>
      </div>

      {/* Empty state — no templates at all */}
      {hasNoTemplates ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <span className="text-2xl">💵</span>
          </div>
          <h2 className="text-lg font-semibold text-card-foreground mb-1">
            No compensation template
          </h2>
          <p className="text-muted-foreground text-sm mb-6 max-w-sm mx-auto">
            Create a compensation template to define how this driver gets paid. Templates feed
            downstream payroll calculations.
          </p>
          <Button asChild>
            <Link href={`/carrier/fleet/drivers/${driverId}/compensation/wizard`}>
              Create compensation template
            </Link>
          </Button>
        </div>
      ) : (
        <>
          {/* Active template card */}
          <ActiveTemplateCard template={activeTemplate} driverId={driverId} />

          {/* History */}
          <TemplateHistory templates={allTemplates} />
        </>
      )}
    </div>
  );
}

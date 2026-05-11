import Link from 'next/link';
import { ArrowLeft, Plus } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getActiveTemplate, listTemplatesForDriver } from '@/app/(owner)/actions/driver-compensation-templates';
import { ActiveTemplateCard } from '@/components/driver-compensation/active-template-card';
import { TemplateHistory } from '@/components/driver-compensation/template-history';
import { requireTenantId, getTenantPrisma } from '@/lib/context/tenant-context';
import { Button } from '@/components/ui/button';
import { PayComponentsList } from '@/components/driver-pay/pay-components-list';

interface CompensationPageProps {
  params: Promise<{ id: string }>;
}

export default async function DriverCompensationPage({ params }: CompensationPageProps) {
  const { id: driverId } = await params;

  // Look up driver name for the header
  let driverName = 'Driver';
  let carrierDriverId: string | null = null;
  try {
    const tenantId = await requireTenantId();
    const prisma = await getTenantPrisma();
    // CarrierDriver is not auto-scoped — add orgId manually
    const cd = await prisma.carrierDriver.findFirst({
      where: { userId: driverId, orgId: tenantId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (cd) {
      driverName = `${cd.firstName} ${cd.lastName}`;
      carrierDriverId = cd.id;
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

  // Fetch recent assignments and their pay components for this driver
  type AssignmentWithComponents = {
    id: string;
    loadId: string;
    payStatus: string;
    load: { referenceNumber: string | null } | null;
    payComponents: {
      id: string;
      assignmentId: string;
      componentType: string;
      category: string;
      description: string;
      quantity: { toString(): string };
      unit: string;
      rate: { toString(): string };
      multiplier: { toString(): string };
      grossAmount: { toString(): string };
      isTaxable: boolean;
      isReimbursement: boolean;
      visibleToDriver: boolean;
      notes: string | null;
      enteredBy: string;
      createdAt: Date;
    }[];
  };

  let assignmentsResult: AssignmentWithComponents[] = [];
  if (carrierDriverId) {
    try {
      const tenantId = await requireTenantId();
      const prisma = await getTenantPrisma();
      assignmentsResult = await prisma.loadDriverAssignment.findMany({
        where: { driverId: carrierDriverId, deletedAt: null, tenantId },
        include: {
          load: { select: { referenceNumber: true } },
          payComponents: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
    } catch {
      // Non-fatal — default to empty array
    }
  }

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

          {/* Load assignments with pay components */}
          {assignmentsResult.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Load Assignments</h2>
              <p className="text-sm text-muted-foreground">
                Pay components for this driver&apos;s recent load assignments.
              </p>
              {assignmentsResult.map((assignment) => (
                <div key={assignment.id} className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">
                      Load{' '}
                      {assignment.load?.referenceNumber ?? assignment.loadId.slice(0, 8)}
                    </span>
                    <span className="text-xs text-muted-foreground capitalize">
                      {assignment.payStatus.toLowerCase().replace('_', ' ')}
                    </span>
                  </div>
                  <PayComponentsList
                    assignmentId={assignment.id}
                    payStatus={assignment.payStatus}
                    initialComponents={assignment.payComponents.map((c) => ({
                      id: c.id,
                      assignmentId: c.assignmentId,
                      componentType: c.componentType,
                      category: c.category,
                      description: c.description,
                      quantity: c.quantity.toString(),
                      unit: c.unit,
                      rate: c.rate.toString(),
                      multiplier: c.multiplier.toString(),
                      grossAmount: c.grossAmount.toString(),
                      isTaxable: c.isTaxable,
                      isReimbursement: c.isReimbursement,
                      visibleToDriver: c.visibleToDriver,
                      notes: c.notes,
                      enteredBy: c.enteredBy,
                      createdAt: c.createdAt.toISOString(),
                    }))}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

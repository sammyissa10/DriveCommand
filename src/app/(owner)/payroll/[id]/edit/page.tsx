import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { updatePayrollRecord } from '@/app/(owner)/actions/payroll';
import { PayrollForm } from '@/components/payroll/payroll-form';

export default async function EditPayrollPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const prisma = await getTenantPrisma();

  let record;
  try {
    record = await prisma.payrollRecord.findUnique({
      where: { id },
      include: {
        driver: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
  } catch {
    notFound();
  }

  if (!record) {
    notFound();
  }

  let drivers: Array<{ id: string; firstName: string | null; lastName: string | null }> = [];
  try {
    drivers = await prisma.user.findMany({
      where: { role: 'DRIVER', isActive: true },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: 'asc' },
    });

    // Ensure current driver is in the list even if inactive
    const currentDriverInList = drivers.some((d) => d.id === record.driverId);
    if (!currentDriverInList) {
      drivers = [record.driver, ...drivers];
    }
  } catch {
    drivers = [record.driver];
  }

  const boundAction = updatePayrollRecord.bind(null, id);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/payroll/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Record
        </Link>
      </div>
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Edit Payroll Record</h1>
        <p className="mt-1 text-muted-foreground">
          Update {record.driver.firstName} {record.driver.lastName}&apos;s record
        </p>
      </div>
      <PayrollForm
        action={boundAction}
        initialData={{
          driverId: record.driverId,
          periodStart: record.periodStart,
          periodEnd: record.periodEnd,
          basePay: record.basePay,
          bonuses: record.bonuses,
          deductions: record.deductions,
          milesLogged: record.milesLogged,
          loadsCompleted: record.loadsCompleted,
          status: record.status,
          notes: record.notes,
        }}
        drivers={drivers}
        submitLabel="Update Payroll Record"
      />
    </div>
  );
}

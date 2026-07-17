import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { createPayrollRecord } from '@/app/(owner)/actions/payroll';
import { PayrollForm } from '@/components/payroll/payroll-form';
import { PayrollFormMobile } from '@/components/payroll/PayrollFormMobile';

export default async function NewPayrollPage() {
  let drivers: Array<{ id: string; firstName: string | null; lastName: string | null }> = [];

  try {
    const prisma = await getTenantPrisma();
    drivers = await prisma.user.findMany({
      where: { role: 'DRIVER', isActive: true },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: 'asc' },
    });
  } catch {
    // Use empty array on failure
  }

  return (
    <>
      {/* Mobile-web design system view (phone widths only) */}
      <div className="lg:hidden -m-4">
        <PayrollFormMobile
          action={createPayrollRecord}
          title="New Payroll Record"
          backHref="/payroll"
          submitLabel="Create Payroll Record"
          drivers={drivers}
        />
      </div>

      {/* Desktop view (lg and up) — unchanged */}
      <div className="hidden lg:block space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/payroll"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Payroll
          </Link>
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">New Payroll Record</h1>
          <p className="mt-1 text-muted-foreground">Create a payroll entry for a driver</p>
        </div>
        <PayrollForm action={createPayrollRecord} drivers={drivers} submitLabel="Create Payroll Record" />
      </div>
    </>
  );
}

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Pencil } from 'lucide-react';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { deletePayrollRecord } from '@/app/(owner)/actions/payroll';
import { DeletePayrollButton } from '@/components/payroll/delete-payroll-button';

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  PAID: 'bg-green-100 text-green-700',
};

export default async function PayrollDetailPage({
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
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
  } catch {
    notFound();
  }

  if (!record) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/payroll"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Payroll
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {record.driver.firstName ?? ''} {record.driver.lastName ?? ''}
          </h1>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {new Date(record.periodStart).toLocaleDateString()} &ndash;{' '}
              {new Date(record.periodEnd).toLocaleDateString()}
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[record.status]}`}
            >
              {record.status}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/payroll/${id}/edit`}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-sm hover:bg-accent transition-colors"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </Link>
          <DeletePayrollButton
            recordId={id}
            status={record.status}
            deleteAction={deletePayrollRecord}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pay breakdown */}
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Pay Breakdown
          </h3>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Base Pay</dt>
              <dd className="font-medium">
                ${Number(record.basePay).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">+ Bonuses</dt>
              <dd className="font-medium text-green-600">
                +${Number(record.bonuses).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">- Deductions</dt>
              <dd className="font-medium text-red-600">
                -${Number(record.deductions).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
              <dt>= Total Pay</dt>
              <dd>
                ${Number(record.totalPay).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </dd>
            </div>
          </dl>

          {record.paidAt && (
            <div className="mt-4 pt-3 border-t border-border text-sm">
              <span className="text-muted-foreground">Paid on: </span>
              <span className="font-medium text-green-600">
                {new Date(record.paidAt).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>

        {/* Performance metrics */}
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Performance
          </h3>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Miles Logged</dt>
              <dd className="text-xl font-bold">{record.milesLogged.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Loads Completed</dt>
              <dd className="text-xl font-bold">{record.loadsCompleted}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Driver</dt>
              <dd className="font-medium">{record.driver.email}</dd>
            </div>
          </dl>
        </div>
      </div>

      {record.notes && (
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Notes
          </h3>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{record.notes}</p>
        </div>
      )}
    </div>
  );
}

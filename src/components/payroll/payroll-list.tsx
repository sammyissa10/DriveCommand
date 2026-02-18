'use client';

import Link from 'next/link';
import { DollarSign } from 'lucide-react';

interface PayrollRecord {
  id: string;
  driver: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
  periodStart: Date;
  periodEnd: Date;
  basePay: any;
  bonuses: any;
  deductions: any;
  totalPay: any;
  milesLogged: number;
  loadsCompleted: number;
  status: string;
}

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  PAID: 'bg-green-100 text-green-700',
};

export function PayrollList({ records }: { records: PayrollRecord[] }) {
  if (records.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-12 text-center">
        <DollarSign className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-semibold">No payroll records yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Create your first payroll record to start tracking driver compensation.
        </p>
        <Link
          href="/payroll/new"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          New Payroll Record
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Driver</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Period</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Base Pay</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Bonuses</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Deductions</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total Pay</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr
                key={record.id}
                className="border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/payroll/${record.id}`}
                    className="font-medium text-foreground hover:text-primary transition-colors"
                  >
                    {record.driver.firstName} {record.driver.lastName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(record.periodStart).toLocaleDateString()} &ndash;{' '}
                  {new Date(record.periodEnd).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[record.status]}`}
                  >
                    {record.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  ${Number(record.basePay).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-right text-green-600">
                  +${Number(record.bonuses).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-right text-red-600">
                  -${Number(record.deductions).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-right font-bold">
                  ${Number(record.totalPay).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

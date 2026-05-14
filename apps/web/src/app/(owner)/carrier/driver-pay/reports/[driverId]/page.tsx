/**
 * /carrier/driver-pay/reports/[driverId] — Per-Driver Detail Report (server component)
 */

import React from 'react';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { UserRole } from '@/lib/auth/roles';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Download } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { computeDriverDetail } from '@/lib/driver-pay/reporting';
import { KpiCard } from '../_components/KpiCard';
import { NetPaySparkline } from '../_components/NetPaySparkline';

export const metadata = { title: 'Driver Pay Detail | DriveCommand' };

function formatMoney(val: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    parseFloat(val),
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return format(parseISO(iso), 'MMM d, yyyy');
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'DRAFT':
      return <Badge variant="secondary">Draft</Badge>;
    case 'FINALIZED':
      return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Finalized</Badge>;
    case 'PAID':
      return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Paid</Badge>;
    case 'VOIDED':
      return <Badge variant="destructive">Voided</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function formatBonusType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function DriverDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ driverId: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const role = session.role.toUpperCase();
  if (role === UserRole.DRIVER) redirect('/driver');
  const isManagerOrAbove =
    role === UserRole.OWNER || role === UserRole.MANAGER || role === UserRole.SYSTEM_ADMIN;
  if (!isManagerOrAbove) redirect('/carrier/dashboard');

  const { driverId } = await params;
  const sp = await searchParams;
  const yearStr = sp?.year;
  const year = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear();
  const safeYear = isNaN(year) ? new Date().getFullYear() : year;

  const prisma = await getTenantPrisma();
  const detail = await computeDriverDetail(prisma, session.tenantId, driverId, safeYear);

  if (!detail) {
    notFound();
  }

  const { driver, ytd, settlements, bonuses, deductionBalances, last4NetPay } = detail;

  return (
    <div className="flex h-full flex-col p-6 gap-6">
      {/* Header */}
      <header>
        <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
          <Link href="/carrier/driver-pay" className="hover:text-foreground">
            Driver Pay
          </Link>
          <span>/</span>
          <Link href="/carrier/driver-pay/reports" className="hover:text-foreground">
            Reports
          </Link>
          <span>/</span>
          <span className="text-foreground">{driver.firstName} {driver.lastName}</span>
        </nav>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">
            {driver.firstName} {driver.lastName}
          </h1>
          <Badge variant="secondary" className="capitalize">
            {driver.employmentType.replace(/_/g, ' ')}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">YTD report for {safeYear}</p>
      </header>

      {/* YTD KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard label="YTD Earnings" value={ytd.earnings} deltaPct={null} isMoney />
        <KpiCard label="YTD Deductions" value={ytd.deductions} deltaPct={null} isMoney />
        <KpiCard label="YTD Bonuses" value={ytd.bonuses} deltaPct={null} isMoney />
      </div>

      {/* Settlements (YTD) */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Settlements (YTD)</h2>
          <div className="flex items-center gap-2">
            {/* TODO(phase-11): Wire to Phase 11 export engine when shipped */}
            <Button
              variant="outline"
              size="sm"
              onClick={undefined}
              title="TODO: Wire to Phase 11 export engine"
              className="gap-1"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </div>
        {settlements.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No finalized or paid settlements for {safeYear}.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Gross Taxable</TableHead>
                  <TableHead className="text-right">Gross Non-Tax</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">Net Pay</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Paid At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settlements.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-sm">
                      {format(parseISO(s.periodStart), 'MMM d')} – {format(parseISO(s.periodEnd), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatMoney(s.grossTaxable)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatMoney(s.grossNonTaxable)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatMoney(s.totalDeductions)}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold">{formatMoney(s.netPay)}</TableCell>
                    <TableCell><StatusBadge status={s.status} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(s.paidAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Bonuses (YTD) */}
      <section>
        <h2 className="text-base font-semibold mb-3">Bonuses Earned (YTD)</h2>
        {bonuses.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No bonuses for {safeYear}.</p>
        ) : (
          <div className="grid gap-2">
            {bonuses.map((b) => (
              <Card key={b.id} className="flex flex-row items-center px-4 py-3 gap-4">
                <div className="flex-1">
                  <p className="font-medium text-sm">{formatBonusType(b.bonusType)}</p>
                  <p className="text-xs text-muted-foreground">
                    {b.installmentNumber != null && b.totalInstallments != null
                      ? `Installment ${b.installmentNumber}/${b.totalInstallments} · `
                      : ''}
                    Awarded {formatDate(b.awardedAt)}
                  </p>
                </div>
                <p className="font-semibold text-sm">{formatMoney(b.amount)}</p>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Deduction Balances (Fixed Installments) */}
      <section>
        <h2 className="text-base font-semibold mb-3">Deduction Balances (Fixed Installments)</h2>
        {deductionBalances.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No active fixed-installment deductions.</p>
        ) : (
          <div className="grid gap-3">
            {deductionBalances.map((d) => (
              <Card key={d.id}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium">
                      {d.deductionType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatMoney(d.amountCollected)} / {formatMoney(d.totalAmount)}
                    </p>
                  </div>
                  <div className="h-2 bg-muted rounded overflow-hidden">
                    <div
                      style={{ width: `${Math.min(100, parseFloat(d.percentComplete))}%` }}
                      className="h-2 bg-primary rounded transition-all"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{d.percentComplete}% collected</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Net Pay Trend (Last 4 Settlements) */}
      <section>
        <h2 className="text-base font-semibold mb-3">Net Pay Trend (Last 4 Settlements)</h2>
        {last4NetPay.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No settlement history available.</p>
        ) : (
          <Card>
            <CardContent className="pt-4">
              <NetPaySparkline data={last4NetPay} />
              <div className="mt-2 flex justify-between text-xs text-muted-foreground px-1">
                {[...last4NetPay].reverse().map((p) => (
                  <span key={p.periodEnd}>{format(parseISO(p.periodEnd), 'MMM d')}</span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

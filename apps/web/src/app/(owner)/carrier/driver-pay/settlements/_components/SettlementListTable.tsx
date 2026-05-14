'use client';

import React from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { formatPayPeriodDate } from '@/lib/utils/date';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SettlementRow {
  id: string;
  settlementReference: string | null;
  driverId: string;
  driver: { firstName: string; lastName: string } | null;
  periodStart: string;
  periodEnd: string;
  netPay: string;
  status: string;
  createdAt: string;
}

interface Props {
  settlements: SettlementRow[];
  totalCount: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'DRAFT':
      return (
        <Badge variant="secondary" className="bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          Draft
        </Badge>
      );
    case 'FINALIZED':
      return (
        <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
          Finalized
        </Badge>
      );
    case 'PAID':
      return (
        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          Paid
        </Badge>
      );
    case 'VOIDED':
      return (
        <Badge variant="secondary" className="bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500 line-through">
          Voided
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatMoney(val: string): string {
  const n = parseFloat(val);
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SettlementListTable({
  settlements,
  totalCount,
  page,
  pageSize,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const totalPages = Math.ceil(totalCount / pageSize);

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(p));
    router.push(`${pathname}?${params.toString()}`);
  }

  if (settlements.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-semibold text-foreground">No settlements yet</p>
        <p className="mt-2 text-sm text-muted-foreground max-w-sm">
          Run your first Friday settlement to generate driver pay statements.
        </p>
        <Button className="mt-6" onClick={() => router.push('/carrier/driver-pay/settlements/generate')}>
          Generate Settlements
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Table>
        <TableCaption className="sr-only">Driver settlement records</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Reference</TableHead>
            <TableHead>Driver</TableHead>
            <TableHead>Period</TableHead>
            <TableHead className="text-right">Net Pay</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {settlements.map((s) => (
            <TableRow
              key={s.id}
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => router.push(`/carrier/driver-pay/settlements/${s.id}`)}
            >
              <TableCell className="font-mono text-xs text-muted-foreground">
                {s.settlementReference ?? s.id.slice(0, 8)}
              </TableCell>
              <TableCell className="font-medium">
                {s.driver
                  ? `${s.driver.firstName} ${s.driver.lastName}`
                  : s.driverId.slice(0, 8)}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatPayPeriodDate(s.periodStart, { month: 'short', day: 'numeric', year: 'numeric' })} – {formatPayPeriodDate(s.periodEnd, { month: 'short', day: 'numeric', year: 'numeric' })}
              </TableCell>
              <TableCell className="text-right font-semibold">
                {formatMoney(s.netPay)}
              </TableCell>
              <TableCell>
                <StatusBadge status={s.status} />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDate(s.createdAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-sm text-muted-foreground">
            {totalCount} total · Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => goToPage(page - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => goToPage(page + 1)}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

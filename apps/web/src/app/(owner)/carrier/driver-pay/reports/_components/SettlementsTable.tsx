'use client';

/**
 * SettlementsTable — Client component.
 * Fetches /api/driver-pay/reports/settlements with pagination + sorting.
 * Displays anomaly badge when isAnomaly=true.
 */

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Download } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface SettlementRow {
  id: string;
  driverId: string;
  driverName: string | null;
  periodStart: string;
  periodEnd: string;
  grossTaxable: string;
  grossNonTaxable: string;
  totalDeductions: string;
  netPay: string;
  status: string;
  paidAt: string | null;
  isAnomaly: boolean;
}

interface ApiResponse {
  rows: SettlementRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface InitialQuery {
  period: string;
  driverIds?: string[];
  employmentType?: string;
  status?: string;
}

interface Props {
  initialQuery: InitialQuery;
}

type SortBy = 'periodEnd' | 'netPay' | 'driverName' | 'status';

function formatMoney(val: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    parseFloat(val),
  );
}

function formatPeriod(start: string, end: string): string {
  return `${format(parseISO(start), 'MMM d')} – ${format(parseISO(end), 'MMM d')}`;
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

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return null;
  return dir === 'asc' ? (
    <ArrowUp className="inline ml-1 h-3 w-3" />
  ) : (
    <ArrowDown className="inline ml-1 h-3 w-3" />
  );
}

export function SettlementsTable({ initialQuery }: Props) {
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortBy>('periodEnd');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        period: initialQuery.period,
        page: String(page),
        pageSize: '25',
        sortBy,
        sortDir,
      });
      if (initialQuery.driverIds?.length) {
        params.set('driverIds', initialQuery.driverIds.join(','));
      }
      if (initialQuery.employmentType && initialQuery.employmentType !== 'ALL') {
        params.set('employmentType', initialQuery.employmentType);
      }
      if (initialQuery.status && initialQuery.status !== 'ALL') {
        params.set('status', initialQuery.status);
      }

      const res = await fetch(`/api/driver-pay/reports/settlements?${params.toString()}`);
      if (res.ok) {
        const json = await res.json() as ApiResponse;
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  }, [page, sortBy, sortDir, initialQuery]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  function handleSort(col: SortBy) {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
    setPage(1);
  }

  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const start = (page - 1) * 25 + 1;
  const end = Math.min(page * 25, total);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Settlements</h2>
        <div className="flex items-center gap-2">
          {/* TODO(phase-11): Wire to Phase 11 export engine when shipped */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => alert('CSV export wires up in Phase 11')}
            title="TODO: Wire to Phase 11 export engine"
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => handleSort('driverName')}
                  >
                    Driver <SortIcon active={sortBy === 'driverName'} dir={sortDir} />
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => handleSort('periodEnd')}
                  >
                    Period <SortIcon active={sortBy === 'periodEnd'} dir={sortDir} />
                  </TableHead>
                  <TableHead className="text-right">Gross Taxable</TableHead>
                  <TableHead className="text-right">Gross Non-Tax</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead
                    className="text-right cursor-pointer select-none"
                    onClick={() => handleSort('netPay')}
                  >
                    Net Pay <SortIcon active={sortBy === 'netPay'} dir={sortDir} />
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => handleSort('status')}
                  >
                    Status <SortIcon active={sortBy === 'status'} dir={sortDir} />
                  </TableHead>
                  <TableHead>Anomaly</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!data?.rows || data.rows.length === 0) ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No settlements in this period
                    </TableCell>
                  </TableRow>
                ) : (
                  data.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Link
                          href={`/carrier/driver-pay/reports/${row.driverId}`}
                          className="font-medium hover:underline"
                        >
                          {row.driverName ?? 'Unknown Driver'}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatPeriod(row.periodStart, row.periodEnd)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatMoney(row.grossTaxable)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatMoney(row.grossNonTaxable)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatMoney(row.totalDeductions)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">
                        {formatMoney(row.netPay)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell>
                        {row.isAnomaly && (
                          <Badge variant="destructive" className="text-xs">
                            Anomaly
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {total > 0 ? `Showing ${start}–${end} of ${total}` : 'No results'}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

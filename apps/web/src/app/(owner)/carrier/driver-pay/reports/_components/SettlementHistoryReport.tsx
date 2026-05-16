'use client';

/**
 * SettlementHistoryReport — Full all-status settlement history, sortable + paginated.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { BigNumberHero } from './BigNumberHero';
import { CsvExportButton } from './CsvExportButton';
import { ReportTableSkeleton } from './ReportTableSkeleton';
import { fmtMoney, fmtDate } from './format';

interface SettlementHistoryRow {
  id: string;
  driverId: string;
  driverName: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  grossTaxable: string;
  grossNonTaxable: string;
  totalDeductions: string;
  netPay: string;
  paidAt: string | null;
  isAnomaly: boolean;
}

interface ApiResult {
  bigNumber: string;
  deltaPct: number | null;
  priorTotal: string;
  statusCounts: Record<string, number>;
  page: number;
  pageSize: number;
  totalCount: number;
  rows: SettlementHistoryRow[];
}

interface Props {
  period: string;
  customStart?: string;
  customEnd?: string;
  driverIds?: string[];
}

type SortKey = 'periodEnd' | 'netPay' | 'status' | 'driverName';

const EMPTY_MSG = 'No data for this period. Try selecting a different date range.';

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'DRAFT':
      return <Badge variant="secondary" className="text-xs">Draft</Badge>;
    case 'PENDING_REVIEW':
      return <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300 text-xs">Pending Review</Badge>;
    case 'FINALIZED':
      return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 text-xs">Finalized</Badge>;
    case 'PAID':
      return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-xs">Paid</Badge>;
    case 'VOIDED':
      return <Badge variant="destructive" className="text-xs">Voided</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{status}</Badge>;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return null;
  return dir === 'asc'
    ? <ArrowUp className="inline ml-1 h-3 w-3" />
    : <ArrowDown className="inline ml-1 h-3 w-3" />;
}

const STATUS_ORDER = ['DRAFT', 'PENDING_REVIEW', 'FINALIZED', 'PAID', 'VOIDED'];

export function SettlementHistoryReport({ period, customStart, customEnd, driverIds }: Props) {
  const [data, setData] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortKey>('periodEnd');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period, page: String(page), pageSize: '25', sortBy, sortDir });
      if (customStart) params.set('customStart', customStart);
      if (customEnd) params.set('customEnd', customEnd);
      if (driverIds?.length) {
        for (const id of driverIds) params.append('driverIds', id);
      }
      const res = await fetch(`/api/driver-pay/reports/settlement-history?${params.toString()}`);
      if (res.ok) {
        const json = await res.json() as ApiResult;
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  }, [period, customStart, customEnd, driverIds, page, sortBy, sortDir]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  function handleSort(col: SortKey) {
    if (sortBy === col) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
    setPage(1);
  }

  const totalPages = data ? Math.ceil(data.totalCount / 25) : 1;

  const csvParams: Record<string, string | string[] | undefined> = {
    period,
    customStart,
    customEnd,
    driverIds,
    sortBy,
    sortDir,
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Settlement History</CardTitle>
          <CsvExportButton endpoint="/api/driver-pay/reports/settlement-history" params={csvParams} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <ReportTableSkeleton rows={5} columns={9} />
        ) : !data || data.rows.length === 0 ? (
          <>
            {data && (
              <BigNumberHero
                value={fmtMoney(data.bigNumber)}
                subtitle="Total paid this period"
                deltaPct={data.deltaPct}
              />
            )}
            <p className="text-center text-sm text-muted-foreground py-8">{EMPTY_MSG}</p>
          </>
        ) : (
          <>
            <BigNumberHero
              value={fmtMoney(data.bigNumber)}
              subtitle="Total paid this period"
              deltaPct={data.deltaPct}
            />

            {/* Status count chips */}
            <div className="flex flex-wrap gap-2">
              {STATUS_ORDER.filter((s) => data.statusCounts[s] !== undefined).map((status) => (
                <div key={status} className="flex items-center gap-1">
                  <StatusBadge status={status} />
                  <span className="text-sm font-medium">{data.statusCounts[status]}</span>
                </div>
              ))}
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSort('driverName')}>
                      Driver <SortIcon active={sortBy === 'driverName'} dir={sortDir} />
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSort('periodEnd')}>
                      Period <SortIcon active={sortBy === 'periodEnd'} dir={sortDir} />
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSort('status')}>
                      Status <SortIcon active={sortBy === 'status'} dir={sortDir} />
                    </TableHead>
                    <TableHead className="text-right">Gross Taxable</TableHead>
                    <TableHead className="text-right">Gross Non-Tax</TableHead>
                    <TableHead className="text-right">Deductions</TableHead>
                    <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort('netPay')}>
                      Net Pay <SortIcon active={sortBy === 'netPay'} dir={sortDir} />
                    </TableHead>
                    <TableHead>Paid At</TableHead>
                    <TableHead>Anomaly</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium text-sm">{row.driverName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {fmtDate(row.periodStart)} – {fmtDate(row.periodEnd)}
                      </TableCell>
                      <TableCell><StatusBadge status={row.status} /></TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtMoney(row.grossTaxable)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtMoney(row.grossNonTaxable)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtMoney(row.totalDeductions)}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">{fmtMoney(row.netPay)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.paidAt ? fmtDate(row.paidAt) : '—'}
                      </TableCell>
                      <TableCell>
                        {row.isAnomaly && (
                          <Badge variant="destructive" className="text-xs">Anomaly</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {data.totalCount > 0
                  ? `Showing ${(page - 1) * 25 + 1}–${Math.min(page * 25, data.totalCount)} of ${data.totalCount}`
                  : 'No results'}
              </span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                  Prev
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

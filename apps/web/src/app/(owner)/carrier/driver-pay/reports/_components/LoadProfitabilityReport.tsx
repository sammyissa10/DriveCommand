'use client';

/**
 * LoadProfitabilityReport — Per-load revenue minus driver pay, sortable + paginated.
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
import { ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { BigNumberHero } from './BigNumberHero';
import { CsvExportButton } from './CsvExportButton';
import { ReportTableSkeleton } from './ReportTableSkeleton';
import { fmtMoney, fmtDate } from './format';

interface LoadProfitabilityRow {
  loadId: string;
  referenceNumber: string | null;
  clientName: string | null;
  revenue: string;
  totalDriverPay: string;
  profit: string;
  profitMarginPct: number | null;
  driverCount: number;
  createdAt: string;
}

interface ApiResult {
  bigNumber: string;
  deltaPct: number | null;
  priorTotal: string;
  page: number;
  pageSize: number;
  totalCount: number;
  rows: LoadProfitabilityRow[];
}

interface Props {
  period: string;
  customStart?: string;
  customEnd?: string;
  driverIds?: string[];
}

type SortKey = 'profit' | 'profitMarginPct' | 'revenue' | 'totalDriverPay' | 'createdAt';

const EMPTY_MSG = 'No data for this period. Try selecting a different date range.';

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return null;
  return dir === 'asc'
    ? <ArrowUp className="inline ml-1 h-3 w-3" />
    : <ArrowDown className="inline ml-1 h-3 w-3" />;
}

export function LoadProfitabilityReport({ period, customStart, customEnd, driverIds }: Props) {
  const [data, setData] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortKey>('createdAt');
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
      const res = await fetch(`/api/driver-pay/reports/load-profitability?${params.toString()}`);
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
          <CardTitle className="text-base font-semibold">Load Profitability</CardTitle>
          <CsvExportButton endpoint="/api/driver-pay/reports/load-profitability" params={csvParams} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <ReportTableSkeleton rows={5} columns={8} />
        ) : !data || data.rows.length === 0 ? (
          <>
            {data && (
              <BigNumberHero
                value={fmtMoney(data.bigNumber)}
                subtitle="Total profit this period"
                deltaPct={data.deltaPct}
              />
            )}
            <p className="text-center text-sm text-muted-foreground py-8">{EMPTY_MSG}</p>
          </>
        ) : (
          <>
            <BigNumberHero
              value={fmtMoney(data.bigNumber)}
              subtitle="Total profit this period"
              deltaPct={data.deltaPct}
            />
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Load Ref</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort('revenue')}>
                      Revenue <SortIcon active={sortBy === 'revenue'} dir={sortDir} />
                    </TableHead>
                    <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort('totalDriverPay')}>
                      Driver Pay <SortIcon active={sortBy === 'totalDriverPay'} dir={sortDir} />
                    </TableHead>
                    <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort('profit')}>
                      Profit <SortIcon active={sortBy === 'profit'} dir={sortDir} />
                    </TableHead>
                    <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort('profitMarginPct')}>
                      Margin % <SortIcon active={sortBy === 'profitMarginPct'} dir={sortDir} />
                    </TableHead>
                    <TableHead className="text-right">Drivers</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSort('createdAt')}>
                      Created <SortIcon active={sortBy === 'createdAt'} dir={sortDir} />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => (
                    <TableRow key={row.loadId}>
                      <TableCell className="font-medium text-sm">{row.referenceNumber ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{row.clientName ?? '—'}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtMoney(row.revenue)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtMoney(row.totalDriverPay)}</TableCell>
                      <TableCell className={`text-right font-mono text-sm font-semibold ${parseFloat(row.profit) < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {fmtMoney(row.profit)}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {row.profitMarginPct != null ? `${row.profitMarginPct.toFixed(1)}%` : '—'}
                      </TableCell>
                      <TableCell className="text-right text-sm">{row.driverCount}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{fmtDate(row.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
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
